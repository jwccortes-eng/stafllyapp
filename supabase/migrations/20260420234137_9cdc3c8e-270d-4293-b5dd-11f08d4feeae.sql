-- ============================================================
-- 1. profile_status enum + column
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.employee_profile_status AS ENUM
    ('incomplete', 'pending_documents', 'ready', 'active');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS profile_status public.employee_profile_status
  NOT NULL DEFAULT 'incomplete';

CREATE INDEX IF NOT EXISTS idx_employees_company_profile_status
  ON public.employees(company_id, profile_status)
  WHERE is_active = true;

-- ============================================================
-- 2. Helper: required document categories for a company
--    Reads company_settings.onboarding_required_documents (jsonb array of strings).
--    If absent, returns the hardcoded defaults.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_required_documents_for_company(_company_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _override jsonb;
  _result text[];
BEGIN
  SELECT value INTO _override
    FROM public.company_settings
   WHERE company_id = _company_id AND key = 'onboarding_required_documents'
   LIMIT 1;

  IF _override IS NOT NULL AND jsonb_typeof(_override) = 'array' THEN
    SELECT array_agg(elem) INTO _result
      FROM jsonb_array_elements_text(_override) AS elem;
    RETURN COALESCE(_result, ARRAY['w9', 'id']::text[]);
  END IF;

  -- Default: W9 + government ID. Driver's license is added conditionally
  -- by compute_employee_profile_status when can_drive = true.
  RETURN ARRAY['w9', 'id']::text[];
END;
$$;

-- ============================================================
-- 3. Compute profile_status for a single employee
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_employee_profile_status(_employee_id uuid)
RETURNS public.employee_profile_status
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _e RECORD;
  _required_docs text[];
  _doc_categories text[];
  _missing_doc text;
  _has_personal boolean;
BEGIN
  SELECT id, company_id, first_name, last_name, phone_number,
         date_of_birth, ssn_last4,
         address_line, address_city, address_state, address_zip,
         employee_role, can_drive, last_login, portal_access_enabled
    INTO _e
    FROM public.employees
   WHERE id = _employee_id;

  IF NOT FOUND THEN RETURN 'incomplete'; END IF;

  -- ── Personal info gate ────────────────────────────────────
  _has_personal :=
       _e.first_name      IS NOT NULL AND _e.first_name      <> ''
   AND _e.last_name       IS NOT NULL AND _e.last_name       <> ''
   AND _e.phone_number    IS NOT NULL AND _e.phone_number    <> ''
   AND _e.date_of_birth   IS NOT NULL
   AND _e.ssn_last4       IS NOT NULL AND length(_e.ssn_last4) = 4
   AND _e.address_line    IS NOT NULL AND _e.address_line    <> ''
   AND _e.address_city    IS NOT NULL AND _e.address_city    <> ''
   AND _e.address_state   IS NOT NULL AND _e.address_state   <> ''
   AND _e.address_zip     IS NOT NULL AND _e.address_zip     <> ''
   AND _e.employee_role   IS NOT NULL AND _e.employee_role   <> '';

  IF NOT _has_personal THEN
    RETURN 'incomplete';
  END IF;

  -- ── Documents gate ────────────────────────────────────────
  _required_docs := public.get_required_documents_for_company(_e.company_id);

  -- Conditionally append driver's license
  IF COALESCE(_e.can_drive, false)
     AND NOT ('drivers_license' = ANY(_required_docs))
     AND NOT ('driver_license' = ANY(_required_docs))
  THEN
    _required_docs := array_append(_required_docs, 'drivers_license');
  END IF;

  -- Collect categories present in employee_documents (lowercased)
  SELECT COALESCE(array_agg(DISTINCT lower(category)), ARRAY[]::text[])
    INTO _doc_categories
    FROM public.employee_documents
   WHERE employee_id = _employee_id
     AND category IS NOT NULL;

  -- Every required category must appear
  FOREACH _missing_doc IN ARRAY _required_docs LOOP
    IF NOT (lower(_missing_doc) = ANY(_doc_categories)) THEN
      RETURN 'pending_documents';
    END IF;
  END LOOP;

  -- ── Active vs Ready ───────────────────────────────────────
  IF COALESCE(_e.portal_access_enabled, false) AND _e.last_login IS NOT NULL THEN
    RETURN 'active';
  END IF;

  RETURN 'ready';
END;
$$;

-- ============================================================
-- 4. Public RPC: get_profile_status(employee_id) — returns + recalculates
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_profile_status(_employee_id uuid)
RETURNS public.employee_profile_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _new_status public.employee_profile_status;
  _company_id uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.employees WHERE id = _employee_id;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  -- Authz: must be admin/owner of the employee's company OR the employee themselves
  IF NOT (
       public.user_is_company_admin(auth.uid(), _company_id)
    OR EXISTS (SELECT 1 FROM public.employees WHERE id = _employee_id AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _new_status := public.compute_employee_profile_status(_employee_id);

  UPDATE public.employees
     SET profile_status = _new_status, updated_at = now()
   WHERE id = _employee_id AND profile_status IS DISTINCT FROM _new_status;

  RETURN _new_status;
END;
$$;

-- ============================================================
-- 5. Trigger: recompute on employees row change
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_recompute_employee_profile_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.profile_status := public.compute_employee_profile_status(NEW.id);
  RETURN NEW;
END;
$$;

-- We need the row to exist first, so use AFTER INSERT for new rows
-- and BEFORE UPDATE for existing rows.
CREATE OR REPLACE FUNCTION public.trg_recompute_employee_profile_status_after()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _new_status public.employee_profile_status;
BEGIN
  _new_status := public.compute_employee_profile_status(NEW.id);
  IF _new_status IS DISTINCT FROM NEW.profile_status THEN
    UPDATE public.employees SET profile_status = _new_status WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_recompute_profile_status_upd ON public.employees;
CREATE TRIGGER trg_employees_recompute_profile_status_upd
  BEFORE UPDATE OF first_name, last_name, phone_number, date_of_birth, ssn_last4,
                   address_line, address_city, address_state, address_zip,
                   employee_role, can_drive, portal_access_enabled, last_login
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recompute_employee_profile_status();

DROP TRIGGER IF EXISTS trg_employees_recompute_profile_status_ins ON public.employees;
CREATE TRIGGER trg_employees_recompute_profile_status_ins
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recompute_employee_profile_status_after();

-- ============================================================
-- 6. Trigger: recompute when documents change
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_recompute_status_on_doc_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _emp_id uuid;
  _new_status public.employee_profile_status;
BEGIN
  _emp_id := COALESCE(NEW.employee_id, OLD.employee_id);
  IF _emp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  _new_status := public.compute_employee_profile_status(_emp_id);
  UPDATE public.employees
     SET profile_status = _new_status
   WHERE id = _emp_id AND profile_status IS DISTINCT FROM _new_status;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_documents_recompute_status ON public.employee_documents;
CREATE TRIGGER trg_employee_documents_recompute_status
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recompute_status_on_doc_change();

-- ============================================================
-- 7. HARD BLOCK: shift_assignments — reject if not ready/active
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_employee_ready_for_shift()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _status public.employee_profile_status;
  _name text;
BEGIN
  -- Only enforce on INSERT (or status transition into an active state on update).
  -- Allow rejected/removed regardless.
  IF NEW.status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  SELECT profile_status, COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
    INTO _status, _name
    FROM public.employees WHERE id = NEW.employee_id;

  IF _status IS NULL THEN RETURN NEW; END IF;

  IF _status NOT IN ('ready', 'active') THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_READY: % no puede ser asignado a turnos. Estado actual: %. Completa su perfil y documentos antes de asignar.',
      _name, _status
      USING ERRCODE = 'check_violation', HINT = 'employee_profile_status:' || _status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_assignments_enforce_ready ON public.shift_assignments;
CREATE TRIGGER trg_shift_assignments_enforce_ready
  BEFORE INSERT ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_employee_ready_for_shift();

-- ============================================================
-- 8. Backfill existing rows once
-- ============================================================
UPDATE public.employees e
   SET profile_status = public.compute_employee_profile_status(e.id)
 WHERE is_active = true;