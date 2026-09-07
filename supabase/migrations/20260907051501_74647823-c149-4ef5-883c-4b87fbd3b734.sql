-- ============================================================
-- P0 — Comunicados Oficiales: publicación legítima + audiencia congelada
-- ============================================================

-- 1) INMUTABILIDAD: la publicación oficial puede espejar el contenido en
--    `announcements`; cualquier otra edición sigue bloqueada.
CREATE OR REPLACE FUNCTION public.announcement_lock_official_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_published integer;
BEGIN
  -- La RPC de publicación marca esta bandera de transacción antes de espejar
  -- el contenido de la versión recién publicada. No abre la puerta a edicion
  -- manual: ninguna otra ruta puede fijarla.
  IF current_setting('app.announcement_publish', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_published
    FROM public.announcement_versions
   WHERE announcement_id = OLD.id
     AND status IN ('published', 'superseded');

  IF v_published > 0 THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.media_urls IS DISTINCT FROM OLD.media_urls
       OR NEW.link_url IS DISTINCT FROM OLD.link_url
       OR NEW.link_label IS DISTINCT FROM OLD.link_label
       OR NEW.communication_type IS DISTINCT FROM OLD.communication_type THEN
      RAISE EXCEPTION 'Este comunicado oficial ya fue publicado. Para cambiar el contenido crea una versión nueva y publícala.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) PUBLICACIÓN: misma lógica, con la bandera acotada a la transacción.
CREATE OR REPLACE FUNCTION public.publish_announcement_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Congelación de audiencia de ESTA versión.
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

  -- Espejo del contenido publicado. La bandera es local a la transacción.
  PERFORM set_config('app.announcement_publish', 'on', true);

  UPDATE public.announcements
     SET title = v_title,
         body = v_body,
         media_urls = CASE WHEN COALESCE(jsonb_array_length(v.media_urls), 0) > 0 THEN v.media_urls ELSE media_urls END,
         link_url = v.link_url,
         link_label = v.link_label,
         communication_type = v.communication_type,
         current_version_id = v.id,
         published_at = COALESCE(published_at, now()),
         updated_at = now()
   WHERE id = v.announcement_id;

  PERFORM set_config('app.announcement_publish', 'off', true);

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
$function$;

-- 3) AUDIENCIA: juez único de lectura de un comunicado por parte de un worker.
CREATE OR REPLACE FUNCTION public.can_read_announcement(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- Comunicado legado (sin versiones oficiales): comportamiento histórico.
    NOT EXISTS (
      SELECT 1 FROM public.announcement_versions av
       WHERE av.announcement_id = p_announcement_id
    )
    -- Comunicado oficial: solo la audiencia congelada de alguna versión publicada.
    OR EXISTS (
      SELECT 1
        FROM public.announcement_recipients r
        JOIN public.announcement_versions av ON av.id = r.version_id
       WHERE av.announcement_id = p_announcement_id
         AND av.status IN ('published','superseded')
         AND r.employee_id IN (SELECT public.my_employee_ids())
    );
$function$;

DROP POLICY IF EXISTS "Employees can view published announcements" ON public.announcements;
CREATE POLICY "Employees can view published announcements"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  published_at IS NOT NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.user_id = auth.uid()
       AND e.company_id = announcements.company_id
  )
  AND public.can_read_announcement(announcements.id)
);

-- Reacciones: no pueden revelar la existencia de un comunicado dirigido.
DROP POLICY IF EXISTS "Members view reactions of own company announcements" ON public.announcement_reactions;
CREATE POLICY "Members view reactions of own company announcements"
ON public.announcement_reactions
FOR SELECT
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR (
    EXISTS (
      SELECT 1
        FROM public.announcements a
        JOIN public.employees e ON e.company_id = a.company_id
       WHERE a.id = announcement_reactions.announcement_id
         AND e.user_id = auth.uid()
    )
    AND public.can_read_announcement(announcement_reactions.announcement_id)
  )
);

DROP POLICY IF EXISTS "Employees can insert own reactions" ON public.announcement_reactions;
CREATE POLICY "Employees can insert own reactions"
ON public.announcement_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees
     WHERE employees.id = announcement_reactions.employee_id
       AND employees.user_id = auth.uid()
  )
  AND public.can_read_announcement(announcement_reactions.announcement_id)
);

-- 4) MEDIA: la imagen hereda exactamente la autorización del comunicado.
CREATE OR REPLACE FUNCTION public.can_read_announcement_media(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_prefix text := split_part(p_object_name, '/', 1);
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.is_global_owner(auth.uid()) THEN RETURN true; END IF;

  IF v_prefix ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_company := v_prefix::uuid;
  END IF;

  -- Administrador con permiso de comunicados en esa empresa.
  IF v_company IS NOT NULL AND public.announcement_can_manage(v_company, 'view') THEN
    RETURN true;
  END IF;

  -- Adjunto de un comunicado oficial con audiencia seleccionada:
  -- solo destinatarios congelados.
  IF EXISTS (
    SELECT 1 FROM public.announcement_versions av
     WHERE av.audience_mode = 'selected'
       AND av.media_urls::text LIKE '%' || p_object_name || '%'
  ) THEN
    RETURN EXISTS (
      SELECT 1
        FROM public.announcement_versions av
        JOIN public.announcement_recipients r ON r.version_id = av.id
       WHERE av.media_urls::text LIKE '%' || p_object_name || '%'
         AND r.employee_id IN (SELECT public.my_employee_ids())
    );
  END IF;

  -- Resto (comunicados generales / audiencia toda la empresa): miembros de la empresa.
  RETURN v_company IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.user_id = auth.uid()
       AND e.company_id = v_company
  );
END;
$function$;

DROP POLICY IF EXISTS "Anyone can view announcement media" ON storage.objects;
CREATE POLICY "Announcement media authorized read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'announcement-media'
  AND public.can_read_announcement_media(name)
);
