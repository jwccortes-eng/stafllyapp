-- Phase 5B — Worker response RPC with audit logging.
-- Mirrors the existing portal direct-update behavior but writes shift_audit_log
-- and validates ownership server-side. No payroll/time_entries/attendance changes.

CREATE OR REPLACE FUNCTION public.worker_respond_to_shift_assignment(
  p_assignment_id uuid,
  p_response text,
  p_reason text DEFAULT NULL,
  p_source text DEFAULT 'worker_portal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_assignment public.shift_assignments%ROWTYPE;
  v_shift public.scheduled_shifts%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_before jsonb;
  v_after  jsonb;
  v_audit_id uuid;
  v_now timestamptz := now();
  v_new_status text;
  v_new_response text;
  v_version int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_response NOT IN ('accepted','rejected') THEN
    RAISE EXCEPTION 'INVALID_RESPONSE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_assignment FROM public.shift_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.status = 'removed' THEN
    RAISE EXCEPTION 'ASSIGNMENT_REMOVED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_employee FROM public.employees WHERE id = v_assignment.employee_id;
  IF NOT FOUND OR v_employee.user_id IS NULL OR v_employee.user_id <> v_uid THEN
    RAISE EXCEPTION 'NOT_ASSIGNED_WORKER' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_shift FROM public.scheduled_shifts WHERE id = v_assignment.shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Don't allow responses on draft / soft-deleted shifts.
  IF COALESCE(v_shift.is_draft, false) = true OR COALESCE(v_shift.is_deleted, false) = true THEN
    RAISE EXCEPTION 'SHIFT_NOT_PUBLISHED' USING ERRCODE = '22023';
  END IF;

  v_before := to_jsonb(v_assignment);
  v_version := COALESCE(v_shift.operational_version, 1);

  IF p_response = 'accepted' THEN
    v_new_status := 'confirmed';
    v_new_response := 'accepted';
    UPDATE public.shift_assignments
       SET status = v_new_status,
           response_status = v_new_response,
           response_required = false,
           accepted_at = v_now,
           responded_at = v_now,
           accepted_shift_version = v_version,
           rejection_reason = NULL,
           rejected_at = NULL
     WHERE id = p_assignment_id
     RETURNING * INTO v_assignment;
  ELSE
    v_new_status := 'rejected';
    v_new_response := 'rejected';
    UPDATE public.shift_assignments
       SET status = v_new_status,
           response_status = v_new_response,
           response_required = false,
           rejected_at = v_now,
           responded_at = v_now,
           rejection_reason = NULLIF(btrim(COALESCE(p_reason,'')), '')
     WHERE id = p_assignment_id
     RETURNING * INTO v_assignment;
  END IF;

  v_after := to_jsonb(v_assignment);

  -- Audit row — best effort, never block worker response.
  BEGIN
    INSERT INTO public.shift_audit_log (
      company_id, shift_id, assignment_id, employee_id,
      action, reason, before_data, after_data, actor_user_id
    ) VALUES (
      v_shift.company_id, v_shift.id, v_assignment.id, v_assignment.employee_id,
      CASE WHEN p_response = 'accepted'
           THEN 'worker_response_accepted'
           ELSE 'worker_response_rejected' END,
      CASE WHEN p_source IS NOT NULL
           THEN format('%s | source=%s', COALESCE(p_reason,''), p_source)
           ELSE p_reason END,
      v_before, v_after, v_uid
    )
    RETURNING id INTO v_audit_id;
  EXCEPTION WHEN OTHERS THEN
    v_audit_id := NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment.id,
    'status', v_assignment.status,
    'response_status', v_assignment.response_status,
    'audit_log_id', v_audit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.worker_respond_to_shift_assignment(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.worker_respond_to_shift_assignment(uuid, text, text, text) TO authenticated;