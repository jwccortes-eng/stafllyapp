-- ============================================================
-- OFFICIAL COMMUNICATIONS P1 — extension of canonical announcements
-- ============================================================

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS communication_type text NOT NULL DEFAULT 'informational',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_version_id uuid;

DO $$ BEGIN
  ALTER TABLE public.announcements
    ADD CONSTRAINT announcements_communication_type_chk
    CHECK (communication_type IN ('informational','acknowledgment_required','critical_acknowledgment'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 1. VERSIONS (immutable published content, bilingual)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  communication_type text NOT NULL DEFAULT 'informational'
    CHECK (communication_type IN ('informational','acknowledgment_required','critical_acknowledgment')),
  default_language text NOT NULL DEFAULT 'es' CHECK (default_language IN ('es','en')),
  title_es text,
  body_es text,
  title_en text,
  body_en text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  link_url text,
  link_label text,
  audience_mode text NOT NULL DEFAULT 'all_company' CHECK (audience_mode IN ('all_company','selected')),
  audience_employee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  published_at timestamptz,
  published_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_announcement_versions_announcement ON public.announcement_versions(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_versions_company ON public.announcement_versions(company_id);

GRANT SELECT, INSERT, UPDATE ON public.announcement_versions TO authenticated;
GRANT ALL ON public.announcement_versions TO service_role;
ALTER TABLE public.announcement_versions ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. RECIPIENTS (frozen audience + per-person state)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.announcement_versions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'available' CHECK (state IN ('available','viewed','acknowledged')),
  requires_acknowledgment boolean NOT NULL DEFAULT false,
  available_at timestamptz NOT NULL DEFAULT now(),
  first_viewed_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_recipients_employee ON public.announcement_recipients(employee_id, state);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_version ON public.announcement_recipients(version_id);

GRANT SELECT ON public.announcement_recipients TO authenticated;
GRANT ALL ON public.announcement_recipients TO service_role;
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. ACKNOWLEDGMENTS (canonical evidence)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.announcement_versions(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  user_id uuid,
  language_variant text NOT NULL DEFAULT 'es' CHECK (language_variant IN ('es','en')),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_ack_version ON public.announcement_acknowledgments(version_id);
CREATE INDEX IF NOT EXISTS idx_announcement_ack_employee ON public.announcement_acknowledgments(employee_id);

GRANT SELECT ON public.announcement_acknowledgments TO authenticated;
GRANT ALL ON public.announcement_acknowledgments TO service_role;
ALTER TABLE public.announcement_acknowledgments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. AUTHORITY HELPERS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.announcement_can_manage(_company_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_global_owner(auth.uid())
      OR public.has_module_permission(auth.uid(), _company_id, 'announcements', _permission);
$$;

CREATE OR REPLACE FUNCTION public.my_employee_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 5. RLS POLICIES
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Managers view announcement versions" ON public.announcement_versions;
CREATE POLICY "Managers view announcement versions" ON public.announcement_versions
  FOR SELECT TO authenticated
  USING (public.announcement_can_manage(company_id, 'view'));

DROP POLICY IF EXISTS "Workers view their announcement versions" ON public.announcement_versions;
CREATE POLICY "Workers view their announcement versions" ON public.announcement_versions
  FOR SELECT TO authenticated
  USING (
    status IN ('published','superseded')
    AND EXISTS (
      SELECT 1 FROM public.announcement_recipients r
      WHERE r.version_id = announcement_versions.id
        AND r.employee_id IN (SELECT public.my_employee_ids())
    )
  );

DROP POLICY IF EXISTS "Managers create announcement versions" ON public.announcement_versions;
CREATE POLICY "Managers create announcement versions" ON public.announcement_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.announcement_can_manage(company_id, 'edit') AND status = 'draft');

DROP POLICY IF EXISTS "Managers update draft versions" ON public.announcement_versions;
CREATE POLICY "Managers update draft versions" ON public.announcement_versions
  FOR UPDATE TO authenticated
  USING (public.announcement_can_manage(company_id, 'edit') AND status = 'draft')
  WITH CHECK (public.announcement_can_manage(company_id, 'edit'));

DROP POLICY IF EXISTS "Managers view recipients" ON public.announcement_recipients;
CREATE POLICY "Managers view recipients" ON public.announcement_recipients
  FOR SELECT TO authenticated
  USING (public.announcement_can_manage(company_id, 'view'));

DROP POLICY IF EXISTS "Workers view own recipient rows" ON public.announcement_recipients;
CREATE POLICY "Workers view own recipient rows" ON public.announcement_recipients
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT public.my_employee_ids()));

DROP POLICY IF EXISTS "Managers view acknowledgments" ON public.announcement_acknowledgments;
CREATE POLICY "Managers view acknowledgments" ON public.announcement_acknowledgments
  FOR SELECT TO authenticated
  USING (public.announcement_can_manage(company_id, 'view'));

DROP POLICY IF EXISTS "Workers view own acknowledgments" ON public.announcement_acknowledgments;
CREATE POLICY "Workers view own acknowledgments" ON public.announcement_acknowledgments
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT public.my_employee_ids()));

