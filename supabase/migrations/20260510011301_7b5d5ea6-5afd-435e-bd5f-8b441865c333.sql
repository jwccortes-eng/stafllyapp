-- Phase 5E — add action hint to worker notification metadata for deep-linking.
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
  v_shift           public.scheduled_shifts;
  v_notification_id uuid;
  v_action          text;
BEGIN
  IF p_company_id IS NULL OR p_employee_id IS NULL OR p_shift_id IS NULL THEN
    RETURN NULL;
  END IF;

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

  v_action := CASE
    WHEN p_type = 'shift_claim_approved'  THEN 'review_shift_assignment'
    WHEN p_type = 'shift_claim_rejected'  THEN 'review_claim_decision'
    WHEN p_type = 'shift_assignment'      THEN 'review_shift_assignment'
    ELSE 'review_shift_assignment'
  END;

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
        'source', COALESCE(NULLIF(p_source, ''), 'mobile_manage_team'),
        'action', v_action
      ),
      auth.uid()
    )
    RETURNING id INTO v_notification_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  RETURN v_notification_id;
END;
$$;