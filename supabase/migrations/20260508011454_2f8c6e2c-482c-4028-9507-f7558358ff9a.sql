-- Helper: lets anon verify an application row exists for storage path validation,
-- without exposing job_applications to anon SELECT.
CREATE OR REPLACE FUNCTION public.application_exists(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.job_applications WHERE id = _id);
$$;

REVOKE ALL ON FUNCTION public.application_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.application_exists(uuid) TO anon, authenticated;

-- Replace the storage upload policy so the EXISTS check runs as definer.
DROP POLICY IF EXISTS "Public can upload application docs to valid application folder"
  ON storage.objects;

CREATE POLICY "Public can upload application docs to valid application folder"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'application-documents'
  AND public.application_exists(((storage.foldername(name))[1])::uuid)
);
