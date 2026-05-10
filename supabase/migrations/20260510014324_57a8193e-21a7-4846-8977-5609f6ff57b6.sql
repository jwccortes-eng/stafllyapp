CREATE OR REPLACE FUNCTION public.worker_respond_to_shift_assignment(
  p_assignment_id uuid,
  p_response text,
  p_reason text DEFAULT NULL::text,
  p_source text DEFAULT 'worker_portal'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_assignment public.shift_assignments%ROWTYPE;
  v_shift public.scheduled_shifts%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_before jsonb;
  v_after  jsonb;
  v_audit_id uuid;
  v_now timestamptz := now();
  v_version int;
  v_worker_name text;
  v_admin RECORD;
  v_notif_id uuid;
  v_notif_ids uuid[] := ARRAY[]::uuid[];
  v_notif_sent boolean := false;
  v_title text;
  v_body text;
  v_type text;
  v_metadata jsonb;
  v_shift_label text;
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

  IF v_shift.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'SHIFT_NOT_PUBLISHED' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_shift.publication_status, 'draft') = 'draft'
     OR COALESCE(v_shift.status, 'draft') = 'draft' THEN
    RAISE EXCEPTION 'SHIFT_NOT_PUBLISHED' USING ERRCODE = '22023';
  END IF;

  v_before := to_jsonb(v_assignment);
  v_version := COALESCE(v_shift.operational_version, 1);

  IF p_response = 'accepted' THEN
    UPDATE public.shift_assignments
       SET status = 'confirmed',
           response_status = 'accepted',
           response_required = false,
           accepted_at = v_now,
           responded_at = v_now,
           accepted_shift_version = v_version,
           rejection_reason = NULL,
           rejected_at = NULL
     WHERE id = p_assignment_id
     RETURNING * INTO v_assignment;
  ELSE
    UPDATE public.shift_assignments
       SET status = 'rejected',
           response_status = 'rejected',
           response_required = false,
           rejected_at = v_now,
           responded_at = v_now,
           rejection_reason = NULLIF(btrim(COALESCE(p_reason,'')), '')
     WHERE id = p_assignment_id
     RETURNING * INTO v_assignment;
  END IF;

  -- Build admin notification (best-effort, never fails the response).
  v_worker_name := btrim(COALESCE(v_employee.first_name,'') || ' ' || COALESCE(v_employee.last_name,''));
  IF v_worker_name = '' THEN v_worker_name := 'A worker'; END IF;
  v_shift_label := COALESCE(NULLIF(btrim(v_shift.title), ''), 'shift') ||
                   CASE WHEN v_shift.date IS NOT NULL
                        THEN ' (' || to_char(v_shift.date::date, 'DD Mon') || ')'
                        ELSE '' END;

  IF p_response = 'accepted' THEN
    v_type := 'shift_confirmed';
    v_title := '✅ Worker accepted shift';
    v_body  := v_worker_name || ' accepted ' || v_shift_label || '.';
  ELSE
    v_type := 'shift_rejected';
    v_title := '❌ Worker rejected shift';
    v_body  := v_worker_name || ' rejected ' || v_shift_label || '.';
  END IF;

  v_metadata := jsonb_build_object(
    'shift_id', v_shift.id,
    'assignment_id', v_assignment.id,
    'employee_id', v_employee.id,
    'response', p_response,
    'source', COALESCE(p_source, 'worker_portal'),
    'action', 'review_worker_response',
    'rejection_reason', CASE WHEN p_response = 'rejected' THEN v_assignment.rejection_reason ELSE NULL END
  );

  BEGIN
    FOR v_admin IN
      SELECT DISTINCT cu.user_id
        FROM public.company_users cu
       WHERE cu.company_id = v_shift.company_id
         AND cu.role IN ('admin','owner','company_owner','manager')
         AND cu.user_id IS NOT NULL
    LOOP
      BEGIN
        INSERT INTO public.notifications (
          company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
        ) VALUES (
          v_shift.company_id, v_admin.user_id, 'user', v_type, v_title, v_body, v_metadata, v_uid
        )
        RETURNING id INTO v_notif_id;
        v_notif_ids := v_notif_ids || v_notif_id;
        v_notif_sent := true;
      EXCEPTION WHEN OTHERS THEN
        -- per-admin failure is non-fatal
        NULL;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    v_notif_sent := false;
  END;

  v_after := to_jsonb(v_assignment)
            || jsonb_build_object(
                 'admin_notification_sent', v_notif_sent,
                 'admin_notification_ids', to_jsonb(v_notif_ids)
               );

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
    'audit_log_id', v_audit_id,
    'admin_notification_sent', v_notif_sent,
    'admin_notification_count', array_length(v_notif_ids, 1)
  );
END;
$function$;