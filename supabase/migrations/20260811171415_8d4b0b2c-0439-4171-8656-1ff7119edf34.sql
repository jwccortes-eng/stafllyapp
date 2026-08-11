-- ============================================================
-- P0 — Quality Staff Internal ID canonical policy
-- ============================================================

-- 1. AUDIT TRAIL -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_id_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  company_id uuid NOT NULL,
  internal_id text NOT NULL,
  previous_internal_id text,
  assignment_reason text NOT NULL,
  source text NOT NULL DEFAULT 'system',
  assigned_by uuid,
  notes text,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_id_assignments_employee
  ON public.internal_id_assignments (employee_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_id_assignments_company
  ON public.internal_id_assignments (company_id, assigned_at DESC);

GRANT SELECT ON public.internal_id_assignments TO authenticated;
GRANT ALL ON public.internal_id_assignments TO service_role;

ALTER TABLE public.internal_id_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can read internal id assignments"
  ON public.internal_id_assignments FOR SELECT TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'admin')
  );

CREATE POLICY "Service role manages internal id assignments"
  ON public.internal_id_assignments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. CANONICAL COUNTER (race-safe, per company) ------------------
CREATE TABLE IF NOT EXISTS public.company_internal_id_counters (
  company_id uuid PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_internal_id_counters TO authenticated;
GRANT ALL ON public.company_internal_id_counters TO service_role;

ALTER TABLE public.company_internal_id_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can read internal id counter"
  ON public.company_internal_id_counters FOR SELECT TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'admin')
  );

CREATE POLICY "Service role manages internal id counter"
  ON public.company_internal_id_counters FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Numeric value of an internal id under a company's prefix convention
CREATE OR REPLACE FUNCTION public.internal_id_numeric(p_value text, p_prefix text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN p_value ~ '^\d+$' THEN p_value::integer
    WHEN COALESCE(p_prefix,'') <> '' AND p_value LIKE p_prefix || '%'
         AND replace(p_value, p_prefix, '') ~ '^\d+$'
      THEN replace(p_value, p_prefix, '')::integer
    ELSE NULL
  END
$$;

-- Race-safe next internal id for a company.
CREATE OR REPLACE FUNCTION public.next_internal_id(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg jsonb;
  start_number integer := 1;
  prefix_val text := '';
  padding_val integer := 0;
  observed_max integer;
  candidate integer;
  candidate_text text;
  guard integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('internal_id:' || p_company_id::text));

  SELECT value INTO cfg
    FROM public.company_settings
   WHERE company_id = p_company_id AND key = 'employee_number_config';

  IF cfg IS NOT NULL THEN
    start_number := COALESCE((cfg->>'start_number')::integer, 1);
    prefix_val   := COALESCE(cfg->>'prefix', '');
    padding_val  := COALESCE((cfg->>'padding')::integer, 0);
  END IF;

  SELECT COALESCE(MAX(public.internal_id_numeric(employer_identification, prefix_val)), 0)
    INTO observed_max
    FROM public.employees
   WHERE company_id = p_company_id;

  INSERT INTO public.company_internal_id_counters (company_id, last_number)
  VALUES (p_company_id, GREATEST(observed_max, start_number - 1))
  ON CONFLICT (company_id) DO NOTHING;

  LOOP
    guard := guard + 1;
    IF guard > 10000 THEN
      RAISE EXCEPTION 'internal_id sequence exhausted for company %', p_company_id;
    END IF;

    UPDATE public.company_internal_id_counters
       SET last_number = GREATEST(last_number, observed_max, start_number - 1) + 1,
           updated_at = now()
     WHERE company_id = p_company_id
     RETURNING last_number INTO candidate;

    IF padding_val > 0 THEN
      candidate_text := prefix_val || LPAD(candidate::text, padding_val, '0');
    ELSE
      candidate_text := prefix_val || candidate::text;
    END IF;

    -- Never recycle or collide with an existing value.
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.employees
       WHERE company_id = p_company_id
         AND employer_identification = candidate_text
    );
  END LOOP;

  RETURN candidate_text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_internal_id(uuid) FROM anon, authenticated;

-- 3. INSERT TRIGGER now uses the canonical counter ---------------
CREATE OR REPLACE FUNCTION public.auto_assign_employer_identification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.employer_identification IS NOT NULL AND NEW.employer_identification <> '' THEN
    RETURN NEW; -- historical / provided value is preserved verbatim
  END IF;

  -- Merged or soft-deleted rows never consume a new number.
  IF COALESCE(NEW.identity_status, '') = 'merged'
     OR NEW.merged_into_employee_id IS NOT NULL
     OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.employer_identification := public.next_internal_id(NEW.company_id);
  RETURN NEW;
END;
$$;

