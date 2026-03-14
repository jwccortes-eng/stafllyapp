-- Drop restrictive update policy
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;

-- Create permissive update policy for authenticated users on employee-avatars
CREATE POLICY "Authenticated users can update employee avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'employee-avatars' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'employee-avatars' AND auth.role() = 'authenticated');