
-- ============================================================================
-- 60-day Worker Readiness Grace Policy
-- ----------------------------------------------------------------------------
-- Three legacy operations (Quality Staff by Keury, My Staff Solution LLC,
-- JKitchen Staff) get a 60-day window from the policy start date during which
-- existing workers may still be approved/confirmed even if their profile is
-- "incomplete" or "pending_documents". After the window expires, normal
-- enforcement resumes.
--
-- Single source of truth: public.get_employee_shift_readiness(...)
-- States: 'ready' | 'grace_period' | 'incomplete_blocked' | 'inactive' | 'needs_review'
--
-- Safety: payroll, time_entries, attendance untouched. No data deletion.
-- ============================================================================

-- 1) Single source of truth ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employee_shift_readiness(
  _employee_id uuid,
  _company_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- 60-day profile completion grace policy start date.
  -- Centralized here so callers (trigger + UI helper) stay aligned.
  _grace_start CONSTANT date := DATE '2026-05-10';
  _grace_days  CONSTANT int  := 60;

  _eligible_companies CONSTANT uuid[] := ARRAY[
    '00000000-0000-0000-0000-000000000001'::uuid, -- Quality Staff by Keury
    '37f92f75-7af4-4496-aa10-793e14b09ed9'::uuid, -- My Staff Solution LLC / MyStaff
    'b653f344-b07a-44a2-ae2c-cf06bfb0645a'::uuid  -- JKitchen Staff
  ];

  _e RECORD;
  _company uuid;
BEGIN
  SELECT id, company_id, COALESCE(is_active, true) AS is_active, profile_status
    INTO _e
    FROM public.employees
   WHERE id = _employee_id;

  IF NOT FOUND THEN
    RETURN 'needs_review';
  END IF;

  IF NOT _e.is_active THEN
    RETURN 'inactive';
  END IF;

  IF _e.profile_status IN ('ready'::public.employee_profile_status,
                           'active'::public.employee_profile_status) THEN
    RETURN 'ready';
  END IF;

  _company := COALESCE(_company_id, _e.company_id);

  IF _company = ANY(_eligible_companies)
     AND CURRENT_DATE <= (_grace_start + (_grace_days || ' days')::interval)::date THEN
    RETURN 'grace_period';
  END IF;

  RETURN 'incomplete_blocked';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_employee_shift_readiness(uuid, uuid) TO authenticated;

-- 2) Trigger: route through the new readiness function ------------------------
CREATE OR REPLACE FUNCTION public.enforce_employee_ready_for_shift()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _employee_name text;
  _is_active boolean;
  _emp_company_id uuid;
  _shift_company_id uuid;
  _shift_pub_status public.shift_publication_status;
  _has_override boolean;
  _new_status text := COALESCE(NEW.status, 'pending');
  _readiness text;
  _profile_status public.employee_profile_status;
  _onboarding_status text;
BEGIN
  IF _new_status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  -- Draft reservation bypass: planning only, no readiness enforcement.
  IF COALESCE(NEW.is_draft_reservation, false) THEN
    SELECT e.company_id, COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')
      INTO _emp_company_id, _employee_name
      FROM public.employees e WHERE e.id = NEW.employee_id;
    IF _emp_company_id IS NULL THEN
      RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND: employee % does not exist', NEW.employee_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    SELECT company_id INTO _shift_company_id FROM public.scheduled_shifts WHERE id = NEW.shift_id;
    IF _shift_company_id IS NOT NULL AND _shift_company_id IS DISTINCT FROM _emp_company_id THEN
      RAISE EXCEPTION 'EMPLOYEE_WRONG_COMPANY: % no pertenece a esta compañía.', _employee_name
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT e.profile_status, e.onboarding_status,
         COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, ''),
         COALESCE(e.is_active, true), e.company_id
    INTO _profile_status, _onboarding_status, _employee_name, _is_active, _emp_company_id
    FROM public.employees e
   WHERE e.id = NEW.employee_id;

  IF _emp_company_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND: employee % does not exist', NEW.employee_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT _is_active THEN
    RAISE EXCEPTION 'EMPLOYEE_INACTIVE: % está archivado/inactivo y no puede ser asignado a turnos.', _employee_name
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT company_id, publication_status INTO _shift_company_id, _shift_pub_status
    FROM public.scheduled_shifts WHERE id = NEW.shift_id;
  IF _shift_company_id IS NOT NULL AND _shift_company_id IS DISTINCT FROM _emp_company_id THEN
    RAISE EXCEPTION 'EMPLOYEE_WRONG_COMPANY: % no pertenece a esta compañía.', _employee_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- Draft parent shift = planning only.
  IF _shift_pub_status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _new_status IN ('pending', 'review') THEN
    RETURN NEW;
  END IF;

  _has_override := public.has_active_assignment_override(NEW.shift_id, NEW.employee_id);
  IF _has_override THEN
    BEGIN
      NEW.notes := COALESCE(NEW.notes, '') ||
        CASE WHEN NEW.notes IS NULL OR NEW.notes = '' THEN '' ELSE ' | ' END ||
        '[admin_override active]';
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    RETURN NEW;
  END IF;

  -- Single source of truth: ready and grace_period both pass.
  _readiness := public.get_employee_shift_readiness(NEW.employee_id, _emp_company_id);

  IF _readiness IN ('ready', 'grace_period') THEN
    IF _readiness = 'grace_period' THEN
      BEGIN
        NEW.notes := COALESCE(NEW.notes, '') ||
          CASE WHEN NEW.notes IS NULL OR NEW.notes = '' THEN '' ELSE ' | ' END ||
          '[grace_period approval]';
      EXCEPTION WHEN undefined_column THEN NULL;
      END;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'EMPLOYEE_NOT_READY: % no puede confirmar turnos hasta completar perfil. Estado: %, onboarding: %',
    _employee_name, _profile_status, _onboarding_status
    USING ERRCODE = 'check_violation';
END;
$function$;
