-- ============================================================
-- P0.1 — Operational vs Compliance separation (multi-tenant)
-- ============================================================

-- 1. Per-company policy resolver (single source of truth)
CREATE OR REPLACE FUNCTION public.get_assignment_compliance_policy(_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      (SELECT cs.value->>'mode'
         FROM public.company_settings cs
        WHERE cs.company_id = _company_id
          AND cs.key = 'assignment_compliance_policy'
        LIMIT 1),
      ''
    ),
    'allow_with_warning'
  );
$$;

-- 2. Canonical assignment status: operational + compliance, fully separated.
CREATE OR REPLACE FUNCTION public.get_employee_assignment_status(
  _employee_id uuid,
  _company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e RECORD;
  _company uuid;
  _policy text;
  _compliance text;
  _operational text;
  _can_assign boolean;
  _requires_override boolean;
BEGIN
  SELECT id, company_id, COALESCE(is_active, true) AS is_active,
         profile_status, onboarding_status
    INTO _e
    FROM public.employees
   WHERE id = _employee_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'operational_status', 'needs_review',
      'compliance_status', 'unknown',
      'policy', 'allow_with_warning',
      'can_assign', false,
      'requires_override', false,
      'readiness', 'needs_review'
    );
  END IF;

  _company := COALESCE(_company_id, _e.company_id);
  _policy  := public.get_assignment_compliance_policy(_company);

  -- ── Compliance dimension (never operational by itself)
  _compliance := CASE
    WHEN _e.profile_status = 'incomplete'::public.employee_profile_status THEN 'profile_incomplete'
    WHEN _e.profile_status = 'pending_documents'::public.employee_profile_status THEN 'documents_pending'
    WHEN _e.onboarding_status IS NOT NULL
         AND _e.onboarding_status NOT IN ('completed','complete','done','finished')
         AND _e.profile_status <> 'active'::public.employee_profile_status THEN 'onboarding_pending'
    ELSE 'clear'
  END;

  -- ── Operational dimension
  IF NOT _e.is_active THEN
    _operational := 'inactive';
  ELSIF _compliance <> 'clear' AND _policy = 'block' THEN
    -- Explicit company/contractual rule -> real operational block.
    _operational := 'legal_block';
  ELSE
    _operational := 'available';
  END IF;

  _requires_override := (_compliance <> 'clear' AND _policy = 'require_override');
  _can_assign := (_operational = 'available');

  RETURN jsonb_build_object(
    'employee_id', _e.id,
    'company_id', _company,
    'operational_status', _operational,
    'compliance_status', _compliance,
    'policy', _policy,
    'can_assign', _can_assign,
    'requires_override', _requires_override,
    'readiness', CASE
      WHEN _operational = 'inactive' THEN 'inactive'
      WHEN _operational = 'legal_block' THEN 'compliance_blocked'
      WHEN _requires_override THEN 'override_required'
      WHEN _compliance <> 'clear' THEN 'compliance_warning'
      ELSE 'ready'
    END
  );
END;
$$;

