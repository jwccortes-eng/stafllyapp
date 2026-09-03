-- 1) Enforcement backend: contenido material inmutable en comunicados oficiales publicados
CREATE OR REPLACE FUNCTION public.announcement_lock_official_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_published integer;
BEGIN
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

DROP TRIGGER IF EXISTS trg_announcement_lock_official_content ON public.announcements;
CREATE TRIGGER trg_announcement_lock_official_content
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.announcement_lock_official_content();

-- 2) Numeración de versiones atómica (advisory lock por comunicado)
CREATE OR REPLACE FUNCTION public.announcement_version_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.announcements WHERE id = NEW.announcement_id;
  END IF;
  IF NEW.version_number IS NULL OR NEW.version_number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('announcement_version:' || NEW.announcement_id::text, 0));
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
    FROM public.announcement_versions WHERE announcement_id = NEW.announcement_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Grants residuales
REVOKE ALL ON public.announcement_versions FROM anon;
REVOKE ALL ON public.announcement_recipients FROM anon;
REVOKE ALL ON public.announcement_acknowledgments FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.announcement_recipients FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.announcement_acknowledgments FROM authenticated;

GRANT SELECT ON public.announcement_versions TO authenticated;
GRANT SELECT ON public.announcement_recipients TO authenticated;
GRANT SELECT ON public.announcement_acknowledgments TO authenticated;
GRANT ALL ON public.announcement_versions TO service_role;
GRANT ALL ON public.announcement_recipients TO service_role;
GRANT ALL ON public.announcement_acknowledgments TO service_role;

-- 4) Índice del feed del portal
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_employee_state
  ON public.announcement_recipients (employee_id, state);