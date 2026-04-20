-- 1) Privatize the bucket so no anonymous public access is possible
UPDATE storage.buckets
SET public = false
WHERE id = 'shift-attachments';

-- 2) Drop any existing permissive public policies for this bucket
DROP POLICY IF EXISTS "Anyone can view shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can view shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Company members can view shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Company members can upload shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Company members can update shift attachments" ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete shift attachments" ON storage.objects;

-- 3) Restrict reads to authenticated members of the owning company.
-- Path convention used by the app: "<company_id>/<shift_id>/..." — the first folder is the company id.
CREATE POLICY "Company members can view shift attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shift-attachments'
  AND (
    -- Member of the company that owns this attachment
    EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.company_id::text = (storage.foldername(name))[1]
    )
    -- Global owners / developers can always read
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- 4) Restrict writes to the same set
CREATE POLICY "Company members can upload shift attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shift-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.company_id::text = (storage.foldername(name))[1]
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Company members can update shift attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shift-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.company_id::text = (storage.foldername(name))[1]
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Company members can delete shift attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'shift-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.company_id::text = (storage.foldername(name))[1]
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);