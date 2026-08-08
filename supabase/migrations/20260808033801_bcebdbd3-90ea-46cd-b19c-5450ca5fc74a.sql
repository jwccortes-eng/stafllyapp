-- ============================================================
-- SMART SERVICE INTAKE — FASE 5: TENANT LEARNING DICTIONARY
-- Aprendizaje por compañía a partir de correcciones humanas.
-- No toca payroll, time_entries, scheduled_shifts ni RLS existente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.intake_dictionary_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN (
    'venue_alias','client_alias','service_type_alias','role_alias','abbreviation','spelling_variant'
  )),
  input_value text NOT NULL,
  input_normalized text NOT NULL,
  resolved_value text NOT NULL,
  resolved_entity_id uuid,
  resolved_entity_kind text CHECK (resolved_entity_kind IN ('location','client','none')),
  learned_from_source text,
  confirmed_by uuid,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  usage_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 1,
  conflict_count integer NOT NULL DEFAULT 0,
  confidence numeric(4,3) NOT NULL DEFAULT 0.667,
  active boolean NOT NULL DEFAULT true,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.intake_dictionary_rules TO authenticated;
GRANT ALL ON public.intake_dictionary_rules TO service_role;

ALTER TABLE public.intake_dictionary_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dict_rules_select_own_company" ON public.intake_dictionary_rules;
CREATE POLICY "dict_rules_select_own_company"
ON public.intake_dictionary_rules FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_users cu
  WHERE cu.company_id = intake_dictionary_rules.company_id
    AND cu.user_id = auth.uid()
));

-- Escrituras siempre vía RPC (SECURITY DEFINER). Sin política de INSERT/UPDATE
-- directa: el carril único es el contrato versionado.

CREATE UNIQUE INDEX IF NOT EXISTS uq_dict_rule_active
  ON public.intake_dictionary_rules (company_id, rule_type, input_normalized)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_dict_rules_company
  ON public.intake_dictionary_rules (company_id, active, rule_type);

DROP TRIGGER IF EXISTS trg_zz_bump_dict_rule_version ON public.intake_dictionary_rules;
CREATE TRIGGER trg_zz_bump_dict_rule_version
BEFORE UPDATE ON public.intake_dictionary_rules
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- Telemetría operativa (sin contenido sensible).
CREATE TABLE IF NOT EXISTS public.intake_dictionary_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rule_id uuid REFERENCES public.intake_dictionary_rules(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','applied','conflict','deactivated','edited','rejected')),
  source text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.intake_dictionary_events TO authenticated;
GRANT ALL ON public.intake_dictionary_events TO service_role;

ALTER TABLE public.intake_dictionary_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dict_events_select_own_company" ON public.intake_dictionary_events;
CREATE POLICY "dict_events_select_own_company"
ON public.intake_dictionary_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_users cu
  WHERE cu.company_id = intake_dictionary_events.company_id
    AND cu.user_id = auth.uid()
));

CREATE INDEX IF NOT EXISTS idx_dict_events_company
  ON public.intake_dictionary_events (company_id, created_at DESC);

