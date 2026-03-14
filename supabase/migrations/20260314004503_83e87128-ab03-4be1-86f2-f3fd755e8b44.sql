
-- Fix: Scope avatar UPDATE to file owner + admins, DELETE to admins only

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can update employee avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete employee avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;

-- UPDATE: owner (via employee record) or admin/owner/developer
CREATE POLICY "Scoped avatar update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'employee-avatars')
WITH CHECK (
  bucket_id = 'employee-avatars' AND (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
      AND name LIKE e.id::text || '%'
    )
    OR public.is_global_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- DELETE: admin/owner/developer only
CREATE POLICY "Admin avatar delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-avatars' AND (
    public.is_global_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);
