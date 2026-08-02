-- =============================================================
-- P0 VWC Fase 2 — Horas reales, compensación y saldos monetarios
-- =============================================================

-- 1) Columnas de versión ---------------------------------------------------
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.compensation_profiles
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.employee_financial_records
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2) Bump atómico de versión en servidor -----------------------------------
CREATE OR REPLACE FUNCTION public.vwc_bump_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_bump_time_entry_version ON public.time_entries;
CREATE TRIGGER trg_zz_bump_time_entry_version
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.vwc_bump_version();

DROP TRIGGER IF EXISTS trg_zz_bump_compensation_version ON public.compensation_profiles;
CREATE TRIGGER trg_zz_bump_compensation_version
  BEFORE UPDATE ON public.compensation_profiles
  FOR EACH ROW EXECUTE FUNCTION public.vwc_bump_version();

DROP TRIGGER IF EXISTS trg_zz_bump_financial_record_version ON public.employee_financial_records;
CREATE TRIGGER trg_zz_bump_financial_record_version
  BEFORE UPDATE ON public.employee_financial_records
  FOR EACH ROW EXECUTE FUNCTION public.vwc_bump_version();

-- 3) Auditoría: valores antes/después y campos monetarios -------------------
ALTER TABLE public.versioned_write_audit
  ADD COLUMN IF NOT EXISTS before_values jsonb,
  ADD COLUMN IF NOT EXISTS after_values jsonb,
  ADD COLUMN IF NOT EXISTS before_balance numeric,
  ADD COLUMN IF NOT EXISTS delta numeric,
  ADD COLUMN IF NOT EXISTS after_balance numeric,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS reason text;

