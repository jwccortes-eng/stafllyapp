
-- Fix permissive storage upload policy - drop and recreate with proper grouping
DROP POLICY IF EXISTS "Company users upload employee docs" ON storage.objects;

CREATE POLICY "Company users upload employee docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (
      public.is_global_owner(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid()
      )
    )
  );
