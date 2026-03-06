
-- Drop and recreate to ensure correct definitions
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete avatars" ON storage.objects;

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'employee-avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can delete avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'employee-avatars' 
  AND (
    public.is_global_owner(auth.uid()) 
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
