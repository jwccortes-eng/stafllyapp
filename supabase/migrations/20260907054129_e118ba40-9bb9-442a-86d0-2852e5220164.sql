ALTER TABLE public.announcement_versions
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.announcement_version_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        OR NEW.attachments IS DISTINCT FROM OLD.attachments
        OR NEW.communication_type IS DISTINCT FROM OLD.communication_type
        OR NEW.audience_mode IS DISTINCT FROM OLD.audience_mode
        OR NEW.audience_employee_ids IS DISTINCT FROM OLD.audience_employee_ids
        OR NEW.published_at IS DISTINCT FROM OLD.published_at
        OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
      RAISE EXCEPTION 'Esta versión ya fue publicada. Crea una nueva versión para cambiar el contenido o los adjuntos.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.announcement_new_version(p_announcement_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    title_es, body_es, title_en, body_en, media_urls, attachments, link_url, link_label,
    audience_mode, audience_employee_ids, created_by
  ) VALUES (
    p_announcement_id, v_company, 'draft',
    COALESCE(v_src.communication_type, 'informational'),
    COALESCE(v_src.default_language, 'es'),
    v_src.title_es, v_src.body_es, v_src.title_en, v_src.body_en,
    COALESCE(v_src.media_urls, '[]'::jsonb),
    COALESCE(v_src.attachments, '[]'::jsonb),
    v_src.link_url, v_src.link_label,
    COALESCE(v_src.audience_mode, 'all_company'),
    COALESCE(v_src.audience_employee_ids, '{}'::uuid[]),
    auth.uid()
  ) RETURNING id INTO v_new_id;

  PERFORM public.log_activity('announcement_version_created', 'announcement', p_announcement_id::text, v_company,
    jsonb_build_object('version_id', v_new_id));

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_read_announcement_media(p_object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_prefix text := split_part(p_object_name, '/', 1);
  v_referenced boolean;
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

  -- ¿El objeto pertenece a alguna versión de comunicado oficial?
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_versions av
     WHERE av.media_urls::text LIKE '%' || p_object_name || '%'
        OR av.attachments::text LIKE '%' || p_object_name || '%'
  ) INTO v_referenced;

  IF v_referenced THEN
    -- Solo destinatarios congelados de una versión publicada de ese objeto.
    RETURN EXISTS (
      SELECT 1
        FROM public.announcement_versions av
        JOIN public.announcement_recipients r ON r.version_id = av.id
       WHERE (av.media_urls::text LIKE '%' || p_object_name || '%'
              OR av.attachments::text LIKE '%' || p_object_name || '%')
         AND av.status IN ('published','superseded')
         AND r.employee_id IN (SELECT public.my_employee_ids())
    );
  END IF;

  -- Resto (anuncios legados sin versiones): miembros de la empresa.
  RETURN v_company IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.user_id = auth.uid()
       AND e.company_id = v_company
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.can_read_announcement_media(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_announcement_media(text) TO authenticated, service_role;