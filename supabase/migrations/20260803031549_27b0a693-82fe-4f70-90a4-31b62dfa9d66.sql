CREATE OR REPLACE FUNCTION public.versioned_assignment_transition(
  p_assignment_id uuid,
  p_company_id uuid,
  p_transition text,
  p_expected_status text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_target_employee_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_surface text DEFAULT NULL,
  p_intent_key text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_a           public.shift_assignments;
  v_after       public.shift_assignments;
  v_uid         uuid := auth.uid();
  v_is_manager  boolean := false;
  v_is_owner_worker boolean := false;
  v_before      jsonb;
  v_prev_status text;
  v_prev_version int;
  v_result      jsonb;
  v_delegated   jsonb;
  v_role        text;
  v_driver_impact text := 'none';
  v_captain_impact text := 'none';
  v_next_driver uuid;
  v_new_assignment public.shift_assignments;
  v_required int := 0;
  v_assigned int := 0;
  v_confirmed int := 0;
  v_replay    jsonb;
  v_err       text;
BEGIN
  IF p_assignment_id IS NULL OR p_transition IS NULL THEN
    RETURN jsonb_build_object('status','invalid','success',false,'reason','invalid_input',
                              'payroll_protected',true,'next_action','reload');
  END IF;

  IF p_intent_key IS NOT NULL THEN
    SELECT after_values INTO v_replay
      FROM public.versioned_write_audit
     WHERE entity = 'shift_assignments' AND intent_key = p_intent_key AND result = 'applied'
     ORDER BY created_at DESC LIMIT 1;
    IF v_replay IS NOT NULL THEN
      RETURN v_replay || jsonb_build_object('replayed', true);
    END IF;
  END IF;

  SELECT * INTO v_a FROM public.shift_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','success',false,'reason','assignment_not_found',
                              'payroll_protected',true,'next_action','reload');
  END IF;

  IF p_company_id IS NOT NULL AND p_company_id IS DISTINCT FROM v_a.company_id THEN
    INSERT INTO public.versioned_write_audit(entity, entity_id, company_id, actor_id, expected_version,
      actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
    VALUES ('shift_assignments', v_a.id, p_company_id, v_uid, p_expected_version, v_a.version,
      'tenant_mismatch', ARRAY[p_transition], p_surface, p_intent_key, 'denied', p_reason);
    RETURN jsonb_build_object('status','denied','success',false,'reason','tenant_mismatch',
                              'payroll_protected',true,'next_action','reload');
  END IF;

  v_is_manager := public.can_manage_shift_company(v_a.company_id);
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = v_a.employee_id AND e.user_id IS NOT NULL AND e.user_id = v_uid
  ) INTO v_is_owner_worker;

  IF NOT (v_is_manager OR (v_is_owner_worker AND p_transition IN ('accept','reject'))) THEN
    INSERT INTO public.versioned_write_audit(entity, entity_id, company_id, actor_id, expected_version,
      actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
    VALUES ('shift_assignments', v_a.id, v_a.company_id, v_uid, p_expected_version, v_a.version,
      'forbidden', ARRAY[p_transition], p_surface, p_intent_key, 'denied', p_reason);
    RETURN jsonb_build_object('status','denied','success',false,'reason','forbidden',
                              'payroll_protected',true,'next_action','request_access');
  END IF;

  IF (p_expected_version IS NOT NULL AND p_expected_version IS DISTINCT FROM v_a.version)
     OR (p_expected_status IS NOT NULL AND p_expected_status IS DISTINCT FROM v_a.status) THEN
    INSERT INTO public.versioned_write_audit(entity, entity_id, company_id, actor_id, expected_version,
      actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason, after_values)
    VALUES ('shift_assignments', v_a.id, v_a.company_id, v_uid, p_expected_version, v_a.version,
      CASE WHEN p_expected_status IS NOT NULL AND p_expected_status IS DISTINCT FROM v_a.status
           THEN 'stale_status' ELSE 'stale_version' END,
      ARRAY[p_transition], p_surface, p_intent_key, 'conflict', p_reason, to_jsonb(v_a));
    RETURN jsonb_build_object(
      'status','conflict','success',false,'conflict',true,'reason','stale_state',
      'expected_status', p_expected_status, 'actual_status', v_a.status,
      'previous_status', v_a.status, 'final_status', v_a.status,
      'expected_version', p_expected_version, 'actual_version', v_a.version,
      'previous_version', v_a.version, 'final_version', v_a.version,
      'row', to_jsonb(v_a), 'updated_at', v_a.updated_at,
      'payroll_protected', true, 'next_action', 'reload');
  END IF;

  v_before := to_jsonb(v_a);
  v_prev_status := v_a.status;
  v_prev_version := v_a.version;

  BEGIN
    IF p_transition = 'remove' THEN
      v_delegated := public.remove_worker_from_shift(
        v_a.id, p_reason, p_target_employee_id, COALESCE(p_surface,'vwc'));
      IF COALESCE((v_delegated->>'removed')::boolean, false) IS NOT TRUE THEN
        INSERT INTO public.versioned_write_audit(entity, entity_id, company_id, actor_id, expected_version,
          actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
        VALUES ('shift_assignments', v_a.id, v_a.company_id, v_uid, p_expected_version, v_a.version,
          v_delegated->>'reason', ARRAY[p_transition], p_surface, p_intent_key, 'invalid', p_reason);
        RETURN v_delegated || jsonb_build_object('status','invalid','success',false,
          'previous_status', v_prev_status, 'final_status', v_prev_status,
          'previous_version', v_prev_version, 'final_version', v_prev_version);
      END IF;
      UPDATE public.shift_assignments SET removed_by = v_uid, removed_at = now() WHERE id = v_a.id;
      v_driver_impact  := COALESCE(v_delegated->>'driver_impact','none');
      v_captain_impact := COALESCE(v_delegated->>'captain_impact','none');

    ELSIF p_transition IN ('accept','reject') THEN
      v_delegated := public.worker_respond_to_shift_assignment(
        v_a.id, CASE WHEN p_transition = 'accept' THEN 'accepted' ELSE 'rejected' END,
        p_reason, COALESCE(p_surface,'worker_portal'));

    ELSIF p_transition = 'confirm' THEN
      PERFORM public.set_shift_assignment_state(v_a.id, 'confirmed', NULL, p_reason, COALESCE(p_surface,'vwc'));

    ELSIF p_transition = 'set_status' THEN
      IF p_status IS NULL THEN
        RAISE EXCEPTION 'status_required' USING ERRCODE = '22023';
      END IF;
      IF p_status NOT IN ('pending','confirmed','review','rejected') THEN
        RAISE EXCEPTION 'unsupported_status:%', p_status USING ERRCODE = '22023';
      END IF;
      PERFORM public.set_shift_assignment_state(v_a.id, p_status, NULL, p_reason, COALESCE(p_surface,'vwc'));

    ELSIF p_transition IN ('set_role','set_role_driver','set_role_worker','set_captain') THEN
      IF v_a.status IN ('removed','rejected','replaced') THEN
        RAISE EXCEPTION 'assignment_inactive' USING ERRCODE = '22023';
      END IF;
      v_role := CASE p_transition
        WHEN 'set_role_driver' THEN 'driver'
        WHEN 'set_role_worker' THEN 'staff'
        WHEN 'set_captain' THEN 'shift_admin'
        ELSE COALESCE(p_role, 'staff') END;

      UPDATE public.shift_assignments SET assignment_role = v_role WHERE id = v_a.id;

      SELECT sa.employee_id INTO v_next_driver
        FROM public.shift_assignments sa
       WHERE sa.shift_id = v_a.shift_id AND sa.assignment_role = 'driver'
         AND sa.status NOT IN ('removed','rejected','replaced')
       ORDER BY sa.created_at LIMIT 1;
      UPDATE public.scheduled_shifts SET driver_employee_id = v_next_driver WHERE id = v_a.shift_id;
      v_driver_impact := CASE
        WHEN v_role = 'driver' THEN 'promoted'
        WHEN v_a.assignment_role = 'driver' AND v_next_driver IS NULL THEN 'no_driver_left'
        WHEN v_a.assignment_role = 'driver' THEN 'demoted'
        ELSE 'none' END;

      IF v_role = 'shift_admin' THEN
        UPDATE public.scheduled_shifts SET shift_admin_id = v_a.employee_id WHERE id = v_a.shift_id;
        v_captain_impact := 'assigned';
      END IF;

    ELSIF p_transition = 'replace' THEN
      IF p_target_employee_id IS NULL THEN
        RAISE EXCEPTION 'replacement_required' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_new_assignment FROM public.shift_assignments
       WHERE shift_id = v_a.shift_id AND employee_id = p_target_employee_id
         AND status NOT IN ('removed','rejected','replaced')
       ORDER BY created_at DESC LIMIT 1;
      IF NOT FOUND THEN
        v_new_assignment := public.assign_worker_to_shift(
          v_a.shift_id, p_target_employee_id, COALESCE(v_a.assignment_role,'staff'),
          COALESCE(p_reason,'replacement'), COALESCE(p_surface,'vwc'));
      END IF;
      v_delegated := public.remove_worker_from_shift(
        v_a.id, COALESCE(p_reason,'replaced'), p_target_employee_id, COALESCE(p_surface,'vwc'));
      IF COALESCE((v_delegated->>'removed')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'replace_blocked:%', COALESCE(v_delegated->>'reason','unknown') USING ERRCODE = '22023';
      END IF;
      UPDATE public.shift_assignments
         SET removed_by = v_uid, removed_at = now(), replaced_by_assignment_id = v_new_assignment.id
       WHERE id = v_a.id;
      v_driver_impact  := COALESCE(v_delegated->>'driver_impact','none');
      v_captain_impact := COALESCE(v_delegated->>'captain_impact','none');

    ELSE
      RAISE EXCEPTION 'unknown_transition:%', p_transition USING ERRCODE = '22023';
    END IF;

  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.versioned_write_audit(entity, entity_id, company_id, actor_id, expected_version,
      actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
    VALUES ('shift_assignments', v_a.id, v_a.company_id, v_uid, p_expected_version, v_a.version,
      v_err, ARRAY[p_transition], p_surface, p_intent_key, 'invalid', p_reason);
    RETURN jsonb_build_object('status','invalid','success',false,'reason', v_err,
      'previous_status', v_prev_status, 'final_status', v_prev_status,
      'previous_version', v_prev_version, 'final_version', v_prev_version,
      'payroll_protected', true, 'next_action', 'reload');
  END;

  SELECT * INTO v_after FROM public.shift_assignments WHERE id = v_a.id;

  SELECT COALESCE(s.slots, 0) INTO v_required FROM public.scheduled_shifts s WHERE s.id = v_a.shift_id;
  SELECT
    count(*) FILTER (WHERE sa.status NOT IN ('removed','rejected','replaced')),
    count(*) FILTER (WHERE sa.status NOT IN ('removed','rejected','replaced')
      AND (sa.status = 'confirmed' OR sa.response_status = 'accepted')
      AND COALESCE(sa.response_status,'') <> 'needs_reacceptance')
    INTO v_assigned, v_confirmed
  FROM public.shift_assignments sa WHERE sa.shift_id = v_a.shift_id;

  v_result := jsonb_build_object(
    'status','applied','success',true,'conflict',false,
    'reason', COALESCE(p_reason, p_transition),
    'transition', p_transition,
    'assignment_id', v_after.id,
    'previous_status', v_prev_status,
    'final_status', v_after.status,
    'previous_version', v_prev_version,
    'final_version', v_after.version,
    'row', to_jsonb(v_after),
    'replacement_assignment_id', v_new_assignment.id,
    'coverage_after', jsonb_build_object(
      'required', v_required, 'assigned_active', v_assigned, 'confirmed', v_confirmed),
    'driver_impact', v_driver_impact,
    'captain_impact', v_captain_impact,
    'payroll_protected', true,
    'next_action', CASE
      WHEN v_driver_impact = 'no_driver_left' THEN 'assign_driver'
      WHEN v_assigned < v_required THEN 'fill_open_spot'
      ELSE 'none' END
  );

  INSERT INTO public.versioned_write_audit(entity, entity_id, company_id, actor_id, expected_version,
    actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason,
    before_values, after_values)
  VALUES ('shift_assignments', v_after.id, v_after.company_id, v_uid, p_expected_version, v_after.version,
    NULL, ARRAY[p_transition], p_surface, p_intent_key, 'applied', p_reason, v_before, v_result);

  RETURN v_result;
END;
$function$;

DROP FUNCTION IF EXISTS public.versioned_assignment_transition(uuid,uuid,text,text,integer,text,uuid,text,text,text);

REVOKE ALL ON FUNCTION public.versioned_assignment_transition(uuid,uuid,text,text,integer,text,uuid,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.versioned_assignment_transition(uuid,uuid,text,text,integer,text,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.versioned_assignment_transition(uuid,uuid,text,text,integer,text,uuid,text,text,text,text) TO service_role;