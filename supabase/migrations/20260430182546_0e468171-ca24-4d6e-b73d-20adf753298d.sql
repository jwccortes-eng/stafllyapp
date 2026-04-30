CREATE OR REPLACE FUNCTION public.worker_owns_employee_document_scope(_employee_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = _employee_id
      AND e.company_id = _company_id
      AND e.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.worker_can_access_employee_doc_path(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND (
        e.id::text = (storage.foldername(_path))[1]
        OR (
          e.company_id::text = (storage.foldername(_path))[1]
          AND e.id::text = (storage.foldername(_path))[2]
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.company_user_can_access_employee_doc_path(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.company_users cu
      JOIN public.employees e ON e.company_id = cu.company_id
      WHERE cu.user_id = auth.uid()
        AND (
          e.id::text = (storage.foldername(_path))[1]
          OR (
            e.company_id::text = (storage.foldername(_path))[1]
            AND e.id::text = (storage.foldername(_path))[2]
          )
        )
    )
$$;

DROP POLICY IF EXISTS "Employees view own documents" ON public.employee_documents;
CREATE POLICY "Employees view own documents"
ON public.employee_documents
FOR SELECT
TO authenticated
USING (public.worker_owns_employee_document_scope(employee_id, company_id));

DROP POLICY IF EXISTS "Workers insert own documents" ON public.employee_documents;
CREATE POLICY "Workers insert own documents"
ON public.employee_documents
FOR INSERT
TO authenticated
WITH CHECK (public.worker_owns_employee_document_scope(employee_id, company_id));

DROP POLICY IF EXISTS "Workers delete own documents" ON public.employee_documents;
CREATE POLICY "Workers delete own documents"
ON public.employee_documents
FOR DELETE
TO authenticated
USING (public.worker_owns_employee_document_scope(employee_id, company_id));

DROP POLICY IF EXISTS "Workers read own employee docs" ON storage.objects;
CREATE POLICY "Workers read own employee docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND public.worker_can_access_employee_doc_path(name)
);

DROP POLICY IF EXISTS "Workers upload own employee docs" ON storage.objects;
CREATE POLICY "Workers upload own employee docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND public.worker_can_access_employee_doc_path(name)
);

DROP POLICY IF EXISTS "Workers delete own employee docs" ON storage.objects;
CREATE POLICY "Workers delete own employee docs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND public.worker_can_access_employee_doc_path(name)
);

DROP POLICY IF EXISTS "Company users read own company employee docs" ON storage.objects;
CREATE POLICY "Company users read own company employee docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND public.company_user_can_access_employee_doc_path(name)
);

DROP POLICY IF EXISTS "Company users upload employee docs" ON storage.objects;
CREATE POLICY "Company users upload employee docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND public.company_user_can_access_employee_doc_path(name)
);

DROP POLICY IF EXISTS "Authenticated can upload employee docs" ON storage.objects;