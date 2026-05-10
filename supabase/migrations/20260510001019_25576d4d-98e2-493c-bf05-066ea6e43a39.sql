
-- ============================================================
-- Phase 2A: shift_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shift_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  assignment_id uuid,
  employee_id uuid,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  source text NOT NULL DEFAULT 'mobile_manage_team',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sal_company_shift ON public.shift_audit_log(company_id, shift_id);
CREATE INDEX IF NOT EXISTS idx_sal_assignment   ON public.shift_audit_log(assignment_id);
CREATE INDEX IF NOT EXISTS idx_sal_employee     ON public.shift_audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_sal_created_at   ON public.shift_audit_log(created_at DESC);

ALTER TABLE public.shift_audit_log ENABLE ROW LEVEL SECURITY;

-- Authorization helper for shift staffing actions.
CREATE OR REPLACE FUNCTION public.can_manage_shift_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL AND (
      public.has_role(auth.uid(), 'developer'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'founder'::app_role)
      OR public.user_is_company_admin(auth.uid(), _company_id)
      OR public.has_company_role(auth.uid(), _company_id, 'manager')
      OR public.has_company_role(auth.uid(), _company_id, 'supervisor')
    );
$$;

CREATE POLICY "shift_audit_log_select_authorized"
  ON public.shift_audit_log FOR SELECT
  USING (public.can_manage_shift_company(company_id));

CREATE POLICY "shift_audit_log_insert_authorized"
  ON public.shift_audit_log FOR INSERT
  WITH CHECK (public.can_manage_shift_company(company_id));

-- No UPDATE / DELETE policies → immutable.

-- ============================================================
-- Phase 2B: set_shift_assignment_state
-- ============================================================
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

  -- Allowed transitions (Phase 2)
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
    responded_at = CASE
      WHEN v_next IN ('confirmed','rejected') THEN now()
      ELSE responded_at
    END,
    accepted_at = CASE
      WHEN v_next = 'confirmed' THEN COALESCE(accepted_at, now())
      ELSE accepted_at
    END,
    rejected_at = CASE
      WHEN v_next = 'rejected' THEN now()
      ELSE rejected_at
    END,
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

-- ============================================================
-- Phase 2C: resolve_shift_request
-- ============================================================
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
      SET status = 'approved',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          updated_at = now()
      WHERE id = p_request_id
    RETURNING * INTO v_request;

    -- Find existing assignment for this shift+employee
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
        WHERE id = v_assignment.id
      RETURNING * INTO v_assignment;
    END IF;

    v_after := jsonb_build_object('status', v_request.status, 'assignment_id', v_assignment.id);

    INSERT INTO public.shift_audit_log(
      company_id, shift_id, assignment_id, employee_id, actor_user_id,
      action, before_data, after_data, reason, source
    ) VALUES (
      v_request.company_id, v_request.shift_id, v_assignment.id, v_request.employee_id, auth.uid(),
      'claim_approved', v_before, v_after, p_reason, p_source
    );

  ELSE  -- rejected
    UPDATE public.shift_requests
      SET status = 'rejected',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          rejection_reason = p_reason,
          updated_at = now()
      WHERE id = p_request_id
    RETURNING * INTO v_request;

    v_after := jsonb_build_object('status', v_request.status, 'rejection_reason', v_request.rejection_reason);

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