-- No INSERT/UPDATE/DELETE policies: evidence is written only through RPCs.

-- ------------------------------------------------------------
-- 6. INTEGRITY TRIGGERS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.announcement_version_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number = 0 THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
    FROM public.announcement_versions WHERE announcement_id = NEW.announcement_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.announcements WHERE id = NEW.announcement_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcement_version_number ON public.announcement_versions;
CREATE TRIGGER trg_announcement_version_number
  BEFORE INSERT ON public.announcement_versions
  FOR EACH ROW EXECUTE FUNCTION public.announcement_version_assign_number();

CREATE OR REPLACE FUNCTION public.announcement_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'No se puede eliminar una versión publicada: la evidencia es histórica.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('published','superseded') THEN
    IF (NEW.title_es IS DISTINCT FROM OLD.title_es
        OR NEW.body_es IS DISTINCT FROM OLD.body_es
        OR NEW.title_en IS DISTINCT FROM OLD.title_en
        OR NEW.body_en IS DISTINCT FROM OLD.body_en
        OR NEW.media_urls IS DISTINCT FROM OLD.media_urls
        OR NEW.communication_type IS DISTINCT FROM OLD.communication_type
        OR NEW.audience_mode IS DISTINCT FROM OLD.audience_mode
        OR NEW.audience_employee_ids IS DISTINCT FROM OLD.audience_employee_ids
        OR NEW.published_at IS DISTINCT FROM OLD.published_at
        OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
      RAISE EXCEPTION 'Esta versión ya fue publicada. Crea una nueva versión para cambiar el contenido.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcement_version_immutability ON public.announcement_versions;
CREATE TRIGGER trg_announcement_version_immutability
  BEFORE UPDATE OR DELETE ON public.announcement_versions
  FOR EACH ROW EXECUTE FUNCTION public.announcement_version_immutability();

CREATE OR REPLACE FUNCTION public.announcement_ack_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Las confirmaciones de recibido no se pueden modificar ni eliminar.';
END;
$$;

DROP TRIGGER IF EXISTS trg_announcement_ack_immutability ON public.announcement_acknowledgments;
CREATE TRIGGER trg_announcement_ack_immutability
  BEFORE UPDATE OR DELETE ON public.announcement_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.announcement_ack_immutability();

-- Protect announcements that already carry evidence from being soft/hard deleted
CREATE OR REPLACE FUNCTION public.announcement_protect_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ack_count integer;
BEGIN
  SELECT count(*) INTO ack_count FROM public.announcement_acknowledgments
   WHERE announcement_id = COALESCE(OLD.id, NEW.id);

  IF ack_count > 0 THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Este comunicado tiene confirmaciones registradas. Archívalo en lugar de eliminarlo.';
    END IF;
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Este comunicado tiene confirmaciones registradas. Archívalo en lugar de eliminarlo.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_announcement_protect_evidence ON public.announcements;
CREATE TRIGGER trg_announcement_protect_evidence
  BEFORE UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.announcement_protect_evidence();

-- ------------------------------------------------------------
-- 7. RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.announcement_new_version(p_announcement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_src public.announcement_versions%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.announcements WHERE id = p_announcement_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Comunicado no encontrado.'; END IF;
  IF NOT public.announcement_can_manage(v_company, 'edit') THEN
    RAISE EXCEPTION 'No tienes permiso para editar comunicados en esta empresa.';
  END IF;

  SELECT * INTO v_src FROM public.announcement_versions
   WHERE announcement_id = p_announcement_id AND status = 'draft'
   ORDER BY version_number DESC LIMIT 1;
  IF FOUND THEN RETURN v_src.id; END IF;

  SELECT * INTO v_src FROM public.announcement_versions
   WHERE announcement_id = p_announcement_id
   ORDER BY version_number DESC LIMIT 1;

  INSERT INTO public.announcement_versions (
    announcement_id, company_id, status, communication_type, default_language,
    title_es, body_es, title_en, body_en, media_urls, link_url, link_label,
    audience_mode, audience_employee_ids, created_by
  ) VALUES (
    p_announcement_id, v_company, 'draft',
    COALESCE(v_src.communication_type, 'informational'),
    COALESCE(v_src.default_language, 'es'),
    v_src.title_es, v_src.body_es, v_src.title_en, v_src.body_en,
    COALESCE(v_src.media_urls, '[]'::jsonb), v_src.link_url, v_src.link_label,
    COALESCE(v_src.audience_mode, 'all_company'),
    COALESCE(v_src.audience_employee_ids, '{}'::uuid[]),
    auth.uid()
  ) RETURNING id INTO v_new_id;

  PERFORM public.log_activity('announcement_version_created', 'announcement', p_announcement_id::text, v_company,
    jsonb_build_object('version_id', v_new_id));

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_announcement_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.announcement_versions%ROWTYPE;
  v_requires boolean;
  v_count integer := 0;
  v_title text;
  v_body text;
BEGIN
  SELECT * INTO v FROM public.announcement_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Versión no encontrada.'; END IF;
  IF NOT public.announcement_can_manage(v.company_id, 'publish') THEN
    RAISE EXCEPTION 'No tienes permiso para publicar comunicados en esta empresa.';
  END IF;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'Esta versión ya fue publicada.'; END IF;
  IF COALESCE(NULLIF(btrim(COALESCE(v.title_es, '')), ''), NULLIF(btrim(COALESCE(v.title_en, '')), '')) IS NULL THEN
    RAISE EXCEPTION 'El comunicado necesita al menos un título.';
  END IF;

  v_requires := v.communication_type IN ('acknowledgment_required','critical_acknowledgment');

  UPDATE public.announcement_versions
     SET status = 'superseded'
   WHERE announcement_id = v.announcement_id AND status = 'published';

  UPDATE public.announcement_versions
     SET status = 'published', published_at = now(), published_by = auth.uid(), updated_at = now()
   WHERE id = p_version_id;

  -- Freeze audience
  INSERT INTO public.announcement_recipients (
    announcement_id, version_id, company_id, employee_id, requires_acknowledgment
  )
  SELECT v.announcement_id, v.id, v.company_id, e.id, v_requires
    FROM public.employees e
   WHERE e.company_id = v.company_id
     AND e.is_active = true
     AND e.merged_into_employee_id IS NULL
     AND (
       v.audience_mode = 'all_company'
       OR e.id = ANY (v.audience_employee_ids)
     )
  ON CONFLICT (version_id, employee_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_title := COALESCE(NULLIF(btrim(COALESCE(CASE WHEN v.default_language = 'en' THEN v.title_en ELSE v.title_es END, '')), ''),
                      NULLIF(btrim(COALESCE(v.title_es, '')), ''), v.title_en);
  v_body := COALESCE(CASE WHEN v.default_language = 'en' THEN v.body_en ELSE v.body_es END, v.body_es, v.body_en, '');

  UPDATE public.announcements
     SET title = v_title,
         body = v_body,
         media_urls = CASE WHEN jsonb_array_length(v.media_urls) > 0 THEN v.media_urls ELSE media_urls END,
         link_url = v.link_url,
         link_label = v.link_label,
         communication_type = v.communication_type,
         current_version_id = v.id,
         published_at = COALESCE(published_at, now()),
         updated_at = now()
   WHERE id = v.announcement_id;

  -- In-app notification through the existing worker inbox
  INSERT INTO public.notifications (company_id, recipient_id, recipient_type, type, title, body, metadata, created_by)
  SELECT v.company_id, r.employee_id, 'employee', 'announcement_published',
         CASE WHEN v_requires THEN 'Comunicado que requiere tu confirmación' ELSE 'Nuevo comunicado' END,
         v_title,
         jsonb_build_object('announcement_id', v.announcement_id, 'version_id', v.id,
                            'requires_acknowledgment', v_requires,
                            'communication_type', v.communication_type),
         auth.uid()
    FROM public.announcement_recipients r
   WHERE r.version_id = v.id;

  PERFORM public.log_activity('announcement_published', 'announcement', v.announcement_id::text, v.company_id,
    jsonb_build_object('version_id', v.id, 'version_number', v.version_number,
                       'communication_type', v.communication_type, 'recipients', v_count));

  RETURN jsonb_build_object('status', 'published', 'version_id', v.id, 'recipients', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_announcement_viewed(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE public.announcement_recipients r
     SET state = CASE WHEN r.state = 'acknowledged' THEN 'acknowledged' ELSE 'viewed' END,
         first_viewed_at = COALESCE(r.first_viewed_at, now()),
         updated_at = now()
   WHERE r.version_id = p_version_id
     AND r.employee_id IN (SELECT public.my_employee_ids());
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('status', CASE WHEN v_updated > 0 THEN 'viewed' ELSE 'noop' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_announcement(p_version_id uuid, p_language text DEFAULT 'es')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.announcement_recipients%ROWTYPE;
  v_lang text := CASE WHEN p_language = 'en' THEN 'en' ELSE 'es' END;
  v_existing timestamptz;
BEGIN
  SELECT * INTO r FROM public.announcement_recipients
   WHERE version_id = p_version_id
     AND employee_id IN (SELECT public.my_employee_ids())
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este comunicado no está dirigido a ti.';
  END IF;

  SELECT acknowledged_at INTO v_existing FROM public.announcement_acknowledgments
   WHERE version_id = p_version_id AND employee_id = r.employee_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already', 'acknowledged_at', v_existing);
  END IF;

  INSERT INTO public.announcement_acknowledgments (
    announcement_id, version_id, company_id, employee_id, user_id, language_variant
  ) VALUES (
    r.announcement_id, r.version_id, r.company_id, r.employee_id, auth.uid(), v_lang
  )
  ON CONFLICT (version_id, employee_id) DO NOTHING;

  SELECT acknowledged_at INTO v_existing FROM public.announcement_acknowledgments
   WHERE version_id = p_version_id AND employee_id = r.employee_id;

  UPDATE public.announcement_recipients
     SET state = 'acknowledged',
         acknowledged_at = COALESCE(acknowledged_at, v_existing),
         first_viewed_at = COALESCE(first_viewed_at, now()),
         updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('status', 'acknowledged', 'acknowledged_at', v_existing, 'language_variant', v_lang);
END;
$$;

CREATE OR REPLACE FUNCTION public.announcement_version_recipients(p_version_id uuid)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  state text,
  requires_acknowledgment boolean,
  available_at timestamptz,
  first_viewed_at timestamptz,
  acknowledged_at timestamptz,
  language_variant text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.announcement_versions WHERE id = p_version_id;
  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT public.announcement_can_manage(v_company, 'view') THEN
    RAISE EXCEPTION 'No tienes permiso para ver los destinatarios de este comunicado.';
  END IF;

  RETURN QUERY
  SELECT r.employee_id,
         btrim(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')) AS full_name,
         r.state, r.requires_acknowledgment, r.available_at, r.first_viewed_at, r.acknowledged_at,
         a.language_variant
    FROM public.announcement_recipients r
    JOIN public.employees e ON e.id = r.employee_id
    LEFT JOIN public.announcement_acknowledgments a
           ON a.version_id = r.version_id AND a.employee_id = r.employee_id
   WHERE r.version_id = p_version_id
   ORDER BY 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.announcement_new_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_announcement_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_announcement_viewed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_announcement(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_version_recipients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_can_manage(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_employee_ids() TO authenticated;