-- 4) Idempotencia por intención --------------------------------------------
CREATE TABLE IF NOT EXISTS public.versioned_write_intents (
  intent_key text PRIMARY KEY,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  company_id uuid NOT NULL,
  actor_id uuid,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.versioned_write_intents TO authenticated;
GRANT ALL ON public.versioned_write_intents TO service_role;
ALTER TABLE public.versioned_write_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vwc_intents_read_company" ON public.versioned_write_intents;
CREATE POLICY "vwc_intents_read_company"
  ON public.versioned_write_intents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = versioned_write_intents.company_id
      AND cu.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_vwc_intents_entity
  ON public.versioned_write_intents (entity, entity_id);

-- 5) RPC — Horas reales (PATCH parcial + expected_version) ------------------
CREATE OR REPLACE FUNCTION public.versioned_update_time_entry(
  p_entry_id uuid,
  p_company_id uuid,
  p_patch jsonb,
  p_expected_version integer,
  p_surface text DEFAULT NULL,
  p_intent_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY['clock_in','clock_out','break_minutes','notes'];
  v_keys text[];
  v_bad text[];
  v_current public.time_entries;
  v_next public.time_entries;
  v_row public.time_entries;
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
  FROM public.time_entries
  WHERE id = p_entry_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El fichaje no existe o pertenece a otra empresa.');
  END IF;

  IF v_current.status = 'approved' THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('time_entries', p_entry_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'blocked', v_keys, p_surface, p_intent_key, 'denied');
    RETURN jsonb_build_object('status','invalid','message','Estas horas ya fueron aprobadas. Reábrelas desde el Centro de Validación antes de corregirlas.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('time_entries', p_entry_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'stale_version', v_keys, p_surface, p_intent_key, 'conflict');
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

  IF v_next.clock_in IS NULL THEN
    RETURN jsonb_build_object('status','invalid','message','La hora de entrada no puede quedar vacía.');
  END IF;
  IF v_next.clock_out IS NOT NULL AND v_next.clock_out <= v_next.clock_in THEN
    RETURN jsonb_build_object('status','invalid','message','La salida debe ser posterior a la entrada.');
  END IF;
  IF COALESCE(v_next.break_minutes, 0) < 0 THEN
    RETURN jsonb_build_object('status','invalid','message','El descanso no puede ser negativo.');
  END IF;

  UPDATE public.time_entries t SET
    clock_in = v_next.clock_in,
    clock_out = v_next.clock_out,
    break_minutes = v_next.break_minutes,
    notes = v_next.notes
  WHERE t.id = p_entry_id
    AND t.company_id = p_company_id
    AND (p_expected_version IS NULL OR t.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('time_entries', p_entry_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'blocked', v_keys, p_surface, p_intent_key, 'denied');
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar estas horas.');
  END IF;

  SELECT jsonb_object_agg(k, to_jsonb(v_current) -> k) INTO v_before FROM unnest(v_keys) AS k;
  SELECT jsonb_object_agg(k, to_jsonb(v_row) -> k) INTO v_after FROM unnest(v_keys) AS k;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result, before_values, after_values)
  VALUES ('time_entries', p_entry_id, p_company_id, auth.uid(), p_expected_version, v_row.version, NULL, v_keys, p_surface, p_intent_key, 'applied', v_before, v_after);

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

-- 6) RPC — Compensación ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.versioned_update_compensation_profile(
  p_profile_id uuid,
  p_company_id uuid,
  p_patch jsonb,
  p_expected_version integer,
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
    'effective_from','effective_to','hourly_rate_override_manual'
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
    hourly_rate_override_manual = v_next.hourly_rate_override_manual
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

-- 7) RPC — Delta atómico de saldo de adelantos -------------------------------
CREATE OR REPLACE FUNCTION public.apply_advance_balance_delta(
  p_record_id uuid,
  p_company_id uuid,
  p_delta numeric,
  p_transaction_type text,
  p_expected_version integer DEFAULT NULL,
  p_intent_key text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_surface text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current public.employee_financial_records;
  v_row public.employee_financial_records;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_status public.financial_record_status;
  v_existing jsonb;
  v_response jsonb;
BEGIN
  IF p_transaction_type IS NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Falta el tipo de movimiento.');
  END IF;

  IF p_intent_key IS NOT NULL THEN
    SELECT response INTO v_existing FROM public.versioned_write_intents WHERE intent_key = p_intent_key;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing || jsonb_build_object('idempotent', true);
    END IF;
  END IF;

  SELECT * INTO v_current
  FROM public.employee_financial_records
  WHERE id = p_record_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El registro no existe o pertenece a otra empresa.');
  END IF;

  IF v_current.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','message','El registro está eliminado.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
    VALUES ('employee_financial_records', p_record_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'stale_version', ARRAY['balance_remaining'], p_surface, p_intent_key, 'conflict', p_reason);
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_current.version,
      'updated_by', v_current.updated_by,
      'updated_at', v_current.updated_at,
      'row', to_jsonb(v_current)
    );
  END IF;

  v_before := COALESCE(v_current.balance_remaining, 0);

  IF p_transaction_type IN ('writeoff','manual_close') THEN
    v_delta := -v_before;
  ELSE
    v_delta := round(COALESCE(p_delta, 0)::numeric, 2);
  END IF;

  IF v_delta = 0 AND p_transaction_type NOT IN ('writeoff','manual_close') THEN
    RETURN jsonb_build_object('status','invalid','message','El movimiento debe ser distinto de cero.');
  END IF;

  v_after := round(v_before + v_delta, 2);
  IF v_after < 0 THEN
    RETURN jsonb_build_object('status','invalid','message','El monto excede el saldo pendiente.');
  END IF;

  v_status := CASE p_transaction_type
    WHEN 'writeoff' THEN 'written_off'::public.financial_record_status
    WHEN 'manual_close' THEN 'closed_manually'::public.financial_record_status
    WHEN 'cancellation' THEN 'cancelled'::public.financial_record_status
    ELSE CASE WHEN v_after = 0 THEN 'paid'::public.financial_record_status ELSE v_current.status END
  END;

  UPDATE public.employee_financial_records r SET
    balance_remaining = round(COALESCE(r.balance_remaining, 0) + v_delta, 2),
    status = v_status
  WHERE r.id = p_record_id
    AND r.company_id = p_company_id
    AND (p_expected_version IS NULL OR r.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result, reason)
    VALUES ('employee_financial_records', p_record_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'blocked', ARRAY['balance_remaining'], p_surface, p_intent_key, 'denied', p_reason);
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para mover este saldo.');
  END IF;

  INSERT INTO public.employee_financial_ledger
    (record_id, company_id, employee_id, transaction_type, amount, balance_before, balance_after, note, created_by)
  VALUES
    (v_row.id, v_row.company_id, v_row.employee_id, p_transaction_type::public.financial_transaction_type,
     abs(v_delta), v_before, v_row.balance_remaining, p_reason, auth.uid());

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result,
     before_balance, delta, after_balance, currency, reason)
  VALUES ('employee_financial_records', p_record_id, p_company_id, auth.uid(), p_expected_version, v_row.version, NULL, ARRAY['balance_remaining','status'], p_surface, p_intent_key, 'applied',
     v_before, v_delta, v_row.balance_remaining, COALESCE(v_row.currency,'USD'), p_reason);

  v_response := jsonb_build_object(
    'status','applied',
    'version', v_row.version,
    'before_balance', v_before,
    'delta', v_delta,
    'after_balance', v_row.balance_remaining,
    'currency', COALESCE(v_row.currency,'USD'),
    'row', to_jsonb(v_row)
  );

  IF p_intent_key IS NOT NULL THEN
    INSERT INTO public.versioned_write_intents (intent_key, entity, entity_id, company_id, actor_id, response)
    VALUES (p_intent_key, 'employee_financial_records', p_record_id, p_company_id, auth.uid(), v_response)
    ON CONFLICT (intent_key) DO NOTHING;
  END IF;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.versioned_update_time_entry(uuid, uuid, jsonb, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.versioned_update_compensation_profile(uuid, uuid, jsonb, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_advance_balance_delta(uuid, uuid, numeric, text, integer, text, text, text) TO authenticated;