-- ============================================================
-- P0 — VWC FASE 3, BLOQUE A: WORKERS Y PERFILES OPERATIVOS
-- H01 merge de empleados (carril 3, idempotente)
-- H02 W-9 del trabajador (carril 1 + 2 + 3)
-- No toca payroll, time_entries, compensación, saldos, auth ni RLS existentes.
-- ============================================================

-- 1. Versionado de contractor_w9
ALTER TABLE public.contractor_w9
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DROP TRIGGER IF EXISTS trg_zz_bump_contractor_w9_version ON public.contractor_w9;
CREATE TRIGGER trg_zz_bump_contractor_w9_version
BEFORE UPDATE ON public.contractor_w9
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 2. Carril 2 — PATCH versionado de atributos del W-9 (admin)
CREATE OR REPLACE FUNCTION public.versioned_update_contractor_w9(
  p_w9_id uuid,
  p_company_id uuid,
  p_patch jsonb,
  p_expected_version integer,
  p_surface text DEFAULT NULL,
  p_intent_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'legal_name','business_name','tax_classification','llc_tax_classification',
    'exempt_payee_code','fatca_code','address_line1','address_line2','city',
    'state','zip_code','account_numbers','tax_id_type','tin_last4'
  ];
  v_keys text[];
  v_bad text[];
  v_current public.contractor_w9;
  v_next public.contractor_w9;
  v_row public.contractor_w9;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid','message','Patch vacío o inválido.');
  END IF;

  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(p_patch) AS k;
  SELECT array_agg(k) INTO v_bad FROM unnest(v_keys) AS k WHERE NOT (k = ANY(v_allowed));
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Campos no editables: ' || array_to_string(v_bad, ', '));
  END IF;

  SELECT * INTO v_current FROM public.contractor_w9
  WHERE id = p_w9_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El formulario fiscal no existe o pertenece a otra empresa.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES
      ('contractor_w9', p_w9_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'stale_version', v_keys, p_surface, p_intent_key, 'conflict');
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

  UPDATE public.contractor_w9 w SET
    legal_name = v_next.legal_name,
    business_name = v_next.business_name,
    tax_classification = v_next.tax_classification,
    llc_tax_classification = v_next.llc_tax_classification,
    exempt_payee_code = v_next.exempt_payee_code,
    fatca_code = v_next.fatca_code,
    address_line1 = v_next.address_line1,
    address_line2 = v_next.address_line2,
    city = v_next.city,
    state = v_next.state,
    zip_code = v_next.zip_code,
    account_numbers = v_next.account_numbers,
    tax_id_type = v_next.tax_id_type,
    tin_last4 = v_next.tin_last4
  WHERE w.id = p_w9_id
    AND w.company_id = p_company_id
    AND (p_expected_version IS NULL OR w.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES
      ('contractor_w9', p_w9_id, p_company_id, auth.uid(), p_expected_version, v_current.version, 'blocked', v_keys, p_surface, p_intent_key, 'denied');
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar este formulario fiscal.');
  END IF;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
  VALUES
    ('contractor_w9', p_w9_id, p_company_id, auth.uid(), p_expected_version, v_row.version, NULL, v_keys, p_surface, p_intent_key, 'applied');

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.versioned_update_contractor_w9(uuid, uuid, jsonb, integer, text, text) TO authenticated;

-- 3. Carril 1 + 3 — envío del W-9 desde el portal del trabajador
CREATE OR REPLACE FUNCTION public.submit_contractor_w9(
  p_company_id uuid,
  p_employee_id uuid,
  p_payload jsonb,
  p_expected_version integer DEFAULT NULL,
  p_surface text DEFAULT NULL,
  p_intent_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_emp public.employees%ROWTYPE;
  v_current public.contractor_w9;
  v_row public.contractor_w9;
  v_existing jsonb;
  v_now timestamptz := now();
  v_keys text[];
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida. Vuelve a iniciar sesión.');
  END IF;

  IF p_intent_key IS NOT NULL THEN
    SELECT response INTO v_existing FROM public.versioned_write_intents WHERE intent_key = p_intent_key;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_emp FROM public.employees
  WHERE id = p_employee_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El trabajador no existe en esta empresa.');
  END IF;

  IF v_emp.user_id IS DISTINCT FROM v_actor
     AND NOT public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
     AND NOT public.has_company_role(v_actor, p_company_id, 'owner'::app_role) THEN
    RETURN jsonb_build_object('status','denied','message','Sólo el trabajador o un administrador pueden enviar este formulario.');
  END IF;

  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(COALESCE(p_payload,'{}'::jsonb)) AS k;

  SELECT * INTO v_current FROM public.contractor_w9
  WHERE employee_id = p_employee_id AND company_id = p_company_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_current.status = 'approved' THEN
      RETURN jsonb_build_object('status','invalid','message','El W-9 ya está aprobado. Pide a la empresa que lo reabra antes de reenviarlo.');
    END IF;

    IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
      INSERT INTO public.versioned_write_audit
        (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
      VALUES
        ('contractor_w9', v_current.id, p_company_id, v_actor, p_expected_version, v_current.version, 'stale_version', COALESCE(v_keys,'{}'), p_surface, p_intent_key, 'conflict');
      RETURN jsonb_build_object(
        'status','conflict',
        'expected_version', p_expected_version,
        'actual_version', v_current.version,
        'updated_by', v_current.updated_by,
        'updated_at', v_current.updated_at,
        'row', to_jsonb(v_current)
      );
    END IF;

    UPDATE public.contractor_w9 w SET
      legal_name = COALESCE(p_payload->>'legal_name', w.legal_name),
      business_name = NULLIF(p_payload->>'business_name',''),
      tax_classification = COALESCE(p_payload->>'tax_classification', w.tax_classification),
      llc_tax_classification = NULLIF(p_payload->>'llc_tax_classification',''),
      exempt_payee_code = NULLIF(p_payload->>'exempt_payee_code',''),
      fatca_code = NULLIF(p_payload->>'fatca_code',''),
      address_line1 = COALESCE(p_payload->>'address_line1', w.address_line1),
      address_line2 = NULLIF(p_payload->>'address_line2',''),
      city = COALESCE(p_payload->>'city', w.city),
      state = COALESCE(p_payload->>'state', w.state),
      zip_code = COALESCE(p_payload->>'zip_code', w.zip_code),
      account_numbers = NULLIF(p_payload->>'account_numbers',''),
      tax_id_type = COALESCE(p_payload->>'tax_id_type', w.tax_id_type),
      tin_last4 = COALESCE(p_payload->>'tin_last4', w.tin_last4),
      signature_name = COALESCE(p_payload->>'signature_name', w.signature_name),
      certification_accepted = true,
      w9_file_url = COALESCE(p_payload->>'w9_file_url', w.w9_file_url),
      signed_at = v_now,
      signed_by = v_actor,
      submitted_at = v_now,
      status = 'submitted',
      reviewed_at = NULL,
      reviewed_by = NULL
    WHERE w.id = v_current.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.contractor_w9 (
      company_id, employee_id, legal_name, business_name, tax_classification,
      llc_tax_classification, exempt_payee_code, fatca_code, address_line1,
      address_line2, city, state, zip_code, account_numbers, tax_id_type,
      tin_last4, signature_name, certification_accepted, w9_file_url,
      signed_at, signed_by, submitted_at, status
    ) VALUES (
      p_company_id, p_employee_id,
      p_payload->>'legal_name', NULLIF(p_payload->>'business_name',''),
      p_payload->>'tax_classification', NULLIF(p_payload->>'llc_tax_classification',''),
      NULLIF(p_payload->>'exempt_payee_code',''), NULLIF(p_payload->>'fatca_code',''),
      p_payload->>'address_line1', NULLIF(p_payload->>'address_line2',''),
      p_payload->>'city', p_payload->>'state', p_payload->>'zip_code',
      NULLIF(p_payload->>'account_numbers',''), p_payload->>'tax_id_type',
      p_payload->>'tin_last4', p_payload->>'signature_name', true,
      p_payload->>'w9_file_url', v_now, v_actor, v_now, 'submitted'
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
  VALUES
    ('contractor_w9', v_row.id, p_company_id, v_actor, p_expected_version, v_row.version, NULL, COALESCE(v_keys,'{}'), p_surface, p_intent_key, 'applied');

  IF p_intent_key IS NOT NULL THEN
    INSERT INTO public.versioned_write_intents (intent_key, entity, entity_id, company_id, actor_id, response)
    VALUES (p_intent_key, 'contractor_w9', v_row.id, p_company_id, v_actor,
            jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row)))
    ON CONFLICT (intent_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_contractor_w9(uuid, uuid, jsonb, integer, text, text) TO authenticated;

-- 4. Carril 3 — transición de revisión del W-9 (aprobar / rechazar)
CREATE OR REPLACE FUNCTION public.review_contractor_w9(
  p_w9_id uuid,
  p_company_id uuid,
  p_decision text,
  p_expected_version integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_surface text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_current public.contractor_w9;
  v_row public.contractor_w9;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF p_decision NOT IN ('approved','rejected') THEN
    RETURN jsonb_build_object('status','invalid','message','Decisión no soportada.');
  END IF;

  IF NOT public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
     AND NOT public.has_company_role(v_actor, p_company_id, 'owner'::app_role) THEN
    RETURN jsonb_build_object('status','denied','message','Sólo un administrador puede revisar el W-9.');
  END IF;

  SELECT * INTO v_current FROM public.contractor_w9
  WHERE id = p_w9_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El formulario fiscal no existe en esta empresa.');
  END IF;

  IF v_current.status = p_decision THEN
    RETURN jsonb_build_object('status','noop','version', v_current.version, 'row', to_jsonb(v_current));
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES
      ('contractor_w9', p_w9_id, p_company_id, v_actor, p_expected_version, v_current.version, 'stale_version', ARRAY['status'], p_surface, NULL, 'conflict');
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_current.version,
      'updated_by', v_current.updated_by,
      'updated_at', v_current.updated_at,
      'row', to_jsonb(v_current)
    );
  END IF;

  IF v_current.status IS DISTINCT FROM 'submitted'
     AND v_current.status IS DISTINCT FROM 'pending'
     AND v_current.status IS DISTINCT FROM 'rejected' THEN
    RETURN jsonb_build_object('status','invalid','message','Sólo se pueden revisar formularios enviados o rechazados.');
  END IF;

  UPDATE public.contractor_w9 w SET
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = v_actor
  WHERE w.id = p_w9_id AND w.company_id = p_company_id
  RETURNING * INTO v_row;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
  VALUES
    ('contractor_w9', p_w9_id, p_company_id, v_actor, p_expected_version, v_row.version, NULL, ARRAY['status'], COALESCE(p_surface, p_reason), NULL, 'applied');

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_contractor_w9(uuid, uuid, text, integer, text, text) TO authenticated;

-- 5. Carril 3 — consolidación de duplicados idempotente (H01)
CREATE OR REPLACE FUNCTION public.merge_employees_idempotent(
  _master_id uuid,
  _duplicate_ids uuid[],
  _confirm_master_name text,
  _reason text DEFAULT NULL,
  _intent_key text DEFAULT NULL,
  _surface text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_existing jsonb;
  v_company uuid;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_MERGE_DENIED: authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _intent_key IS NOT NULL THEN
    SELECT response INTO v_existing FROM public.versioned_write_intents WHERE intent_key = _intent_key;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.employees WHERE id = _master_id;

  v_result := public.merge_employees(_master_id, _duplicate_ids, _confirm_master_name, _reason);

  IF v_company IS NOT NULL THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES
      ('employees', _master_id, v_company, v_actor, NULL, NULL, NULL, ARRAY['merge'], _surface, _intent_key, 'applied');

    IF _intent_key IS NOT NULL THEN
      INSERT INTO public.versioned_write_intents (intent_key, entity, entity_id, company_id, actor_id, response)
      VALUES (_intent_key, 'employees', _master_id, v_company, v_actor, v_result)
      ON CONFLICT (intent_key) DO NOTHING;
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_employees_idempotent(uuid, uuid[], text, text, text, text) TO authenticated;