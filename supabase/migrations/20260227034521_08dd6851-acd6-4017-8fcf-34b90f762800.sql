
-- Fix storage INSERT policy to not be overly permissive
DROP POLICY IF EXISTS "Authenticated users can upload shift attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload shift attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'shift-attachments');
