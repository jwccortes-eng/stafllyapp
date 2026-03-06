
-- Fix overpermissive avatar storage policies
DROP POLICY IF EXISTS "Authenticated users can update employee avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete employee avatars" ON storage.objects;

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'employee-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can delete avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'employee-avatars' AND (
  public.is_global_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)
));
