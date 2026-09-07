ALTER TABLE public.announcement_versions
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Inmutabilidad: los adjuntos de una versión publicada son evidencia.
CREATE OR REPLACE FUNCTION public.announcement_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded') THEN
    IF (NEW.title_es IS DISTINCT FROM OLD.title_es)
       OR (NEW.body_es IS DISTINCT FROM OLD.body_es)
       OR (NEW.title_en IS DISTINCT FROM OLD.title_en)
       OR (NEW.body_en IS DISTINCT FROM OLD.body_en)
       OR (NEW.media_urls IS DISTINCT FROM OLD.media_urls)
       OR (NEW.attachments IS DISTINCT FROM OLD.attachments)
       OR (NEW.link_url IS DISTINCT FROM OLD.link_url)
       OR (NEW.link_label IS DISTINCT FROM OLD.link_label)
       OR (NEW.communication_type IS DISTINCT FROM OLD.communication_type)
       OR (NEW.audience_mode IS DISTINCT FROM OLD.audience_mode)
       OR (NEW.audience_employee_ids IS DISTINCT FROM OLD.audience_employee_ids)
       OR (NEW.version_number IS DISTINCT FROM OLD.version_number)
    THEN
      RAISE EXCEPTION 'Esta versión ya fue publicada. Crea una nueva versión para cambiar el contenido.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.announcement_version_immutability() FROM PUBLIC, anon, authenticated;