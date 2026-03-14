-- Drop overly permissive update policy
DROP POLICY IF EXISTS "Authenticated users can update employee avatars" ON storage.objects;

-- Create scoped update policy: user can update files matching their employee record
CREATE POLICY "Authenticated users can update employee avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'employee-avatars' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'employee-avatars' AND auth.role() = 'authenticated' AND (
  -- Allow if the file name starts with an employee ID belonging to this user
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
    AND name LIKE e.id::text || '%'
  )
  -- Or if user is admin/owner
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
    AND cu.role IN ('admin', 'owner', 'developer')
  )
));