-- Log the assignment after insert (audit trail).
CREATE OR REPLACE FUNCTION public.log_internal_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.employer_identification IS NOT NULL AND NEW.employer_identification <> ''
     AND NEW.company_id IS NOT NULL THEN
    INSERT INTO public.internal_id_assignments (
      employee_id, company_id, internal_id, previous_internal_id,
      assignment_reason, source, assigned_by
    ) VALUES (
      NEW.id, NEW.company_id, NEW.employer_identification, NULL,
      'new_employee', 'employees_insert', auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_log_internal_id_on_insert ON public.employees;
CREATE TRIGGER trg_zz_log_internal_id_on_insert
  AFTER INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.log_internal_id_on_insert();

-- 4. IMMUTABILITY -------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_internal_id_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.employer_identification IS DISTINCT FROM OLD.employer_identification THEN
    -- Assigning for the first time is allowed only through the canonical path.
    IF COALESCE(OLD.employer_identification, '') = '' THEN
      IF COALESCE(current_setting('app.internal_id_writer', true), '') <> 'canonical' THEN
        RAISE EXCEPTION
          'Internal ID must be assigned through assign_internal_id(); direct writes are not allowed'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    IF COALESCE(current_setting('app.internal_id_writer', true), '') <> 'correction' THEN
      RAISE EXCEPTION
        'Internal ID is immutable once assigned; use correct_internal_id() for audited corrections'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aa_internal_id_immutability ON public.employees;
CREATE TRIGGER trg_aa_internal_id_immutability
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_internal_id_immutability();

-- 5. SINGLE WRITER: assign_internal_id ---------------------------
CREATE OR REPLACE FUNCTION public.assign_internal_id(
  p_employee_id uuid,
  p_source text DEFAULT 'manual_admin',
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp record;
  actor uuid := auth.uid();
  historical text;
  final_reason text;
  new_value text;
BEGIN
  SELECT id, company_id, employer_identification, identity_status,
         merged_into_employee_id, deleted_at, is_active, first_name, last_name, email, phone_number
    INTO emp
    FROM public.employees
   WHERE id = p_employee_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF actor IS NOT NULL AND NOT (
        public.has_company_role(actor, emp.company_id, 'owner')
     OR public.has_company_role(actor, emp.company_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign internal ids for this company'
      USING ERRCODE = '42501';
  END IF;

  IF emp.employer_identification IS NOT NULL AND emp.employer_identification <> '' THEN
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'internal_id', emp.employer_identification,
      'reason', 'already_assigned'
    );
  END IF;

  IF COALESCE(emp.identity_status, '') = 'merged'
     OR emp.merged_into_employee_id IS NOT NULL
     OR emp.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'merged_or_deleted');
  END IF;

  -- Historical preservation: a duplicate row of this same person that already
  -- carries an internal id keeps that number alive.
  SELECT d.employer_identification INTO historical
    FROM public.employees d
   WHERE d.company_id = emp.company_id
     AND d.id <> emp.id
     AND d.merged_into_employee_id = emp.id
     AND d.employer_identification IS NOT NULL
     AND d.employer_identification <> ''
   ORDER BY d.created_at ASC
   LIMIT 1;

  IF historical IS NOT NULL THEN
    new_value := historical;
    final_reason := 'historical_preservation';
  ELSE
    new_value := public.next_internal_id(emp.company_id);
    final_reason := COALESCE(p_reason, 'new_employee');
  END IF;

  PERFORM set_config('app.internal_id_writer', 'canonical', true);
  UPDATE public.employees
     SET employer_identification = new_value,
         updated_at = now()
   WHERE id = emp.id;
  PERFORM set_config('app.internal_id_writer', '', true);

  INSERT INTO public.internal_id_assignments (
    employee_id, company_id, internal_id, previous_internal_id,
    assignment_reason, source, assigned_by, notes
  ) VALUES (
    emp.id, emp.company_id, new_value, NULL,
    final_reason, COALESCE(p_source, 'manual_admin'), actor, p_notes
  );

  RETURN jsonb_build_object(
    'status', 'assigned',
    'internal_id', new_value,
    'reason', final_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_internal_id(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_internal_id(uuid, text, text, text) TO service_role;

-- 6. AUDITED CORRECTION ------------------------------------------
CREATE OR REPLACE FUNCTION public.correct_internal_id(
  p_employee_id uuid,
  p_new_internal_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp record;
  actor uuid := auth.uid();
  clean text := btrim(COALESCE(p_new_internal_id, ''));
BEGIN
  IF clean = '' THEN
    RAISE EXCEPTION 'A new internal id is required' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required to correct an internal id' USING ERRCODE = '22023';
  END IF;

  SELECT id, company_id, employer_identification INTO emp
    FROM public.employees WHERE id = p_employee_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF actor IS NULL OR NOT (
        public.has_company_role(actor, emp.company_id, 'owner')
     OR public.has_company_role(actor, emp.company_id, 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to correct internal ids for this company'
      USING ERRCODE = '42501';
  END IF;

  IF emp.employer_identification IS NOT DISTINCT FROM clean THEN
    RETURN jsonb_build_object('status', 'noop', 'internal_id', clean);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees
     WHERE company_id = emp.company_id
       AND id <> emp.id
       AND employer_identification = clean
  ) THEN
    RAISE EXCEPTION 'Internal id % is already in use in this company', clean
      USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.internal_id_writer', 'correction', true);
  UPDATE public.employees
     SET employer_identification = clean, updated_at = now()
   WHERE id = emp.id;
  PERFORM set_config('app.internal_id_writer', '', true);

  INSERT INTO public.internal_id_assignments (
    employee_id, company_id, internal_id, previous_internal_id,
    assignment_reason, source, assigned_by, notes
  ) VALUES (
    emp.id, emp.company_id, clean, emp.employer_identification,
    'manual_admin_correction', 'correct_internal_id', actor, p_reason
  );

  RETURN jsonb_build_object(
    'status', 'corrected',
    'internal_id', clean,
    'previous_internal_id', emp.employer_identification
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_internal_id(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_internal_id(uuid, text, text) TO service_role;