-- 3. Batch variant so the UI never re-implements the rules per row.
CREATE OR REPLACE FUNCTION public.get_employees_assignment_status(
  _employee_ids uuid[],
  _company_id uuid DEFAULT NULL
)
RETURNS TABLE (employee_id uuid, status jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e AS employee_id, public.get_employee_assignment_status(e, _company_id)
    FROM unnest(COALESCE(_employee_ids, ARRAY[]::uuid[])) AS e;
$$;

-- 4. Legacy readiness function: now a thin wrapper. No dates, no company lists.
CREATE OR REPLACE FUNCTION public.get_employee_shift_readiness(
  _employee_id uuid,
  _company_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_employee_assignment_status(_employee_id, _company_id)->>'readiness';
$$;

GRANT EXECUTE ON FUNCTION public.get_assignment_compliance_policy(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_assignment_status(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_employees_assignment_status(uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_shift_readiness(uuid, uuid) TO authenticated, service_role;

-- 5. Audit trail for compliance-pending assignments
CREATE TABLE IF NOT EXISTS public.assignment_compliance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  shift_id uuid,
  company_id uuid,
  assignment_id uuid,
  compliance_status text NOT NULL,
  operational_status text NOT NULL,
  assignment_policy_used text NOT NULL,
  override_used boolean NOT NULL DEFAULT false,
  assignment_status text,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assignment_compliance_audit TO authenticated;
GRANT ALL ON public.assignment_compliance_audit TO service_role;

ALTER TABLE public.assignment_compliance_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company staff can read compliance audit" ON public.assignment_compliance_audit;
CREATE POLICY "Company staff can read compliance audit"
  ON public.assignment_compliance_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'admin')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.is_global_owner(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_assignment_compliance_audit_company
  ON public.assignment_compliance_audit (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_compliance_audit_employee
  ON public.assignment_compliance_audit (employee_id, created_at DESC);

-- 6. Enforcement trigger: honours the per-company policy only.
CREATE OR REPLACE FUNCTION public.enforce_employee_ready_for_shift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee_name text;
  _is_active boolean;
  _emp_company_id uuid;
  _shift_company_id uuid;
  _shift_pub_status public.shift_publication_status;
  _has_override boolean;
  _new_status text := COALESCE(NEW.status, 'pending');
  _status jsonb;
  _profile_status public.employee_profile_status;
  _onboarding_status text;
BEGIN
  IF _new_status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

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

  IF _shift_pub_status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _new_status IN ('pending', 'review') THEN
    RETURN NEW;
  END IF;

  _has_override := public.has_active_assignment_override(NEW.shift_id, NEW.employee_id);
  _status := public.get_employee_assignment_status(NEW.employee_id, _emp_company_id);

  IF _has_override THEN
    BEGIN
      NEW.notes := COALESCE(NEW.notes, '') ||
        CASE WHEN NEW.notes IS NULL OR NEW.notes = '' THEN '' ELSE ' | ' END ||
        '[admin_override active]';
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    RETURN NEW;
  END IF;

  IF (_status->>'can_assign')::boolean AND NOT (_status->>'requires_override')::boolean THEN
    RETURN NEW;
  END IF;

  IF (_status->>'requires_override')::boolean THEN
    RAISE EXCEPTION 'COMPLIANCE_OVERRIDE_REQUIRED: % requiere aprobación explícita (política de la compañía). Cumplimiento: %',
      _employee_name, _status->>'compliance_status'
      USING ERRCODE = 'check_violation';
  END IF;

  RAISE EXCEPTION 'COMPLIANCE_BLOCKED: % está bloqueado por la política de cumplimiento de la compañía. Cumplimiento: %',
    _employee_name, _status->>'compliance_status'
    USING ERRCODE = 'check_violation';
END;
$$;

-- 7. Audit logging (AFTER trigger, never blocks the operation)
CREATE OR REPLACE FUNCTION public.log_assignment_compliance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp_company_id uuid;
  _status jsonb;
BEGIN
  IF COALESCE(NEW.status, 'pending') IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO _emp_company_id FROM public.employees WHERE id = NEW.employee_id;
  _status := public.get_employee_assignment_status(NEW.employee_id, _emp_company_id);

  IF COALESCE(_status->>'compliance_status', 'clear') = 'clear' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.assignment_compliance_audit (
    employee_id, shift_id, company_id, assignment_id,
    compliance_status, operational_status, assignment_policy_used,
    override_used, assignment_status, assigned_by
  ) VALUES (
    NEW.employee_id, NEW.shift_id, _emp_company_id, NEW.id,
    _status->>'compliance_status', _status->>'operational_status', _status->>'policy',
    public.has_active_assignment_override(NEW.shift_id, NEW.employee_id),
    NEW.status, auth.uid()
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_assignment_compliance ON public.shift_assignments;
CREATE TRIGGER trg_log_assignment_compliance
  AFTER INSERT OR UPDATE OF status ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.log_assignment_compliance();