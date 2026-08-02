CREATE OR REPLACE FUNCTION public.versioned_update_compensation_profile(
  p_profile_id uuid,
  p_company_id uuid,
  p_patch jsonb,
  p_expected_version integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_surface text DEFAULT NULL,
  p_intent_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'default_hourly_rate','default_daily_rate','default_half_day_rate',
    'default_ride_rate_regular','default_ride_rate_special',
    'overtime_hourly_rate','kitchen_hourly_rate','bonus_transport_hourly_rate',
    'double_pay_hourly_rate','payment_mode','rate_source','notes',
    'effective_from','effective_to','hourly_rate_override_manual',
    'is_active',
    'inferred_hourly_rate','inferred_hourly_source','inferred_hourly_confidence',
    'hourly_rate_last_verified_at','previous_inferred_rate',
    'confirmed_by','confirmed_at'
  ];
  v_keys text[];
  v_bad text[];
  v_current public.compensation_profiles;
  v_next public.compensation_profiles;
  v_row public.compensation_profiles;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid','message','Patch vacío o inválido.');
  END IF;

  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(p_patch) AS k;
  SELECT array_agg(k) INTO v_bad FROM unnest(v_keys) AS k WHERE NOT (k = ANY(v_allowed));
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Campos no editables aquí: ' || array_to_string(v_bad, ', '));
  END IF;

  SELECT * INTO v_current
  FROM public.compensation_profiles
  WHERE id = p_profile_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','La compensación no existe o pertenece a otra empresa.');
  END IF;

  IF v_current.is_active IS NOT TRUE AND COALESCE(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('status','invalid','message','Esta compensación es histórica. Indica un motivo para modificarla.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
    VALUES ('compensation_profiles', p_profile_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'stale_version', v_keys, p_surface, p_intent_key, 'conflict', p_reason);
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_current.version,
      'updated_by', v_current.updated_by,
      'updated_at', v_current.updated_at,
      'row', to_jsonb(v_current)
    );
  END IF;

  v_next := jsonb_populate_record(v_current, p_patch);

  UPDATE public.compensation_profiles c SET
    default_hourly_rate = v_next.default_hourly_rate,
    default_daily_rate = v_next.default_daily_rate,
    default_half_day_rate = v_next.default_half_day_rate,
    default_ride_rate_regular = v_next.default_ride_rate_regular,
    default_ride_rate_special = v_next.default_ride_rate_special,
    overtime_hourly_rate = v_next.overtime_hourly_rate,
    kitchen_hourly_rate = v_next.kitchen_hourly_rate,
    bonus_transport_hourly_rate = v_next.bonus_transport_hourly_rate,
    double_pay_hourly_rate = v_next.double_pay_hourly_rate,
    payment_mode = v_next.payment_mode,
    rate_source = v_next.rate_source,
    notes = v_next.notes,
    effective_from = v_next.effective_from,
    effective_to = v_next.effective_to,
    hourly_rate_override_manual = v_next.hourly_rate_override_manual,
    is_active = v_next.is_active,
    inferred_hourly_rate = v_next.inferred_hourly_rate,
    inferred_hourly_source = v_next.inferred_hourly_source,
    inferred_hourly_confidence = v_next.inferred_hourly_confidence,
    hourly_rate_last_verified_at = v_next.hourly_rate_last_verified_at,
    previous_inferred_rate = v_next.previous_inferred_rate,
    confirmed_by = v_next.confirmed_by,
    confirmed_at = v_next.confirmed_at
  WHERE c.id = p_profile_id
    AND c.company_id = p_company_id
    AND (p_expected_version IS NULL OR c.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
    VALUES ('compensation_profiles', p_profile_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'blocked', v_keys, p_surface, p_intent_key, 'denied', p_reason);
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar esta compensación.');
  END IF;

  SELECT jsonb_object_agg(k, to_jsonb(v_current) -> k) INTO v_before FROM unnest(v_keys) AS k;
  SELECT jsonb_object_agg(k, to_jsonb(v_row) -> k) INTO v_after FROM unnest(v_keys) AS k;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result, before_values, after_values, reason)
  VALUES ('compensation_profiles', p_profile_id, p_company_id, auth.uid(), p_expected_version, v_row.version, NULL, v_keys, p_surface, p_intent_key, 'applied', v_before, v_after, p_reason);

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;