-- Replace the broad employee-avatars INSERT policy with the same path-ownership
-- check already enforced on UPDATE. Mirrors existing "Scoped avatar update".
DROP POLICY IF EXISTS "Authenticated users can upload employee avatars" ON storage.objects;

CREATE POLICY "Scoped avatar insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-avatars'
  AND (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND objects.name LIKE (e.id::text || '%')
    )
    OR public.is_global_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);