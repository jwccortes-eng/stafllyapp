-- Fase 3C — Configuración de empresa no financiera bajo Versioned Write Contract.

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS bump_company_settings_version ON public.company_settings;
CREATE TRIGGER bump_company_settings_version
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE OR REPLACE FUNCTION public.bump_company_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_companies_version ON public.companies;
CREATE TRIGGER bump_companies_version
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.bump_company_version();

-- ---------------------------------------------------------------------------
-- Carril 2 — PATCH versionado sobre una clave de company_settings.
-- Merge server-side: sólo las claves del patch se tocan dentro del JSONB.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.versioned_update_company_setting(
  p_company_id uuid,
  p_key text,
  p_patch jsonb,
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
  v_allowed_keys text[] := ARRAY[
    'geofence','time_tolerance','auto_close','auto_validation',
    'shifts_config','clock_config','onboarding_config',
    'employee_number_config','notifications','branding','portal'
  ];
  v_fields text[];
  v_current public.company_settings;
  v_row public.company_settings;
  v_merged jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Falta el contexto de empresa.');
  END IF;

  IF NOT (p_key = ANY(v_allowed_keys)) THEN
    RETURN jsonb_build_object('status','invalid','message','Configuración no editable desde esta superficie: ' || p_key);
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid','message','Patch vacío o inválido.');
  END IF;

  SELECT array_agg(k) INTO v_fields FROM jsonb_object_keys(p_patch) AS k;

  IF NOT (
    public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
    OR public.has_company_role(v_actor, p_company_id, 'owner'::app_role)
    OR public.has_role(v_actor, 'owner'::app_role)
    OR public.has_role(v_actor, 'developer'::app_role)
  ) THEN
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar la configuración de esta empresa.');
  END IF;

  SELECT * INTO v_current FROM public.company_settings
  WHERE company_id = p_company_id AND key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_version IS NOT NULL THEN
      RETURN jsonb_build_object('status','conflict','expected_version', p_expected_version,
        'actual_version', NULL, 'row', NULL);
    END IF;
    INSERT INTO public.company_settings (company_id, key, value, updated_by)
    VALUES (p_company_id, p_key, p_patch, v_actor)
    ON CONFLICT (company_id, key) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      SELECT * INTO v_row FROM public.company_settings
      WHERE company_id = p_company_id AND key = p_key;
    END IF;

    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version,
       conflict_type, fields_attempted, surface, intent_key, result, after_values)
    VALUES ('company_settings', v_row.id, p_company_id, v_actor, NULL, v_row.version,
       NULL, v_fields, p_surface, p_intent_key, 'applied', v_row.value);

    RETURN jsonb_build_object('status','applied','version', v_row.version,
      'row', jsonb_build_object('id', v_row.id, 'key', v_row.key, 'version', v_row.version) || v_row.value);
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version,
       conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('company_settings', v_current.id, p_company_id, v_actor, p_expected_version, v_current.version,
       'stale_version', v_fields, p_surface, p_intent_key, 'conflict');
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_current.version,
      'updated_by', v_current.updated_by,
      'updated_at', v_current.updated_at,
      'row', jsonb_build_object('id', v_current.id, 'key', v_current.key, 'version', v_current.version) || COALESCE(v_current.value, '{}'::jsonb)
    );
  END IF;

  v_merged := COALESCE(v_current.value, '{}'::jsonb) || p_patch;

  UPDATE public.company_settings s
  SET value = v_merged
  WHERE s.id = v_current.id
    AND s.company_id = p_company_id
    AND (p_expected_version IS NULL OR s.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','denied','message','No se pudo guardar la configuración.');
  END IF;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version,
     conflict_type, fields_attempted, surface, intent_key, result, before_values, after_values)
  VALUES ('company_settings', v_row.id, p_company_id, v_actor, p_expected_version, v_row.version,
     NULL, v_fields, p_surface, p_intent_key, 'applied', v_current.value, v_row.value);

  RETURN jsonb_build_object('status','applied','version', v_row.version,
    'row', jsonb_build_object('id', v_row.id, 'key', v_row.key, 'version', v_row.version) || COALESCE(v_row.value, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.versioned_update_company_setting(uuid, text, jsonb, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.versioned_update_company_setting(uuid, text, jsonb, integer, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Carril 2 — PATCH versionado sobre identidad visible de la empresa.
-- Whitelist estricta: name, logo_url, brand_color. Nada de tenant ni billing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.versioned_update_company_profile(
  p_company_id uuid,
  p_patch jsonb,
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
  v_allowed text[] := ARRAY['name','logo_url','brand_color'];
  v_fields text[];
  v_bad text[];
  v_current public.companies;
  v_next public.companies;
  v_row public.companies;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Sesión no válida.');
  END IF;

  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('status','denied','message','Falta el contexto de empresa.');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid','message','Patch vacío o inválido.');
  END IF;

  SELECT array_agg(k) INTO v_fields FROM jsonb_object_keys(p_patch) AS k;
  SELECT array_agg(k) INTO v_bad FROM unnest(v_fields) AS k WHERE NOT (k = ANY(v_allowed));
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('status','invalid','message','Campos protegidos: ' || array_to_string(v_bad, ', '));
  END IF;

  IF NOT (
    public.has_company_role(v_actor, p_company_id, 'admin'::app_role)
    OR public.has_company_role(v_actor, p_company_id, 'owner'::app_role)
    OR public.has_role(v_actor, 'owner'::app_role)
    OR public.has_role(v_actor, 'developer'::app_role)
  ) THEN
    RETURN jsonb_build_object('status','denied','message','No tienes permiso para editar esta empresa.');
  END IF;

  SELECT * INTO v_current FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','message','La empresa no existe.');
  END IF;

  IF p_patch ? 'name' AND COALESCE(btrim(p_patch->>'name'), '') = '' THEN
    RETURN jsonb_build_object('status','invalid','message','El nombre visible no puede quedar vacío.');
  END IF;

  IF p_expected_version IS NOT NULL AND v_current.version IS DISTINCT FROM p_expected_version THEN
    INSERT INTO public.versioned_write_audit
      (entity, entity_id, company_id, actor_id, expected_version, actual_version,
       conflict_type, fields_attempted, surface, intent_key, result)
    VALUES ('companies', p_company_id, p_company_id, v_actor, p_expected_version, v_current.version,
       'stale_version', v_fields, p_surface, p_intent_key, 'conflict');
    RETURN jsonb_build_object(
      'status','conflict',
      'expected_version', p_expected_version,
      'actual_version', v_current.version,
      'updated_at', v_current.updated_at,
      'row', to_jsonb(v_current)
    );
  END IF;

  v_next := jsonb_populate_record(v_current, p_patch);

  UPDATE public.companies c SET
    name = v_next.name,
    logo_url = v_next.logo_url,
    brand_color = v_next.brand_color
  WHERE c.id = p_company_id
    AND (p_expected_version IS NULL OR c.version = p_expected_version)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','denied','message','No se pudo actualizar la empresa.');
  END IF;

  INSERT INTO public.versioned_write_audit
    (entity, entity_id, company_id, actor_id, expected_version, actual_version,
     conflict_type, fields_attempted, surface, intent_key, result, before_values, after_values)
  VALUES ('companies', p_company_id, p_company_id, v_actor, p_expected_version, v_row.version,
     NULL, v_fields, p_surface, p_intent_key, 'applied',
     jsonb_build_object('name', v_current.name, 'logo_url', v_current.logo_url, 'brand_color', v_current.brand_color),
     jsonb_build_object('name', v_row.name, 'logo_url', v_row.logo_url, 'brand_color', v_row.brand_color));

  RETURN jsonb_build_object('status','applied','version', v_row.version, 'row', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.versioned_update_company_profile(uuid, jsonb, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.versioned_update_company_profile(uuid, jsonb, integer, text, text) TO authenticated;