-- ============================================================
-- P0 — VWC FASE 3, BLOQUE B: DOCUMENTOS Y COMPLIANCE (H03)
-- Tablas: employee_documents, employee_onboarding_documents.
-- No toca payroll, time_entries, storage policies, RLS existentes,
-- assignment policy ni get_employee_assignment_status.
-- ============================================================

-- 1. Versionado
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.employee_onboarding_documents
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_zz_bump_employee_documents_version ON public.employee_documents;
CREATE TRIGGER trg_zz_bump_employee_documents_version
BEFORE UPDATE ON public.employee_documents
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

DROP TRIGGER IF EXISTS trg_zz_bump_onboarding_documents_version ON public.employee_onboarding_documents;
CREATE TRIGGER trg_zz_bump_onboarding_documents_version
BEFORE UPDATE ON public.employee_onboarding_documents
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 2. Carril 3 — transición de revisión (única vía para cambiar estado)
CREATE OR REPLACE FUNCTION public.review_employee_document(
  p_document_id uuid,
  p_source text,
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
  v_now timestamptz := now();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_ed public.employee_documents;
  v_eod public.employee_onboarding_documents;
  v_row_ed public.employee_documents;
  v_row_eod public.employee_onboarding_documents;
  v_current_state text;
  v_next_status text;
  v_version integer;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF p_source NOT IN ('employee_documents','employee_onboarding_documents') THEN
    RETURN jsonb_build_object('status','invalid','message','Origen de documento no soportado.');
  END IF;

  IF p_decision NOT IN ('approved','rejected','replacement_requested','expired','pending') THEN
    RETURN jsonb_build_object('status','invalid','message','Decisión no soportada.');
  END IF;

  IF p_decision IN ('rejected','replacement_requested') AND v_reason IS NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Se requiere un motivo para rechazar o pedir reemplazo.');
  END IF;

  IF NOT public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
     AND NOT public.has_company_role(v_actor, p_company_id, 'owner'::app_role)
     AND NOT public.has_company_role(v_actor, p_company_id, 'manager'::app_role) THEN
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para revisar documentos de esta empresa.');
  END IF;

  IF p_source = 'employee_documents' THEN
    SELECT * INTO v_ed FROM public.employee_documents
    WHERE id = p_document_id AND company_id = p_company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status','not_found','message','El documento no existe en esta empresa.');
    END IF;

    IF p_expected_version IS NOT NULL AND v_ed.version IS DISTINCT FROM p_expected_version THEN
      INSERT INTO public.versioned_write_audit
        (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
      VALUES ('employee_documents', p_document_id, p_company_id, v_actor, p_expected_version, v_ed.version, 'stale_version', ARRAY['review_status'], p_surface, NULL, 'conflict');
      RETURN jsonb_build_object(
        'status','conflict',
        'expected_version', p_expected_version,
        'actual_version', v_ed.version,
        'updated_by', v_ed.reviewed_by,
        'updated_at', v_ed.updated_at,
        'row', to_jsonb(v_ed)
      );
    END IF;

    v_current_state := CASE
      WHEN v_ed.rejection_reason LIKE '[Replacement requested]%' THEN 'replacement_requested'
      ELSE v_ed.review_status
    END;
    IF v_current_state = p_decision THEN
      RETURN jsonb_build_object('status','noop','version', v_ed.version, 'row', to_jsonb(v_ed));
    END IF;

    v_next_status := CASE p_decision
      WHEN 'approved' THEN 'approved'
      WHEN 'pending' THEN 'pending'
      WHEN 'expired' THEN 'expired'
      ELSE 'rejected'
    END;

    UPDATE public.employee_documents d SET
      review_status = v_next_status,
      reviewed_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE v_now END,
      reviewed_by = CASE WHEN p_decision = 'pending' THEN NULL ELSE v_actor END,
      rejection_reason = CASE
        WHEN p_decision = 'replacement_requested' THEN '[Replacement requested] ' || v_reason
        WHEN p_decision = 'rejected' THEN v_reason
        ELSE NULL
      END,
      updated_by = v_actor,
      updated_at = v_now
    WHERE d.id = p_document_id
      AND d.company_id = p_company_id
      AND (p_expected_version IS NULL OR d.version = p_expected_version)
    RETURNING * INTO v_row_ed;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status','denied','message','No se pudo aplicar la revisión sobre este documento.');
    END IF;
    v_version := v_row_ed.version;

    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('employee_documents', p_document_id, p_company_id, v_actor, p_expected_version, v_version, NULL, ARRAY['review_status','reviewed_at','reviewed_by','rejection_reason'], p_surface, NULL, 'applied');

    RETURN jsonb_build_object('status','applied','version', v_version, 'row', to_jsonb(v_row_ed));
  END IF;

  -- employee_onboarding_documents
  SELECT * INTO v_eod FROM public.employee_onboarding_documents
  WHERE id = p_document_id AND company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El documento no existe en esta empresa.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_eod.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('employee_onboarding_documents', p_document_id, p_company_id, v_actor, p_expected_version, v_eod.version, 'stale_version', ARRAY['status'], p_surface, NULL, 'conflict');
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_eod.version,
      'updated_by', v_eod.verified_by,
      'updated_at', v_eod.updated_at,
      'row', to_jsonb(v_eod)
    );
  END IF;

  v_current_state := CASE
    WHEN v_eod.notes LIKE '[Replacement requested]%' THEN 'replacement_requested'
    WHEN v_eod.status = 'verified' THEN 'approved'
    ELSE v_eod.status
  END;
  IF v_current_state = p_decision THEN
    RETURN jsonb_build_object('status','noop','version', v_eod.version, 'row', to_jsonb(v_eod));
  END IF;

  v_next_status := CASE p_decision
    WHEN 'approved' THEN 'verified'
    WHEN 'pending' THEN 'pending'
    WHEN 'expired' THEN 'expired'
    ELSE 'rejected'
  END;

  UPDATE public.employee_onboarding_documents d SET
    status = v_next_status,
    verified_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE v_now END,
    verified_by = CASE WHEN p_decision = 'pending' THEN NULL ELSE v_actor END,
    notes = CASE
      WHEN p_decision = 'replacement_requested' THEN '[Replacement requested] ' || v_reason
      WHEN p_decision = 'rejected' THEN v_reason
      ELSE NULL
    END,
    updated_by = v_actor,
    updated_at = v_now
  WHERE d.id = p_document_id
    AND d.company_id = p_company_id
    AND (p_expected_version IS NULL OR d.version = p_expected_version)
  RETURNING * INTO v_row_eod;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','denied','message','No se pudo aplicar la revisión sobre este documento.');
  END IF;
  v_version := v_row_eod.version;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
  VALUES ('employee_onboarding_documents', p_document_id, p_company_id, v_actor, p_expected_version, v_version, NULL, ARRAY['status','verified_at','verified_by','notes'], p_surface, NULL, 'applied');

  RETURN jsonb_build_object('status','applied','version', v_version, 'row', to_jsonb(v_row_eod));
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_employee_document(uuid, text, uuid, text, integer, text, text) TO authenticated;

-- 3. Carril 2 — PATCH versionado de metadata descriptiva
CREATE OR REPLACE FUNCTION public.versioned_update_employee_document(
  p_document_id uuid,
  p_company_id uuid,
  p_patch jsonb,
  p_expected_version integer,
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
  v_allowed text[] := ARRAY['name','category','expires_at'];
  v_keys text[];
  v_bad text[];
  v_current public.employee_documents;
  v_next public.employee_documents;
  v_row public.employee_documents;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid','message','Patch vacío o inválido.');
  END IF;

  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(p_patch) AS k;
  SELECT array_agg(k) INTO v_bad FROM unnest(v_keys) AS k WHERE NOT (k = ANY(v_allowed));
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Campos protegidos: ' || array_to_string(v_bad, ', '));
  END IF;

  IF NOT public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
     AND NOT public.has_company_role(v_actor, p_company_id, 'owner'::app_role)
     AND NOT public.has_company_role(v_actor, p_company_id, 'manager'::app_role) THEN
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar documentos de esta empresa.');
  END IF;

  SELECT * INTO v_current FROM public.employee_documents
  WHERE id = p_document_id AND company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','El documento no existe en esta empresa.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('employee_documents', p_document_id, p_company_id, v_actor, p_expected_version, v_current.version, 'stale_version', v_keys, p_surface, p_intent_key, 'conflict');
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

  UPDATE public.employee_documents d SET
    name = v_next.name,
    category = v_next.category,
    expires_at = v_next.expires_at,
    updated_by = v_actor,
    updated_at = now()
  WHERE d.id = p_document_id
    AND d.company_id = p_company_id
    AND (p_expected_version IS NULL OR d.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','denied','message','No se pudo actualizar el documento.');
  END IF;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
  VALUES ('employee_documents', p_document_id, p_company_id, v_actor, p_expected_version, v_row.version, NULL, v_keys, p_surface, p_intent_key, 'applied');

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.versioned_update_employee_document(uuid, uuid, jsonb, integer, text, text) TO authenticated;