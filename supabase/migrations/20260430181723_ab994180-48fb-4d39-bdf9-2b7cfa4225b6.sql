-- Worker self-service RLS for employee_documents + storage.objects (employee-documents bucket)
-- Adds the MINIMUM policies a worker needs to upload, view, and delete their OWN documents
-- from the worker portal. No changes to payroll, time_entries, scheduled_shifts, or buckets.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) public.employee_documents — workers manage their own rows
-- ─────────────────────────────────────────────────────────────────────────────

-- INSERT: worker can insert a row only for their own employee record
DROP POLICY IF EXISTS "Workers insert own documents" ON public.employee_documents;
CREATE POLICY "Workers insert own documents"
ON public.employee_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
      AND e.user_id = auth.uid()
      AND e.company_id = employee_documents.company_id
  )
);

-- DELETE: worker can delete their own documents
DROP POLICY IF EXISTS "Workers delete own documents" ON public.employee_documents;
CREATE POLICY "Workers delete own documents"
ON public.employee_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_documents.employee_id
      AND e.user_id = auth.uid()
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) storage.objects — workers manage files under their own employee_id/ folder
--    in the private bucket `employee-documents`.
--    Path convention enforced by app: `<employee_id>/<filename>`
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT (needed for createSignedUrl)
DROP POLICY IF EXISTS "Workers read own employee docs" ON storage.objects;
CREATE POLICY "Workers read own employee docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.id::text = (storage.foldername(name))[1]
  )
);

-- INSERT: only into own folder
DROP POLICY IF EXISTS "Workers upload own employee docs" ON storage.objects;
CREATE POLICY "Workers upload own employee docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.id::text = (storage.foldername(name))[1]
  )
);

-- DELETE: own files only
DROP POLICY IF EXISTS "Workers delete own employee docs" ON storage.objects;
CREATE POLICY "Workers delete own employee docs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.id::text = (storage.foldername(name))[1]
  )
);