
CREATE OR REPLACE FUNCTION public.intake_file_company_id(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  first_segment text;
BEGIN
  first_segment := split_part(object_name, '/', 1);
  IF first_segment ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN first_segment::uuid;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_service_intake_files(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _company_id IS NOT NULL AND _user_id IS NOT NULL AND (
    public.is_global_owner(_user_id)
    OR public.is_company_owner(_user_id, _company_id)
    OR public.user_is_company_admin(_user_id, _company_id)
  );
$$;

DROP POLICY IF EXISTS "service intake files select" ON storage.objects;
CREATE POLICY "service intake files select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'service-intake-files'
  AND public.can_manage_service_intake_files(auth.uid(), public.intake_file_company_id(name))
);

DROP POLICY IF EXISTS "service intake files insert" ON storage.objects;
CREATE POLICY "service intake files insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'service-intake-files'
  AND public.can_manage_service_intake_files(auth.uid(), public.intake_file_company_id(name))
);

DROP POLICY IF EXISTS "service intake files delete" ON storage.objects;
CREATE POLICY "service intake files delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'service-intake-files'
  AND public.can_manage_service_intake_files(auth.uid(), public.intake_file_company_id(name))
);
