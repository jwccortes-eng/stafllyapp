
-- Fix storage policy: employee-documents - scope to company members
DROP POLICY IF EXISTS "Company users read employee docs" ON storage.objects;
CREATE POLICY "Company users read own company employee docs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
    AND cu.company_id IN (
      SELECT e.company_id FROM public.employees e
      WHERE e.id::text = (storage.foldername(name))[1]
    )
  )
);

-- Fix storage policy: payroll-truth-files - scope to company admins
DROP POLICY IF EXISTS "Admins can view payroll truth files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload payroll truth files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete payroll truth files" ON storage.objects;

CREATE POLICY "Company admins can view payroll truth files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payroll-truth-files'
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
      AND cu.role IN ('admin', 'company_owner')
    )
  )
);

CREATE POLICY "Company admins can upload payroll truth files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payroll-truth-files'
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
      AND cu.role IN ('admin', 'company_owner')
    )
  )
);

CREATE POLICY "Company admins can delete payroll truth files" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'payroll-truth-files'
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
      AND cu.role IN ('admin', 'company_owner')
    )
  )
);

-- Fix storage policy: kiosk-photos - scope to company members
DROP POLICY IF EXISTS "Admins can view kiosk photos" ON storage.objects;
CREATE POLICY "Company admins can view kiosk photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'kiosk-photos'
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
      AND cu.role IN ('admin', 'company_owner', 'manager', 'supervisor')
    )
  )
);
