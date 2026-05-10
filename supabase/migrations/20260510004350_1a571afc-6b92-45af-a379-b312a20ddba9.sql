
-- ============================================================================
-- Phase 3 — Mobile Add Workers safe RPC
--
-- Single SECURITY DEFINER helper that:
--   1) authorizes via can_manage_shift_company
--   2) validates same-company employee/shift
--   3) routes through get_employee_shift_readiness (60-day grace policy)
--   4) blocks duplicates (active assignment already exists)
--   5) inserts a fresh shift_assignments row with status='pending',
--      response_status='pending' (admin invites; worker still must accept)
--   6) writes an immutable shift_audit_log row
--   7) NEVER touches time_entries / attendance / payroll, never deletes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_worker_to_shift(
  p_shift_id uuid,
  p_employee_id uuid,
  p_assignment_role text DEFAULT 'worker',
  p_reason text DEFAULT NULL,
  p_source text DEFAULT 'mobile_manage_team'
)
RETURNS public.shift_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift           public.scheduled_shifts;
  v_emp_company_id  uuid;
  v_is_active       boolean;
  v_existing        public.shift_assignments;
  v_assignment      public.shift_assignments;
  v_readiness       text;
  v_audit_reason    text := p_reason;
BEGIN
  IF p_shift_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  -- 1) Shift exists and not deleted.
  SELECT * INTO v_shift
    FROM public.scheduled_shifts
    WHERE id = p_shift_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 2) Authorization (admin/manager/supervisor/owner/developer).
  IF NOT public.can_manage_shift_company(v_shift.company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 3) Employee exists, same company, active.
  SELECT company_id, COALESCE(is_active, true)
    INTO v_emp_company_id, v_is_active
    FROM public.employees
    WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp_company_id IS DISTINCT FROM v_shift.company_id THEN
    RAISE EXCEPTION 'employee_wrong_company' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_active THEN
    RAISE EXCEPTION 'employee_inactive' USING ERRCODE = '22023';
  END IF;

  -- 4) Readiness gate (single source of truth + grace policy).
  v_readiness := public.get_employee_shift_readiness(p_employee_id, v_shift.company_id);
  IF v_readiness NOT IN ('ready', 'grace_period') THEN
    RAISE EXCEPTION 'employee_not_ready:%', v_readiness USING ERRCODE = '22023';
  END IF;
  IF v_readiness = 'grace_period' THEN
    v_audit_reason := COALESCE(v_audit_reason || ' | ', '') || '[grace_period assignment]';
  END IF;

  -- 5) Duplicate guard — any non-rejected/removed row counts as active.
  SELECT * INTO v_existing
    FROM public.shift_assignments
    WHERE shift_id = p_shift_id
      AND employee_id = p_employee_id
      AND status NOT IN ('rejected', 'removed')
    ORDER BY created_at DESC
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'already_assigned:%', v_existing.id USING ERRCODE = '23505';
  END IF;

  -- 6) Insert assignment as pending invitation.
  --    status='pending', response_status='pending' → worker still must accept.
  --    Trigger enforce_employee_ready_for_shift bypasses readiness for 'pending'
  --    status; the RPC enforces it explicitly above.
  INSERT INTO public.shift_assignments (
    company_id, shift_id, employee_id,
    status, response_status, assignment_role,
    response_required, is_draft_reservation
  ) VALUES (
    v_shift.company_id, p_shift_id, p_employee_id,
    'pending', 'pending', COALESCE(NULLIF(p_assignment_role, ''), 'worker'),
    true, false
  ) RETURNING * INTO v_assignment;

  -- 7) Audit.
  INSERT INTO public.shift_audit_log(
    company_id, shift_id, assignment_id, employee_id, actor_user_id,
    action, before_data, after_data, reason, source
  ) VALUES (
    v_shift.company_id, p_shift_id, v_assignment.id, p_employee_id, auth.uid(),
    'assignment_created',
    NULL,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'status', v_assignment.status,
      'response_status', v_assignment.response_status,
      'assignment_role', v_assignment.assignment_role,
      'readiness', v_readiness
    ),
    v_audit_reason,
    COALESCE(NULLIF(p_source, ''), 'mobile_manage_team')
  );

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_worker_to_shift(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_worker_to_shift(uuid, uuid, text, text, text) TO authenticated;
