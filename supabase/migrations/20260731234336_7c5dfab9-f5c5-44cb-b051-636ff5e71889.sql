CREATE OR REPLACE FUNCTION public.assign_worker_to_shift(p_shift_id uuid, p_employee_id uuid, p_assignment_role text DEFAULT 'worker'::text, p_reason text DEFAULT NULL::text, p_source text DEFAULT 'mobile_manage_team'::text)
 RETURNS shift_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shift           public.scheduled_shifts;
  v_emp_company_id  uuid;
  v_is_active       boolean;
  v_existing        public.shift_assignments;
  v_assignment      public.shift_assignments;
  v_status          jsonb;
  v_readiness       text;
  v_compliance      text;
  v_has_override    boolean;
  v_audit_reason    text := p_reason;
  v_notification_id uuid;
BEGIN
  IF p_shift_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_shift FROM public.scheduled_shifts
    WHERE id = p_shift_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_shift_company(v_shift.company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT company_id, COALESCE(is_active, true)
    INTO v_emp_company_id, v_is_active
    FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp_company_id IS DISTINCT FROM v_shift.company_id THEN
    RAISE EXCEPTION 'employee_wrong_company' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_active THEN
    RAISE EXCEPTION 'employee_inactive' USING ERRCODE = '22023';
  END IF;

  -- ── Single source of truth: get_employee_assignment_status
  v_status       := public.get_employee_assignment_status(p_employee_id, v_shift.company_id);
  v_readiness    := v_status->>'readiness';
  v_compliance   := v_status->>'compliance_status';
  v_has_override := public.has_active_assignment_override(p_shift_id, p_employee_id);

  IF NOT v_has_override THEN
    IF (v_status->>'requires_override')::boolean THEN
      RAISE EXCEPTION 'compliance_override_required:%', v_compliance USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE((v_status->>'can_assign')::boolean, false) THEN
      RAISE EXCEPTION 'compliance_blocked:%', v_compliance USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_has_override THEN
    v_audit_reason := COALESCE(v_audit_reason || ' | ', '') || '[admin_override active]';
  ELSIF v_compliance IS DISTINCT FROM 'clear' THEN
    v_audit_reason := COALESCE(v_audit_reason || ' | ', '') || '[compliance_warning: ' || v_compliance || ']';
  END IF;

  SELECT * INTO v_existing
    FROM public.shift_assignments
    WHERE shift_id = p_shift_id AND employee_id = p_employee_id
      AND status NOT IN ('rejected', 'removed')
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'already_assigned:%', v_existing.id USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.shift_assignments (
    company_id, shift_id, employee_id,
    status, response_status, assignment_role,
    response_required, is_draft_reservation
  ) VALUES (
    v_shift.company_id, p_shift_id, p_employee_id,
    'pending', 'pending', COALESCE(NULLIF(p_assignment_role, ''), 'worker'),
    true, false
  ) RETURNING * INTO v_assignment;

  v_notification_id := public.create_shift_worker_notification(
    v_shift.company_id, p_employee_id, p_shift_id, v_assignment.id,
    'shift_assignment',
    'New shift assignment',
    'You have a new shift assignment in Stafly. Please review and accept or reject.',
    p_source
  );

  INSERT INTO public.shift_audit_log(
    company_id, shift_id, assignment_id, employee_id, actor_user_id,
    action, before_data, after_data, reason, source
  ) VALUES (
    v_shift.company_id, p_shift_id, v_assignment.id, p_employee_id, auth.uid(),
    'assignment_created', NULL,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'status', v_assignment.status,
      'response_status', v_assignment.response_status,
      'assignment_role', v_assignment.assignment_role,
      'readiness', v_readiness,
      'compliance_status', v_compliance,
      'policy', v_status->>'policy',
      'admin_override', v_has_override,
      'notification_id', v_notification_id,
      'notification_sent', v_notification_id IS NOT NULL
    ),
    v_audit_reason,
    COALESCE(NULLIF(p_source, ''), 'mobile_manage_team')
  );

  RETURN v_assignment;
END;
$function$;