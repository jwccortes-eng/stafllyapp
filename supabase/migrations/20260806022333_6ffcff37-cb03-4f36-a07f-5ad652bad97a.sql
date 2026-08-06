CREATE OR REPLACE FUNCTION public.company_lifecycle_transition(p_company_id uuid, p_transition text, p_expected_approval_state text DEFAULT NULL::text, p_expected_access_state text DEFAULT NULL::text, p_expected_version integer DEFAULT NULL::integer, p_target_access_state text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.companies%ROWTYPE;
  v_prev public.company_lifecycle_events%ROWTYPE;
  v_new_approval text;
  v_new_access text;
  v_next_action text;
  v_is_owner boolean;
  v_from_approval text;
  v_from_access text;
  v_from_commercial text;
  v_from_version integer;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','denied','message','Sesión requerida');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.company_lifecycle_events
     WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key
     LIMIT 1;
    IF FOUND THEN
      SELECT * INTO v_row FROM public.companies WHERE id = p_company_id;
      RETURN jsonb_build_object(
        'status','noop','replayed',true,
        'approval_state', v_row.approval_state,
        'access_state', v_row.access_state,
        'commercial_state', v_row.commercial_state,
        'version', v_row.version,
        'next_action', v_prev.next_action
      );
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','error','reason','not_found','message','Empresa no encontrada');
  END IF;

  v_is_owner := public.is_global_owner(v_actor);

  IF p_transition = 'submit_for_review' THEN
    IF NOT (v_is_owner OR public.has_company_role(v_actor, p_company_id, 'admin')) THEN
      RETURN jsonb_build_object('status','error','reason','denied','message','Sin permiso para enviar a revisión');
    END IF;
  ELSIF NOT v_is_owner THEN
    RETURN jsonb_build_object('status','error','reason','denied','message','Sólo un propietario global puede ejecutar esta transición');
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version IS DISTINCT FROM v_row.version THEN
    RETURN jsonb_build_object('status','conflict','expected_version',p_expected_version,
      'actual_version',v_row.version,'approval_state',v_row.approval_state,'access_state',v_row.access_state);
  END IF;
  IF p_expected_approval_state IS NOT NULL AND p_expected_approval_state IS DISTINCT FROM v_row.approval_state THEN
    RETURN jsonb_build_object('status','conflict','expected_approval_state',p_expected_approval_state,
      'actual_approval_state',v_row.approval_state,'actual_version',v_row.version);
  END IF;
  IF p_expected_access_state IS NOT NULL AND p_expected_access_state IS DISTINCT FROM v_row.access_state THEN
    RETURN jsonb_build_object('status','conflict','expected_access_state',p_expected_access_state,
      'actual_access_state',v_row.access_state,'actual_version',v_row.version);
  END IF;

  v_from_approval := v_row.approval_state;
  v_from_access := v_row.access_state;
  v_from_commercial := v_row.commercial_state;
  v_from_version := v_row.version;

  v_new_approval := v_row.approval_state;
  v_new_access := v_row.access_state;

  IF p_transition = 'submit_for_review' THEN
    IF v_row.approval_state NOT IN ('draft','rejected','needs_review') THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','La empresa ya fue aprobada');
    END IF;
    v_new_approval := 'needs_review';
    v_new_access := 'restricted';
    v_next_action := 'Revisión humana pendiente';

  ELSIF p_transition = 'approve' THEN
    IF v_row.approval_state = 'approved' THEN
      RETURN jsonb_build_object('status','noop','approval_state','approved','access_state',v_row.access_state,'version',v_row.version);
    END IF;
    v_new_approval := 'approved';
    v_new_access := 'active';
    v_next_action := 'Configurar plan y módulos';

  ELSIF p_transition = 'reject' THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','El rechazo exige motivo');
    END IF;
    v_new_approval := 'rejected';
    v_new_access := 'restricted';
    v_next_action := 'Notificar al solicitante';

  ELSIF p_transition = 'set_access_state' THEN
    IF p_target_access_state IS NULL
       OR p_target_access_state NOT IN ('active','grace','restricted','suspended','cancelled') THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Estado de acceso inválido');
    END IF;
    IF p_target_access_state = 'active' AND v_row.approval_state <> 'approved' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Sólo una empresa aprobada puede quedar activa');
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Cambiar el acceso exige motivo');
    END IF;
    IF p_target_access_state = v_row.access_state THEN
      RETURN jsonb_build_object('status','noop','approval_state',v_row.approval_state,'access_state',v_row.access_state,'version',v_row.version);
    END IF;
    v_new_access := p_target_access_state;
    v_next_action := 'Comunicar el cambio de acceso a la empresa';

  ELSIF p_transition = 'reactivate' THEN
    IF v_row.approval_state <> 'approved' THEN
      RETURN jsonb_build_object('status','error','reason','invalid','message','Sólo una empresa aprobada puede reactivarse');
    END IF;
    IF v_row.access_state = 'active' THEN
      RETURN jsonb_build_object('status','noop','approval_state',v_row.approval_state,'access_state','active','version',v_row.version);
    END IF;
    v_new_access := 'active';
    v_next_action := 'Verificar módulos y límites del plan';

  ELSE
    RETURN jsonb_build_object('status','error','reason','invalid','message','Transición desconocida');
  END IF;

  PERFORM set_config('stafly.company_lifecycle_tx','1',true);

  UPDATE public.companies
     SET approval_state = v_new_approval,
         access_state   = v_new_access,
         access_state_reason = COALESCE(p_reason, access_state_reason),
         access_state_changed_at = CASE WHEN v_new_access IS DISTINCT FROM v_from_access THEN now() ELSE access_state_changed_at END,
         approved_by = CASE WHEN v_new_approval = 'approved' THEN v_actor ELSE approved_by END,
         approved_at = CASE WHEN v_new_approval = 'approved' THEN now() ELSE approved_at END,
         submitted_at = CASE WHEN v_new_approval = 'needs_review' THEN now() ELSE submitted_at END,
         rejection_reason = CASE WHEN v_new_approval = 'rejected' THEN p_reason
                                 WHEN v_new_approval = 'approved' THEN NULL
                                 ELSE rejection_reason END,
         is_active = (v_new_access <> 'cancelled'),
         updated_at = now()
   WHERE id = p_company_id
  RETURNING * INTO v_row;

  PERFORM set_config('stafly.company_lifecycle_tx','0',true);

  INSERT INTO public.company_lifecycle_events (
    company_id, transition,
    from_approval_state, to_approval_state,
    from_access_state, to_access_state,
    from_commercial_state, to_commercial_state,
    actor_id, reason, idempotency_key,
    company_version_before, company_version_after, next_action
  ) VALUES (
    p_company_id, p_transition,
    v_from_approval, v_row.approval_state,
    v_from_access, v_row.access_state,
    v_from_commercial, v_row.commercial_state,
    v_actor, p_reason, p_idempotency_key,
    v_from_version, v_row.version, v_next_action
  );

  RETURN jsonb_build_object(
    'status','applied',
    'approval_state', v_row.approval_state,
    'access_state', v_row.access_state,
    'commercial_state', v_row.commercial_state,
    'is_active', v_row.is_active,
    'version', v_row.version,
    'next_action', v_next_action
  );
END;
$function$;