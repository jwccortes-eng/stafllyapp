CREATE OR REPLACE FUNCTION public.resolve_shift_request(p_request_id uuid, p_decision text, p_reason text DEFAULT NULL::text, p_source text DEFAULT 'mobile_manage_team'::text)
 RETURNS shift_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.shift_requests;
  v_shift public.scheduled_shifts;
  v_assignment public.shift_assignments;
  v_before jsonb;
  v_after jsonb;
  v_notif_id uuid;
  v_active_count integer;
  v_slots integer;
  v_emp_company uuid;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.shift_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_shift_company(v_request.company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = '22023';
  END IF;

  v_before := jsonb_build_object('status', v_request.status, 'rejection_reason', v_request.rejection_reason);

  IF p_decision = 'approved' THEN
    -- Lock the shift row: serializes concurrent approvals on the same service.
    SELECT * INTO v_shift FROM public.scheduled_shifts
      WHERE id = v_request.shift_id FOR UPDATE;
    IF NOT FOUND OR v_shift.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_shift.company_id IS DISTINCT FROM v_request.company_id THEN
      RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(v_shift.status,'') IN ('cancelled','canceled') THEN
      RAISE EXCEPTION 'shift_cancelled' USING ERRCODE = '22023';
    END IF;

    SELECT company_id INTO v_emp_company FROM public.employees WHERE id = v_request.employee_id;
    IF v_emp_company IS DISTINCT FROM v_request.company_id THEN
      RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
    END IF;

    -- Capacity SSOT: only non-excluded statuses consume a slot.
    SELECT count(*) INTO v_active_count
      FROM public.shift_assignments sa
     WHERE sa.shift_id = v_request.shift_id
       AND sa.employee_id IS DISTINCT FROM v_request.employee_id
       AND sa.status NOT IN ('rejected','removed','declined','cancelled','canceled','unassigned','replaced');

    v_slots := GREATEST(COALESCE(v_shift.slots, 1), 1);
    IF v_active_count >= v_slots THEN
      RAISE EXCEPTION 'no_capacity:%/%', v_active_count, v_slots USING ERRCODE = '22023';
    END IF;

    -- Reuse existing active assignment if any; otherwise canonical creation path
    -- (compliance, eligibility, duplicates, overlap trigger, audit).
    SELECT * INTO v_assignment
      FROM public.shift_assignments
      WHERE shift_id = v_request.shift_id
        AND employee_id = v_request.employee_id
        AND status NOT IN ('rejected','removed','declined','cancelled','canceled','unassigned','replaced')
      ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
      v_assignment := public.assign_worker_to_shift(
        v_request.shift_id, v_request.employee_id, 'worker',
        COALESCE(p_reason, 'claim_approved'), COALESCE(NULLIF(p_source,''), 'shift_requests')
      );
    END IF;

    IF v_assignment.status IS DISTINCT FROM 'confirmed' THEN
      PERFORM public.set_shift_assignment_state(
        v_assignment.id, 'confirmed', 'accepted',
        COALESCE(p_reason, 'claim_approved'), COALESCE(NULLIF(p_source,''), 'shift_requests')
      );
      SELECT * INTO v_assignment FROM public.shift_assignments WHERE id = v_assignment.id;
    END IF;

    -- Request is only marked approved once the assignment exists.
    UPDATE public.shift_requests
      SET status = 'approved', reviewed_by = auth.uid(),
          reviewed_at = now(), updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;

    v_notif_id := public.create_shift_worker_notification(
      v_request.company_id, v_request.employee_id,
      v_request.shift_id, v_assignment.id,
      'shift_claim_approved',
      'Shift claim approved',
      'Your request to work this shift was approved. Review the details in Stafly.',
      p_source
    );

    v_after := jsonb_build_object(
      'status', v_request.status,
      'assignment_id', v_assignment.id,
      'assignment_status', v_assignment.status,
      'capacity_before', v_active_count,
      'slots', v_slots,
      'path', 'assign_worker_to_shift',
      'notification_id', v_notif_id,
      'notification_sent', v_notif_id IS NOT NULL
    );

    INSERT INTO public.shift_audit_log(
      company_id, shift_id, assignment_id, employee_id, actor_user_id,
      action, before_data, after_data, reason, source
    ) VALUES (
      v_request.company_id, v_request.shift_id, v_assignment.id, v_request.employee_id, auth.uid(),
      'claim_approved', v_before || jsonb_build_object('request_id', p_request_id), v_after, p_reason, p_source
    );

  ELSE
    UPDATE public.shift_requests
      SET status = 'rejected', reviewed_by = auth.uid(),
          reviewed_at = now(), rejection_reason = p_reason, updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;

    v_notif_id := public.create_shift_worker_notification(
      v_request.company_id, v_request.employee_id,
      v_request.shift_id, NULL,
      'shift_claim_rejected',
      'Shift claim reviewed',
      'Your request to work this shift was not approved.',
      p_source
    );

    v_after := jsonb_build_object(
      'status', v_request.status,
      'rejection_reason', v_request.rejection_reason,
      'notification_id', v_notif_id,
      'notification_sent', v_notif_id IS NOT NULL
    );

    INSERT INTO public.shift_audit_log(
      company_id, shift_id, assignment_id, employee_id, actor_user_id,
      action, before_data, after_data, reason, source
    ) VALUES (
      v_request.company_id, v_request.shift_id, NULL, v_request.employee_id, auth.uid(),
      'claim_rejected', v_before || jsonb_build_object('request_id', p_request_id), v_after, p_reason, p_source
    );
  END IF;

  RETURN v_request;
END;
$function$;