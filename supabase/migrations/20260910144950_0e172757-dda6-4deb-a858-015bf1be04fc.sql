ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text;

-- Guarda: las columnas de retiro solo se escriben desde la RPC canónica.
CREATE OR REPLACE FUNCTION public.announcement_guard_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.announcement_withdraw', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at
     OR NEW.withdrawn_by IS DISTINCT FROM OLD.withdrawn_by
     OR NEW.withdrawal_reason IS DISTINCT FROM OLD.withdrawal_reason THEN
    RAISE EXCEPTION 'El retiro de un comunicado solo puede hacerse con la acción Retirar comunicado.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcement_guard_withdrawal_trg ON public.announcements;
CREATE TRIGGER announcement_guard_withdrawal_trg
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.announcement_guard_withdrawal();

-- Operación canónica de retiro: atómica, idempotente, motivo obligatorio.
CREATE OR REPLACE FUNCTION public.withdraw_announcement(p_announcement_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a public.announcements%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  SELECT * INTO a FROM public.announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comunicado no encontrado.'; END IF;

  IF NOT (public.announcement_can_manage(a.company_id, 'publish')
          OR public.announcement_can_manage(a.company_id, 'edit')) THEN
    RAISE EXCEPTION 'No tienes permiso para retirar comunicados en esta empresa.';
  END IF;

  IF a.withdrawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already', 'withdrawn_at', a.withdrawn_at,
                              'withdrawal_reason', a.withdrawal_reason);
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indica el motivo del retiro.';
  END IF;

  PERFORM set_config('app.announcement_withdraw', 'on', true);
  UPDATE public.announcements
     SET withdrawn_at = now(),
         withdrawn_by = auth.uid(),
         withdrawal_reason = v_reason,
         updated_at = now()
   WHERE id = p_announcement_id;
  PERFORM set_config('app.announcement_withdraw', 'off', true);

  PERFORM public.log_activity('announcement_withdrawn', 'announcement', p_announcement_id::text, a.company_id,
    jsonb_build_object('reason', v_reason));

  RETURN jsonb_build_object('status', 'withdrawn', 'withdrawn_at', now(), 'withdrawal_reason', v_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.withdraw_announcement(uuid, text) TO authenticated;

-- Lectura: un comunicado retirado deja de abrirse para quien no confirmó.
CREATE OR REPLACE FUNCTION public.can_read_announcement(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.announcement_versions av
       WHERE av.announcement_id = p_announcement_id
    )
    OR (
      EXISTS (
        SELECT 1
          FROM public.announcement_recipients r
          JOIN public.announcement_versions av ON av.id = r.version_id
         WHERE av.announcement_id = p_announcement_id
           AND av.status IN ('published','superseded')
           AND r.employee_id IN (SELECT public.my_employee_ids())
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.announcements a
           WHERE a.id = p_announcement_id AND a.withdrawn_at IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.announcement_acknowledgments ack
           WHERE ack.announcement_id = p_announcement_id
             AND ack.employee_id IN (SELECT public.my_employee_ids())
        )
      )
    );
$$;

-- No se pueden crear acuses nuevos sobre un comunicado retirado.
CREATE OR REPLACE FUNCTION public.acknowledge_announcement(p_version_id uuid, p_language text DEFAULT 'es'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.announcement_recipients%ROWTYPE;
  v_lang text := CASE WHEN p_language = 'en' THEN 'en' ELSE 'es' END;
  v_existing timestamptz;
  v_withdrawn timestamptz;
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

  SELECT withdrawn_at INTO v_withdrawn FROM public.announcements WHERE id = r.announcement_id;
  IF v_withdrawn IS NOT NULL THEN
    RAISE EXCEPTION 'Este comunicado fue retirado y ya no requiere confirmación.';
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

-- No se publica sobre un comunicado retirado.
CREATE OR REPLACE FUNCTION public.publish_announcement_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.announcement_versions%ROWTYPE;
  v_requires boolean;
  v_count integer := 0;
  v_title text;
  v_body text;
  v_withdrawn timestamptz;
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

  SELECT withdrawn_at INTO v_withdrawn FROM public.announcements WHERE id = v.announcement_id;
  IF v_withdrawn IS NOT NULL THEN
    RAISE EXCEPTION 'Este comunicado fue retirado. Crea un comunicado nuevo para publicar.';
  END IF;

  v_requires := v.communication_type IN ('acknowledgment_required','critical_acknowledgment');

  UPDATE public.announcement_versions
     SET status = 'superseded'
   WHERE announcement_id = v.announcement_id AND status = 'published';

  UPDATE public.announcement_versions
     SET status = 'published', published_at = now(), published_by = auth.uid(), updated_at = now()
   WHERE id = p_version_id;

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
$$;