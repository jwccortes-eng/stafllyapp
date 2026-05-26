
-- ============================================================
-- StaflyCore — Attendance Corrections Phase B/C v1
-- Safe, audited correction workflow on top of existing
-- time_entries + shift_audit_log. No new tables. No RLS changes.
-- ============================================================

-- Helper: is the caller a privileged platform-level reviewer
-- (developer / owner / founder)? These roles may self-review.
CREATE OR REPLACE FUNCTION public.is_privileged_reviewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('developer','owner','founder')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_privileged_reviewer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_privileged_reviewer(uuid) TO postgres, service_role;

-- Helper: can the caller PROPOSE a correction for this shift?
-- (Admins via can_manage_shift_company OR the designated shift_admin
-- via scheduled_shifts.shift_admin_id.)
CREATE OR REPLACE FUNCTION public.can_request_shift_correction(_company_id uuid, _shift_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_shift_company(_company_id)
    OR EXISTS (
      SELECT 1
      FROM public.scheduled_shifts s
      JOIN public.employees e ON e.id = s.shift_admin_id
      WHERE s.id = _shift_id
        AND s.company_id = _company_id
        AND e.user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_request_shift_correction(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_request_shift_correction(uuid, uuid) TO postgres, service_role;

-- ============================================================
-- RPC: request_time_entry_correction
-- ============================================================
-- Correction types:
--   missing_clock_in, missing_clock_out, adjust_clock_in,
--   adjust_clock_out, manual_entry, day_pay_validation
--
-- For missing_*/manual_entry/day_pay_validation:
--   inserts a NEW time_entries row with status='pending_correction'.
--
-- For adjust_clock_in/adjust_clock_out:
--   ALSO inserts a NEW pending row referencing the original via
--   after_data.target_time_entry_id. The original raw punch is NOT
--   touched until a reviewer approves.
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_time_entry_correction(
  p_company_id uuid,
  p_shift_id uuid,
  p_employee_id uuid,
  p_time_entry_id uuid,
  p_correction_type text,
  p_corrected_clock_in timestamptz,
  p_corrected_clock_out timestamptz,
  p_reason text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_original public.time_entries%ROWTYPE;
  v_new_id uuid;
  v_entry_source text;
  v_before jsonb;
  v_after jsonb;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
BEGIN
  -- 1. Authn.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'correction_requires_auth' USING ERRCODE = '28000';
  END IF;

  -- 2. Reason required.
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'correction_reason_required' USING ERRCODE = '22023';
  END IF;

  -- 3. Correction type allowed.
  IF p_correction_type NOT IN (
    'missing_clock_in','missing_clock_out',
    'adjust_clock_in','adjust_clock_out',
    'manual_entry','day_pay_validation'
  ) THEN
    RAISE EXCEPTION 'correction_type_invalid:%', p_correction_type USING ERRCODE = '22023';
  END IF;

  -- 4. Authz: proposer must be admin or shift_admin.
  IF NOT public.can_request_shift_correction(p_company_id, p_shift_id) THEN
    RAISE EXCEPTION 'correction_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 5. Load original if referenced (for adjusts).
  IF p_time_entry_id IS NOT NULL THEN
    SELECT * INTO v_original
    FROM public.time_entries
    WHERE id = p_time_entry_id
      AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'correction_original_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. Resolve entry_source.
  v_entry_source := CASE
    WHEN p_correction_type = 'day_pay_validation' THEN 'day_pay_validation'
    ELSE 'manual_correction'
  END;

  -- 7. Resolve proposed clock_in / clock_out per correction_type.
  v_clock_in  := p_corrected_clock_in;
  v_clock_out := p_corrected_clock_out;

  IF p_correction_type = 'adjust_clock_in' THEN
    IF v_clock_in IS NULL THEN
      RAISE EXCEPTION 'correction_clock_in_required' USING ERRCODE = '22023';
    END IF;
    -- carry original clock_out so the pending row is complete context
    v_clock_out := COALESCE(v_clock_out, v_original.clock_out);
  ELSIF p_correction_type = 'adjust_clock_out' THEN
    IF v_clock_out IS NULL THEN
      RAISE EXCEPTION 'correction_clock_out_required' USING ERRCODE = '22023';
    END IF;
    v_clock_in := COALESCE(v_clock_in, v_original.clock_in);
  ELSIF p_correction_type = 'missing_clock_in' THEN
    IF v_clock_in IS NULL THEN
      RAISE EXCEPTION 'correction_clock_in_required' USING ERRCODE = '22023';
    END IF;
  ELSIF p_correction_type = 'missing_clock_out' THEN
    IF v_clock_out IS NULL THEN
      RAISE EXCEPTION 'correction_clock_out_required' USING ERRCODE = '22023';
    END IF;
    -- carry over from original open entry if provided
    v_clock_in := COALESCE(v_clock_in, v_original.clock_in);
  ELSIF p_correction_type = 'manual_entry' THEN
    IF v_clock_in IS NULL OR v_clock_out IS NULL THEN
      RAISE EXCEPTION 'correction_manual_entry_requires_both' USING ERRCODE = '22023';
    END IF;
  END IF;
  -- day_pay_validation: clock_in/out optional

  -- 8. Insert the pending correction row (always a NEW row; never
  --    overwrites raw evidence).
  INSERT INTO public.time_entries (
    company_id, employee_id, shift_id,
    clock_in, clock_out,
    notes, status, entry_source
  )
  VALUES (
    p_company_id, p_employee_id, p_shift_id,
    v_clock_in, v_clock_out,
    NULLIF(btrim(coalesce(p_note,'')), ''),
    'pending_correction',
    v_entry_source
  )
  RETURNING id INTO v_new_id;

  -- 9. Audit log.
  IF p_time_entry_id IS NOT NULL THEN
    v_before := to_jsonb(v_original);
  ELSE
    v_before := NULL;
  END IF;

  v_after := jsonb_build_object(
    'correction_type', p_correction_type,
    'pending_time_entry_id', v_new_id,
    'target_time_entry_id', p_time_entry_id,
    'clock_in', v_clock_in,
    'clock_out', v_clock_out,
    'note', p_note
  );

  INSERT INTO public.shift_audit_log (
    company_id, shift_id, employee_id, actor_user_id,
    action, before_data, after_data, reason, source
  )
  VALUES (
    p_company_id, p_shift_id, p_employee_id, v_uid,
    'time_entry.correction_requested',
    v_before, v_after, p_reason, 'captain_correction'
  );

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_time_entry_correction(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_time_entry_correction(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text) TO authenticated;

-- ============================================================
-- RPC: review_time_entry_correction
-- ============================================================
-- approved:
--   * for adjust_*: COPY pending clock_in/out to the original row
--     (full before/after audit), then DELETE the pending row.
--     Mark original entry status='approved', set approved_by/at.
--   * otherwise: mark the pending row status='approved',
--     set approved_by/at.
--
-- rejected:
--   * mark the pending row status='rejected'. Raw original (if any)
--     was never modified. Pending row is preserved as visible
--     evidence of the rejected proposal.
-- ============================================================
CREATE OR REPLACE FUNCTION public.review_time_entry_correction(
  p_pending_time_entry_id uuid,
  p_decision text,
  p_review_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pending public.time_entries%ROWTYPE;
  v_audit RECORD;
  v_target_id uuid;
  v_correction_type text;
  v_target public.time_entries%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'review_requires_auth' USING ERRCODE = '28000';
  END IF;

  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'review_decision_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pending
  FROM public.time_entries
  WHERE id = p_pending_time_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_pending_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_pending.status <> 'pending_correction' THEN
    RAISE EXCEPTION 'review_already_resolved' USING ERRCODE = '22023';
  END IF;

  -- Permission: shift_closeout_can_admin OR privileged.
  IF NOT (
    public.shift_closeout_can_admin(v_pending.company_id)
    OR public.is_privileged_reviewer(v_uid)
  ) THEN
    RAISE EXCEPTION 'review_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Find the original "correction_requested" audit row to detect
  -- self-review and to recover target_time_entry_id / correction_type.
  SELECT actor_user_id,
         (after_data->>'target_time_entry_id')::uuid AS target_id,
         after_data->>'correction_type' AS correction_type
    INTO v_audit
  FROM public.shift_audit_log
  WHERE action = 'time_entry.correction_requested'
    AND (after_data->>'pending_time_entry_id')::uuid = p_pending_time_entry_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Block self-review unless privileged.
  IF v_audit.actor_user_id IS NOT NULL
     AND v_audit.actor_user_id = v_uid
     AND NOT public.is_privileged_reviewer(v_uid) THEN
    RAISE EXCEPTION 'review_self_review_blocked' USING ERRCODE = '42501';
  END IF;

  v_target_id := v_audit.target_id;
  v_correction_type := v_audit.correction_type;

  IF p_decision = 'rejected' THEN
    UPDATE public.time_entries
       SET status = 'rejected',
           notes = COALESCE(NULLIF(btrim(p_review_note),''), notes)
     WHERE id = p_pending_time_entry_id;

    INSERT INTO public.shift_audit_log (
      company_id, shift_id, employee_id, actor_user_id,
      action, before_data, after_data, reason, source
    )
    VALUES (
      v_pending.company_id, v_pending.shift_id, v_pending.employee_id, v_uid,
      'time_entry.correction_rejected',
      to_jsonb(v_pending),
      jsonb_build_object(
        'pending_time_entry_id', p_pending_time_entry_id,
        'target_time_entry_id', v_target_id,
        'correction_type', v_correction_type,
        'review_note', p_review_note
      ),
      p_review_note, 'reviewer_decision'
    );
    RETURN;
  END IF;

  -- approved
  IF v_correction_type IN ('adjust_clock_in','adjust_clock_out')
     AND v_target_id IS NOT NULL THEN
    SELECT * INTO v_target
    FROM public.time_entries
    WHERE id = v_target_id
      AND company_id = v_pending.company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'review_target_missing' USING ERRCODE = '22023';
    END IF;

    v_before := to_jsonb(v_target);

    UPDATE public.time_entries
       SET clock_in  = v_pending.clock_in,
           clock_out = v_pending.clock_out,
           status = 'approved',
           approved_by = v_uid,
           approved_at = now(),
           entry_source = COALESCE(entry_source, 'clock')
     WHERE id = v_target_id;

    SELECT to_jsonb(t.*) INTO v_after
    FROM public.time_entries t
    WHERE t.id = v_target_id;

    -- Remove pending row now that change is applied.
    DELETE FROM public.time_entries
    WHERE id = p_pending_time_entry_id;

    INSERT INTO public.shift_audit_log (
      company_id, shift_id, employee_id, actor_user_id,
      action, before_data, after_data, reason, source
    )
    VALUES (
      v_pending.company_id, v_pending.shift_id, v_pending.employee_id, v_uid,
      'time_entry.correction_approved',
      v_before,
      v_after || jsonb_build_object(
        'pending_time_entry_id', p_pending_time_entry_id,
        'target_time_entry_id', v_target_id,
        'correction_type', v_correction_type,
        'review_note', p_review_note
      ),
      p_review_note, 'reviewer_decision'
    );
    RETURN;
  END IF;

  -- non-adjust types: just promote the pending row.
  UPDATE public.time_entries
     SET status = 'approved',
         approved_by = v_uid,
         approved_at = now()
   WHERE id = p_pending_time_entry_id;

  SELECT to_jsonb(t.*) INTO v_after
  FROM public.time_entries t
  WHERE t.id = p_pending_time_entry_id;

  INSERT INTO public.shift_audit_log (
    company_id, shift_id, employee_id, actor_user_id,
    action, before_data, after_data, reason, source
  )
  VALUES (
    v_pending.company_id, v_pending.shift_id, v_pending.employee_id, v_uid,
    'time_entry.correction_approved',
    to_jsonb(v_pending),
    v_after || jsonb_build_object(
      'pending_time_entry_id', p_pending_time_entry_id,
      'correction_type', v_correction_type,
      'review_note', p_review_note
    ),
    p_review_note, 'reviewer_decision'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_time_entry_correction(uuid,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.review_time_entry_correction(uuid,text,text) TO authenticated;

-- ============================================================
-- Read helper: list_shift_corrections(shift_id)
-- Returns pending + recently resolved corrections for a shift,
-- with side-by-side original vs proposed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_shift_corrections(p_shift_id uuid)
RETURNS TABLE (
  pending_time_entry_id uuid,
  company_id uuid,
  shift_id uuid,
  employee_id uuid,
  correction_type text,
  status text,
  proposed_clock_in timestamptz,
  proposed_clock_out timestamptz,
  original_clock_in timestamptz,
  original_clock_out timestamptz,
  target_time_entry_id uuid,
  reason text,
  note text,
  requested_by uuid,
  requested_at timestamptz,
  reviewed_at timestamptz,
  approved_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH req AS (
    SELECT
      (after_data->>'pending_time_entry_id')::uuid AS pending_id,
      (after_data->>'target_time_entry_id')::uuid AS target_id,
      after_data->>'correction_type' AS correction_type,
      after_data->>'note' AS note,
      before_data,
      actor_user_id AS requested_by,
      created_at AS requested_at,
      reason
    FROM public.shift_audit_log
    WHERE shift_id = p_shift_id
      AND action = 'time_entry.correction_requested'
  )
  SELECT
    te.id AS pending_time_entry_id,
    te.company_id,
    te.shift_id,
    te.employee_id,
    r.correction_type,
    te.status,
    te.clock_in  AS proposed_clock_in,
    te.clock_out AS proposed_clock_out,
    (r.before_data->>'clock_in')::timestamptz  AS original_clock_in,
    (r.before_data->>'clock_out')::timestamptz AS original_clock_out,
    r.target_id AS target_time_entry_id,
    r.reason,
    r.note,
    r.requested_by,
    r.requested_at,
    te.approved_at AS reviewed_at,
    te.approved_by
  FROM public.time_entries te
  JOIN req r ON r.pending_id = te.id
  WHERE te.shift_id = p_shift_id
    AND te.status IN ('pending_correction','rejected')
    AND public.can_manage_shift_company(te.company_id);
$$;

REVOKE EXECUTE ON FUNCTION public.list_shift_corrections(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_shift_corrections(uuid) TO authenticated;
