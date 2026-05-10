-- ============================================================================
-- Phase 4 — Mobile Manage Team: safe worker notifications
--
-- All inserts use the existing `notifications` table:
--   recipient_id   = employees.id
--   recipient_type = 'employee'
-- which is the same pattern used by src/lib/dispatch-writers.ts and read by
-- src/hooks/useNotifications.tsx in the worker portal bell.
--
-- Hard rules:
--   * Never fail the calling action because of a notification error.
--   * Never notify for draft shifts.
--   * Never include address/meeting-point details in notification text.
--   * Never touch payroll / time_entries / attendance.
--   * No deletes, no schema changes outside this helper.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_shift_worker_notification(
  p_company_id   uuid,
  p_employee_id  uuid,
  p_shift_id     uuid,
  p_assignment_id uuid,
  p_type         text,
  p_title        text,
  p_message      text,
  p_source       text DEFAULT 'mobile_manage_team'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift          public.scheduled_shifts;
  v_notification_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_employee_id IS NULL OR p_shift_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Look up shift; never notify for draft / soft-deleted shifts.
  SELECT * INTO v_shift
    FROM public.scheduled_shifts
    WHERE id = p_shift_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_shift.publication_status, 'draft') = 'draft'
     OR COALESCE(v_shift.status, 'draft') = 'draft' THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.notifications (
      company_id, recipient_id, recipient_type,
      type, title, body, metadata, created_by
    ) VALUES (
      p_company_id,
      p_employee_id,
      'employee',
      COALESCE(NULLIF(p_type, ''), 'shift_assignment'),
      p_title,
      p_message,
      jsonb_build_object(
        'shift_id', p_shift_id,
        'assignment_id', p_assignment_id,
        'source', COALESCE(NULLIF(p_source, ''), 'mobile_manage_team')
      ),
      auth.uid()
    )
    RETURNING id INTO v_notification_id;
  EXCEPTION WHEN OTHERS THEN
    -- Swallow any error so the calling action stays safe.
    RETURN NULL;
  END;

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shift_worker_notification(uuid, uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_shift_worker_notification(uuid, uuid, uuid, uuid, text, text, text, text) TO authenticated;


-- ============================================================================
-- Phase 4B-1 — assign_worker_to_shift: send "New shift assignment".
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

  v_readiness := public.get_employee_shift_readiness(p_employee_id, v_shift.company_id);
  IF v_readiness NOT IN ('ready', 'grace_period') THEN
    RAISE EXCEPTION 'employee_not_ready:%', v_readiness USING ERRCODE = '22023';
  END IF;
  IF v_readiness = 'grace_period' THEN
    v_audit_reason := COALESCE(v_audit_reason || ' | ', '') || '[grace_period assignment]';
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

  -- Notification (safe, may return NULL).
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
      'notification_id', v_notification_id,
      'notification_sent', v_notification_id IS NOT NULL
    ),
    v_audit_reason,
    COALESCE(NULLIF(p_source, ''), 'mobile_manage_team')
  );

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_worker_to_shift(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_worker_to_shift(uuid, uuid, text, text, text) TO authenticated;


-- ============================================================================
-- Phase 4B-2 — set_shift_assignment_state: notify on confirmed/rejected/removed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_shift_assignment_state(
  p_assignment_id uuid,
  p_next_status text DEFAULT NULL,
  p_next_response_status text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_source text DEFAULT 'mobile_manage_team'
)
RETURNS public.shift_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.shift_assignments;
  v_before jsonb;
  v_after jsonb;
  v_cur text;
  v_next text;
  v_notif_id uuid;
  v_title text;
  v_msg text;
BEGIN
  SELECT * INTO v_assignment FROM public.shift_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_shift_company(v_assignment.company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_cur := COALESCE(v_assignment.status, 'pending');
  v_next := COALESCE(p_next_status, v_cur);

  IF v_next <> v_cur THEN
    IF NOT (
      (v_cur = 'pending'   AND v_next IN ('confirmed','rejected','removed'))
      OR (v_cur = 'accepted'  AND v_next IN ('confirmed','removed'))
      OR (v_cur = 'confirmed' AND v_next IN ('removed'))
    ) THEN
      RAISE EXCEPTION 'invalid_transition: % -> %', v_cur, v_next USING ERRCODE = '22023';
    END IF;
  END IF;

  v_before := jsonb_build_object(
    'status', v_assignment.status,
    'response_status', v_assignment.response_status,
    'responded_at', v_assignment.responded_at,
    'accepted_at', v_assignment.accepted_at,
    'rejected_at', v_assignment.rejected_at,
    'rejection_reason', v_assignment.rejection_reason
  );

  UPDATE public.shift_assignments
  SET
    status = v_next,
    response_status = COALESCE(p_next_response_status, response_status),
    responded_at = CASE WHEN v_next IN ('confirmed','rejected') THEN now() ELSE responded_at END,
    accepted_at = CASE WHEN v_next = 'confirmed' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
    rejected_at = CASE WHEN v_next = 'rejected' THEN now() ELSE rejected_at END,
    rejection_reason = CASE
      WHEN v_next IN ('rejected','removed') AND p_reason IS NOT NULL THEN p_reason
      ELSE rejection_reason
    END
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  v_after := jsonb_build_object(
    'status', v_assignment.status,
    'response_status', v_assignment.response_status,
    'responded_at', v_assignment.responded_at,
    'accepted_at', v_assignment.accepted_at,
    'rejected_at', v_assignment.rejected_at,
    'rejection_reason', v_assignment.rejection_reason
  );

  -- Notify only on meaningful transitions; skip if state unchanged.
  IF v_next <> v_cur THEN
    IF v_next = 'confirmed' THEN
      v_title := 'Shift assignment confirmed';
      v_msg := 'Your shift assignment was confirmed. Review the details in Stafly.';
    ELSIF v_next = 'rejected' THEN
      v_title := 'Shift assignment updated';
      v_msg := 'Your shift assignment was marked as rejected.';
    ELSIF v_next = 'removed' THEN
      v_title := 'Shift assignment removed';
      v_msg := 'You were removed from this shift. Contact the office if you have questions.';
    END IF;

    IF v_title IS NOT NULL THEN
      v_notif_id := public.create_shift_worker_notification(
        v_assignment.company_id, v_assignment.employee_id,
        v_assignment.shift_id, v_assignment.id,
        'shift_assignment', v_title, v_msg, p_source
      );
      v_after := v_after || jsonb_build_object(
        'notification_id', v_notif_id,
        'notification_sent', v_notif_id IS NOT NULL
      );
    END IF;
  END IF;

  INSERT INTO public.shift_audit_log(
    company_id, shift_id, assignment_id, employee_id, actor_user_id,
    action, before_data, after_data, reason, source
  ) VALUES (
    v_assignment.company_id, v_assignment.shift_id, v_assignment.id, v_assignment.employee_id, auth.uid(),
    'assignment_state_change:' || v_cur || '->' || v_next,
    v_before, v_after, p_reason, p_source
  );

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.set_shift_assignment_state(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_shift_assignment_state(uuid, text, text, text, text) TO authenticated;


-- ============================================================================
-- Phase 4B-3 — resolve_shift_request: notify on approved/rejected.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_shift_request(
  p_request_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_source text DEFAULT 'mobile_manage_team'
)
RETURNS public.shift_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.shift_requests;
  v_assignment public.shift_assignments;
  v_before jsonb;
  v_after jsonb;
  v_notif_id uuid;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.shift_requests WHERE id = p_request_id;
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
    UPDATE public.shift_requests
      SET status = 'approved', reviewed_by = auth.uid(),
          reviewed_at = now(), updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;

    SELECT * INTO v_assignment
      FROM public.shift_assignments
      WHERE shift_id = v_request.shift_id AND employee_id = v_request.employee_id
      LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.shift_assignments(
        company_id, shift_id, employee_id, status, response_status,
        responded_at, accepted_at
      ) VALUES (
        v_request.company_id, v_request.shift_id, v_request.employee_id,
        'confirmed', 'accepted', now(), now()
      ) RETURNING * INTO v_assignment;
    ELSE
      UPDATE public.shift_assignments
        SET status = CASE WHEN status IN ('removed','rejected') THEN status ELSE 'confirmed' END,
            response_status = CASE WHEN status IN ('removed','rejected') THEN response_status ELSE 'accepted' END,
            responded_at = COALESCE(responded_at, now()),
            accepted_at = COALESCE(accepted_at, now())
        WHERE id = v_assignment.id RETURNING * INTO v_assignment;
    END IF;

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
      'notification_id', v_notif_id,
      'notification_sent', v_notif_id IS NOT NULL
    );

    INSERT INTO public.shift_audit_log(
      company_id, shift_id, assignment_id, employee_id, actor_user_id,
      action, before_data, after_data, reason, source
    ) VALUES (
      v_request.company_id, v_request.shift_id, v_assignment.id, v_request.employee_id, auth.uid(),
      'claim_approved', v_before, v_after, p_reason, p_source
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
      'claim_rejected', v_before, v_after, p_reason, p_source
    );
  END IF;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_shift_request(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_shift_request(uuid, text, text, text) TO authenticated;