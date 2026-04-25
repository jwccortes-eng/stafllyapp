-- Relax enforce_employee_ready_for_shift so that operators can attach
-- workers whose onboarding/profile is still incomplete to a shift in a
-- "pending" or "review" state (orphan-shift recovery flow).
--
-- Readiness is still enforced for any state where the worker is treated as
-- operationally committed (confirmed / clocked-in / approved / locked, etc.)
-- and for any path that creates a non-pending assignment directly. Manual
-- overrides keep working exactly as before.
--
-- This DOES NOT change payroll, attendance-resolver, or any column.
CREATE OR REPLACE FUNCTION public.enforce_employee_ready_for_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_status public.employee_profile_status;
  _onboarding_status text;
  _employee_name text;
  _is_active boolean;
  _emp_company_id uuid;
  _shift_company_id uuid;
  _has_override boolean;
  _new_status text := COALESCE(NEW.status, 'pending');
BEGIN
  -- Skip enforcement for terminal/removed assignment states (unchanged).
  IF _new_status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  -- Load employee + shift basics for cross-tenant + lifecycle checks.
  SELECT e.profile_status, e.onboarding_status,
         COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, ''),
         COALESCE(e.is_active, true), e.company_id
    INTO _profile_status, _onboarding_status, _employee_name, _is_active, _emp_company_id
    FROM public.employees e
   WHERE e.id = NEW.employee_id;

  -- Hard blocks that ALWAYS apply, regardless of assignment status.
  IF _emp_company_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND: employee % does not exist', NEW.employee_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT _is_active THEN
    RAISE EXCEPTION 'EMPLOYEE_INACTIVE: % está archivado/inactivo y no puede ser asignado a turnos.', _employee_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- Multi-tenant guard: the employee must belong to the shift's company.
  SELECT company_id INTO _shift_company_id
    FROM public.scheduled_shifts WHERE id = NEW.shift_id;
  IF _shift_company_id IS NOT NULL AND _shift_company_id IS DISTINCT FROM _emp_company_id THEN
    RAISE EXCEPTION 'EMPLOYEE_WRONG_COMPANY: % no pertenece a esta compañía.', _employee_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- Operational-readiness gate only applies once the assignment is committed.
  -- Pending / review assignments may stand even with incomplete profile —
  -- the operator must finish onboarding before the worker can confirm,
  -- clock-in or be paid (those flows enforce readiness independently).
  IF _new_status IN ('pending', 'review') THEN
    RETURN NEW;
  END IF;

  -- Honor any active admin override (audited bypass) for committed states.
  _has_override := public.has_active_assignment_override(NEW.shift_id, NEW.employee_id);
  IF _has_override THEN
    BEGIN
      NEW.notes := COALESCE(NEW.notes, '') ||
        CASE WHEN NEW.notes IS NULL OR NEW.notes = '' THEN '' ELSE ' | ' END ||
        '[admin_override active]';
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
    RETURN NEW;
  END IF;

  -- Standard readiness gate for confirmed/active assignments.
  IF _profile_status IS DISTINCT FROM 'ready'::public.employee_profile_status
     AND _profile_status IS DISTINCT FROM 'active'::public.employee_profile_status THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_READY: % no puede confirmar turnos hasta completar perfil. Estado: %, onboarding: %',
      _employee_name, _profile_status, _onboarding_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;