-- =========================================================================
-- Employee Merge Tool — Phase 1 (retry: helper defined before consumer)
-- =========================================================================

-- 1. Tracking column on employees ------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS merged_into_employee_id uuid
    REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_merged_into
  ON public.employees(merged_into_employee_id)
  WHERE merged_into_employee_id IS NOT NULL;

COMMENT ON COLUMN public.employees.merged_into_employee_id IS
  'When non-NULL, this employee row was consolidated into the referenced master employee. No new operational/payroll writes are allowed against this id.';

-- 2. Lightweight unaccent helper (defined first so other functions can use it)
CREATE OR REPLACE FUNCTION public.unaccent_safe(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT translate(
    COALESCE(_input,''),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$;

-- 3. Guard: block writes that reference a merged employee ----------------
CREATE OR REPLACE FUNCTION public.block_writes_on_merged_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _merged_into uuid;
  _name text;
BEGIN
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT merged_into_employee_id,
         COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')
    INTO _merged_into, _name
    FROM public.employees
   WHERE id = NEW.employee_id;

  IF _merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGED: % was consolidated into employee %; use the master id for new writes.',
      _name, _merged_into
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  _t text;
  _tables text[] := ARRAY[
    'shift_assignments',
    'time_entries',
    'movements',
    'period_base_pay',
    'clock_events',
    'shift_attendance_confirmations',
    'payroll_adjustments',
    'employee_financial_ledger',
    'employee_financial_records'
  ];
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=_t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_block_writes_merged_employee ON public.%I', _t);
      EXECUTE format(
        'CREATE TRIGGER trg_block_writes_merged_employee
           BEFORE INSERT OR UPDATE OF employee_id ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.block_writes_on_merged_employee()',
        _t
      );
    END IF;
  END LOOP;
END$$;

-- 4. Locked-payroll detector ---------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_has_locked_payroll(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.period_base_pay pbp
      JOIN public.pay_periods pp ON pp.id = pbp.period_id
     WHERE pbp.employee_id = _employee_id
       AND pp.status IN ('closed','published','paid')
  ) OR EXISTS (
    SELECT 1
      FROM public.movements m
      JOIN public.pay_periods pp ON pp.id = m.period_id
     WHERE m.employee_id = _employee_id
       AND pp.status IN ('closed','published','paid')
  );
$$;

-- 5. Duplicate-group finder ----------------------------------------------
CREATE OR REPLACE FUNCTION public.find_employee_duplicate_groups(_company_id uuid)
RETURNS TABLE(
  group_key text,
  match_type text,
  employee_ids uuid[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT id,
           regexp_replace(COALESCE(phone_number,''), '\D', '', 'g') AS phone_norm,
           lower(trim(COALESCE(email,''))) AS email_norm,
           lower(regexp_replace(
             public.unaccent_safe(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')),
             '[^a-z0-9 ]', '', 'gi')) AS name_norm
      FROM public.employees
     WHERE company_id = _company_id
       AND merged_into_employee_id IS NULL
  )
  SELECT phone_norm AS group_key, 'phone'::text AS match_type, array_agg(id) AS employee_ids
    FROM base
   WHERE length(phone_norm) >= 7
   GROUP BY phone_norm
  HAVING count(*) > 1
  UNION ALL
  SELECT email_norm, 'email', array_agg(id)
    FROM base
   WHERE email_norm <> ''
   GROUP BY email_norm
  HAVING count(*) > 1
  UNION ALL
  SELECT name_norm, 'name', array_agg(id)
    FROM base
   WHERE length(trim(name_norm)) >= 4
   GROUP BY name_norm
  HAVING count(*) > 1;
$$;

-- 6. The merge RPC -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_employees(
  _master_id uuid,
  _duplicate_ids uuid[],
  _confirm_master_name text,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _master public.employees%ROWTYPE;
  _dup public.employees%ROWTYPE;
  _dup_id uuid;
  _company_id uuid;
  _expected_name text;
  _moved jsonb := '{}'::jsonb;
  _summary jsonb := '[]'::jsonb;
  _is_admin boolean;
  _row_count bigint;
  _table text;
  _backfill_sql text;
  _backfill_cols text[] := ARRAY[
    'phone_number','email','employer_identification','avatar_url',
    'date_of_birth','birthday','address','address_line','address_city',
    'address_state','address_zip','county','country_code','gender',
    'employee_role','english_level','emergency_contact_name',
    'emergency_contact_phone','ssn_last4','verification_ssn_ein',
    'professional_summary','start_date','user_id','access_pin',
    'connecteam_employee_id'
  ];
  _col text;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _master_id IS NULL OR _duplicate_ids IS NULL OR array_length(_duplicate_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: master id and at least one duplicate id are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF _master_id = ANY(_duplicate_ids) THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: master cannot also appear in the duplicate list'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO _master FROM public.employees WHERE id = _master_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: master employee % not found', _master_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF _master.merged_into_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: master % is itself merged into %', _master_id, _master.merged_into_employee_id
      USING ERRCODE = 'check_violation';
  END IF;

  _company_id := _master.company_id;

  _is_admin := public.user_is_company_admin(_actor, _company_id);
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: only company admins/owners may merge employees'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _expected_name := lower(regexp_replace(
    COALESCE(_master.first_name,'') || ' ' || COALESCE(_master.last_name,''),
    '\s+', ' ', 'g'
  ));
  IF _expected_name <> lower(regexp_replace(COALESCE(_confirm_master_name,''), '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_BAD_CONFIRMATION: confirmation name does not match master'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Per-duplicate validation
  FOREACH _dup_id IN ARRAY _duplicate_ids LOOP
    SELECT * INTO _dup FROM public.employees WHERE id = _dup_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: duplicate % not found', _dup_id
        USING ERRCODE = 'no_data_found';
    END IF;
    IF _dup.company_id <> _company_id THEN
      RAISE EXCEPTION 'EMPLOYEE_MERGE_CROSS_COMPANY: duplicate % belongs to a different company', _dup_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF _dup.merged_into_employee_id IS NOT NULL THEN
      RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: duplicate % was already merged into %', _dup_id, _dup.merged_into_employee_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF public.employee_has_locked_payroll(_dup_id) THEN
      RAISE EXCEPTION 'EMPLOYEE_MERGE_LOCKED_PAYROLL: duplicate % has movements/base pay in a closed/published/paid pay period', _dup_id
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Move data per duplicate
  FOREACH _dup_id IN ARRAY _duplicate_ids LOOP
    SELECT * INTO _dup FROM public.employees WHERE id = _dup_id;
    _moved := '{}'::jsonb;

    DELETE FROM public.employee_status WHERE employee_id = _dup_id
      AND EXISTS (SELECT 1 FROM public.employee_status WHERE employee_id = _master_id);
    UPDATE public.employee_status SET employee_id = _master_id WHERE employee_id = _dup_id;

    DELETE FROM public.employee_availability_config WHERE employee_id = _dup_id
      AND EXISTS (SELECT 1 FROM public.employee_availability_config WHERE employee_id = _master_id);
    UPDATE public.employee_availability_config SET employee_id = _master_id WHERE employee_id = _dup_id;

    DELETE FROM public.employee_portal_modules d
      WHERE d.employee_id = _dup_id
        AND EXISTS (SELECT 1 FROM public.employee_portal_modules m
                     WHERE m.employee_id = _master_id AND m.module = d.module);
    UPDATE public.employee_portal_modules SET employee_id = _master_id WHERE employee_id = _dup_id;

    DELETE FROM public.concept_employee_rates d
      WHERE d.employee_id = _dup_id
        AND EXISTS (SELECT 1 FROM public.concept_employee_rates m
                     WHERE m.employee_id = _master_id
                       AND m.concept_id = d.concept_id
                       AND m.effective_from IS NOT DISTINCT FROM d.effective_from);
    UPDATE public.concept_employee_rates SET employee_id = _master_id WHERE employee_id = _dup_id;

    DELETE FROM public.period_base_pay d
      WHERE d.employee_id = _dup_id
        AND EXISTS (SELECT 1 FROM public.period_base_pay m
                     WHERE m.employee_id = _master_id AND m.period_id = d.period_id);
    UPDATE public.period_base_pay SET employee_id = _master_id WHERE employee_id = _dup_id;

    DELETE FROM public.shift_assignments d
      WHERE d.employee_id = _dup_id
        AND EXISTS (SELECT 1 FROM public.shift_assignments m
                     WHERE m.employee_id = _master_id AND m.shift_id = d.shift_id);
    UPDATE public.shift_assignments SET employee_id = _master_id WHERE employee_id = _dup_id;

    -- Generic re-assignment for everything else with employee_id
    FOR _table IN
      SELECT table_name
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.column_name = 'employee_id'
         AND c.table_name NOT IN (
           'employees','employees_safe','shifts_safe',
           'employee_status','employee_availability_config',
           'employee_portal_modules','concept_employee_rates',
           'period_base_pay','shift_assignments',
           'employee_archive_records'
         )
         AND c.table_name IN (
           SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE'
         )
    LOOP
      BEGIN
        EXECUTE format('UPDATE public.%I SET employee_id = $1 WHERE employee_id = $2', _table)
          USING _master_id, _dup_id;
        GET DIAGNOSTICS _row_count = ROW_COUNT;
        IF _row_count > 0 THEN
          _moved := _moved || jsonb_build_object(_table, _row_count);
        END IF;
      EXCEPTION WHEN unique_violation THEN
        _moved := _moved || jsonb_build_object(_table, 'unique_conflict');
      END;
    END LOOP;

    -- Back-fill master's empty fields from the duplicate
    FOREACH _col IN ARRAY _backfill_cols LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='employees' AND column_name=_col) THEN
        _backfill_sql := format(
          'UPDATE public.employees m
              SET %1$I = d.%1$I
             FROM public.employees d
            WHERE m.id = $1 AND d.id = $2
              AND (m.%1$I IS NULL OR (pg_typeof(m.%1$I)::text = ''text'' AND m.%1$I::text = ''''))
              AND d.%1$I IS NOT NULL',
          _col
        );
        BEGIN
          EXECUTE _backfill_sql USING _master_id, _dup_id;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END LOOP;

    -- Soft-archive the duplicate
    UPDATE public.employees
       SET is_active = false,
           deleted_at = COALESCE(deleted_at, now()),
           merged_into_employee_id = _master_id,
           updated_at = now()
     WHERE id = _dup_id;

    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (
      _actor, _company_id, 'employee_merged', 'employee', _dup_id::text,
      jsonb_build_object(
        'master_id', _master_id,
        'master_name', _master.first_name || ' ' || _master.last_name,
        'duplicate_id', _dup_id,
        'duplicate_name', _dup.first_name || ' ' || _dup.last_name,
        'reason', _reason,
        'moved', _moved,
        'merged_at', now()
      )
    );

    _summary := _summary || jsonb_build_object(
      'duplicate_id', _dup_id,
      'duplicate_name', _dup.first_name || ' ' || _dup.last_name,
      'moved', _moved
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'master_id', _master_id,
    'master_name', _master.first_name || ' ' || _master.last_name,
    'merged_count', array_length(_duplicate_ids, 1),
    'details', _summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_employees(uuid, uuid[], text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_employees(uuid, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_employee_duplicate_groups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unaccent_safe(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_has_locked_payroll(uuid) TO authenticated;