-- ------------------------------------------------------------
-- Normalización canónica (misma idea que el resolver del cliente).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_dictionary_normalize(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(COALESCE(p_value, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

-- ------------------------------------------------------------
-- Guardia: nunca aprender datos personales.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_dictionary_is_sensitive(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_value, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      OR COALESCE(p_value, '') ~ '(\+?\d[\d\s().-]{6,}\d)'
      OR COALESCE(p_value, '') ~* '\m(ssn|social security|passport|pasaporte|routing|iban|salary|salario|rate|tarifa|payroll|nomina|n[oó]mina)\M';
$$;

-- ------------------------------------------------------------
-- 1. Proponer/crear regla (SÓLO tras confirmación humana explícita).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_dictionary_upsert_rule(
  p_company_id uuid,
  p_rule_type text,
  p_input_value text,
  p_resolved_value text,
  p_resolved_entity_id uuid DEFAULT NULL,
  p_resolved_entity_kind text DEFAULT 'none',
  p_source text DEFAULT NULL,
  p_surface text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_input text := NULLIF(btrim(COALESCE(p_input_value,'')), '');
  v_resolved text := NULLIF(btrim(COALESCE(p_resolved_value,'')), '');
  v_norm text;
  v_existing public.intake_dictionary_rules;
  v_row public.intake_dictionary_rules;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF NOT (public.has_company_role(v_actor, p_company_id, 'owner')
       OR public.has_company_role(v_actor, p_company_id, 'admin')
       OR public.has_company_role(v_actor, p_company_id, 'manager')) THEN
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar el diccionario de esta empresa.');
  END IF;

  IF v_input IS NULL OR v_resolved IS NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Faltan el término o su interpretación.');
  END IF;

  IF p_rule_type NOT IN ('venue_alias','client_alias','service_type_alias','role_alias','abbreviation','spelling_variant') THEN
    RETURN jsonb_build_object('status','invalid','message','Tipo de regla no soportado.');
  END IF;

  IF public.intake_dictionary_is_sensitive(v_input) OR public.intake_dictionary_is_sensitive(v_resolved) THEN
    RETURN jsonb_build_object('status','invalid','message','El diccionario no guarda datos personales ni información de pago.');
  END IF;

  v_norm := public.intake_dictionary_normalize(v_input);
  IF v_norm = '' THEN
    RETURN jsonb_build_object('status','invalid','message','El término no es utilizable.');
  END IF;

  SELECT * INTO v_existing
  FROM public.intake_dictionary_rules
  WHERE company_id = p_company_id
    AND rule_type = p_rule_type
    AND input_normalized = v_norm
    AND active
  FOR UPDATE;

  IF FOUND THEN
    IF lower(btrim(v_existing.resolved_value)) IS DISTINCT FROM lower(v_resolved)
       OR v_existing.resolved_entity_id IS DISTINCT FROM p_resolved_entity_id THEN
      INSERT INTO public.intake_dictionary_events (company_id, rule_id, event_type, source, actor_id, metadata)
      VALUES (p_company_id, v_existing.id, 'conflict', p_source, v_actor,
              jsonb_build_object('rule_type', p_rule_type, 'surface', p_surface));
      RETURN jsonb_build_object(
        'status','conflict',
        'message','Ya existe otra interpretación para este término en esta empresa.',
        'row', to_jsonb(v_existing)
      );
    END IF;

    UPDATE public.intake_dictionary_rules r SET
      success_count = r.success_count + 1,
      confidence = LEAST(0.99, (r.success_count + 2.0) / (r.success_count + r.conflict_count + 3.0)),
      confirmed_by = v_actor,
      confirmed_at = now(),
      updated_by = v_actor
    WHERE r.id = v_existing.id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('status','reinforced','row', to_jsonb(v_row));
  END IF;

  INSERT INTO public.intake_dictionary_rules (
    company_id, rule_type, input_value, input_normalized, resolved_value,
    resolved_entity_id, resolved_entity_kind, learned_from_source,
    confirmed_by, created_by, updated_by
  ) VALUES (
    p_company_id, p_rule_type, v_input, v_norm, v_resolved,
    p_resolved_entity_id, COALESCE(p_resolved_entity_kind,'none'), p_source,
    v_actor, v_actor, v_actor
  )
  RETURNING * INTO v_row;

  INSERT INTO public.intake_dictionary_events (company_id, rule_id, event_type, source, actor_id, metadata)
  VALUES (p_company_id, v_row.id, 'created', p_source, v_actor,
          jsonb_build_object('rule_type', p_rule_type, 'surface', p_surface));

  RETURN jsonb_build_object('status','created','row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.intake_dictionary_upsert_rule(uuid, text, text, text, uuid, text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 2. Registrar uso / conflicto: la confianza crece por evidencia.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_dictionary_record_usage(
  p_company_id uuid,
  p_rule_id uuid,
  p_outcome text,
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.intake_dictionary_rules;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id AND cu.user_id = v_actor
  ) THEN
    RETURN jsonb_build_object('status','denied','message','No tienes acceso a esta empresa.');
  END IF;

  IF p_outcome NOT IN ('applied','success','conflict','rejected') THEN
    RETURN jsonb_build_object('status','invalid','message','Resultado no soportado.');
  END IF;

  UPDATE public.intake_dictionary_rules r SET
    usage_count = r.usage_count + 1,
    success_count = r.success_count + CASE WHEN p_outcome IN ('applied','success') THEN 1 ELSE 0 END,
    conflict_count = r.conflict_count + CASE WHEN p_outcome IN ('conflict','rejected') THEN 1 ELSE 0 END,
    confidence = LEAST(0.99, (
      r.success_count + CASE WHEN p_outcome IN ('applied','success') THEN 1 ELSE 0 END + 1.0
    ) / (
      r.success_count + r.conflict_count
      + CASE WHEN p_outcome IN ('applied','success') THEN 1 ELSE 1 END + 2.0
    )),
    updated_by = v_actor
  WHERE r.id = p_rule_id AND r.company_id = p_company_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','La regla no existe en esta empresa.');
  END IF;

  INSERT INTO public.intake_dictionary_events (company_id, rule_id, event_type, source, actor_id, metadata)
  VALUES (p_company_id, p_rule_id,
          CASE WHEN p_outcome IN ('conflict','rejected') THEN 'conflict' ELSE 'applied' END,
          p_source, v_actor, jsonb_build_object('outcome', p_outcome));

  RETURN jsonb_build_object('status','applied','row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.intake_dictionary_record_usage(uuid, uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 3. VWC: PATCH parcial + expected_version (único carril de edición).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.versioned_update_intake_dictionary_rule(
  p_rule_id uuid,
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
  v_allowed text[] := ARRAY['resolved_value','resolved_entity_id','resolved_entity_kind','active','notes','rule_type'];
  v_keys text[];
  v_bad text[];
  v_current public.intake_dictionary_rules;
  v_row public.intake_dictionary_rules;
  v_new_resolved text;
  v_new_type text;
  v_new_active boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF NOT (public.has_company_role(v_actor, p_company_id, 'owner')
       OR public.has_company_role(v_actor, p_company_id, 'admin')
       OR public.has_company_role(v_actor, p_company_id, 'manager')) THEN
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar el diccionario de esta empresa.');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid','message','Patch vacío o inválido.');
  END IF;

  SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(p_patch) k;
  SELECT array_agg(k) INTO v_bad FROM unnest(v_keys) k WHERE NOT (k = ANY(v_allowed));
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Campos no editables: ' || array_to_string(v_bad, ', '));
  END IF;

  SELECT * INTO v_current FROM public.intake_dictionary_rules
  WHERE id = p_rule_id AND company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','La regla no existe en esta empresa.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('intake_dictionary_rules', p_rule_id, p_company_id, v_actor, p_expected_version, v_current.version, 'stale_version', v_keys, p_surface, p_intent_key, 'conflict');
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_current.version,
      'updated_by', v_current.updated_by,
      'updated_at', v_current.updated_at,
      'row', to_jsonb(v_current)
    );
  END IF;

  v_new_resolved := COALESCE(NULLIF(btrim(COALESCE(p_patch->>'resolved_value','')), ''), v_current.resolved_value);
  v_new_type := COALESCE(p_patch->>'rule_type', v_current.rule_type);
  v_new_active := COALESCE((p_patch->>'active')::boolean, v_current.active);

  IF v_new_type NOT IN ('venue_alias','client_alias','service_type_alias','role_alias','abbreviation','spelling_variant') THEN
    RETURN jsonb_build_object('status','invalid','message','Tipo de regla no soportado.');
  END IF;

  IF public.intake_dictionary_is_sensitive(v_new_resolved)
     OR public.intake_dictionary_is_sensitive(COALESCE(p_patch->>'notes','')) THEN
    RETURN jsonb_build_object('status','invalid','message','El diccionario no guarda datos personales ni información de pago.');
  END IF;

  IF v_new_active AND EXISTS (
    SELECT 1 FROM public.intake_dictionary_rules o
    WHERE o.company_id = p_company_id
      AND o.rule_type = v_new_type
      AND o.input_normalized = v_current.input_normalized
      AND o.active
      AND o.id <> v_current.id
  ) THEN
    RETURN jsonb_build_object('status','invalid','message','Ya existe una regla activa para ese término y tipo.');
  END IF;

  UPDATE public.intake_dictionary_rules r SET
    resolved_value = v_new_resolved,
    resolved_entity_id = CASE WHEN p_patch ? 'resolved_entity_id'
      THEN NULLIF(p_patch->>'resolved_entity_id','')::uuid ELSE r.resolved_entity_id END,
    resolved_entity_kind = COALESCE(p_patch->>'resolved_entity_kind', r.resolved_entity_kind),
    rule_type = v_new_type,
    active = v_new_active,
    notes = CASE WHEN p_patch ? 'notes' THEN NULLIF(p_patch->>'notes','') ELSE r.notes END,
    updated_by = v_actor
  WHERE r.id = p_rule_id
    AND r.company_id = p_company_id
    AND (p_expected_version IS NULL OR r.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','denied','message','No se pudo aplicar el cambio sobre esta regla.');
  END IF;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version, conflict_type, fields_attempted, surface, intent_key, result)
  VALUES ('intake_dictionary_rules', p_rule_id, p_company_id, v_actor, p_expected_version, v_row.version, NULL, v_keys, p_surface, p_intent_key, 'applied');

  INSERT INTO public.intake_dictionary_events (company_id, rule_id, event_type, source, actor_id, metadata)
  VALUES (p_company_id, p_rule_id,
          CASE WHEN v_new_active THEN 'edited' ELSE 'deactivated' END,
          p_surface, v_actor, jsonb_build_object('fields', v_keys));

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.versioned_update_intake_dictionary_rule(uuid, uuid, jsonb, integer, text, text) TO authenticated;