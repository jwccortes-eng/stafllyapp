-- storage.objects (bucket employee-documents)
DROP POLICY IF EXISTS "Company users read own company employee docs" ON storage.objects;
DROP POLICY IF EXISTS "Company users upload employee docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete employee docs" ON storage.objects;

CREATE POLICY "Admins read company employee docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (
    is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE (
        e.id::text = (storage.foldername(storage.objects.name))[1]
        OR (
          e.company_id::text = (storage.foldername(storage.objects.name))[1]
          AND e.id::text = (storage.foldername(storage.objects.name))[2]
        )
      )
      AND (
        is_company_owner(auth.uid(), e.company_id)
        OR user_is_company_admin(auth.uid(), e.company_id)
      )
    )
  )
);

CREATE POLICY "Admins upload company employee docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (
    is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE (
        e.id::text = (storage.foldername(name))[1]
        OR (
          e.company_id::text = (storage.foldername(name))[1]
          AND e.id::text = (storage.foldername(name))[2]
        )
      )
      AND (
        is_company_owner(auth.uid(), e.company_id)
        OR user_is_company_admin(auth.uid(), e.company_id)
      )
    )
  )
);

CREATE POLICY "Admins delete company employee docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (
    is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE (
        e.id::text = (storage.foldername(storage.objects.name))[1]
        OR (
          e.company_id::text = (storage.foldername(storage.objects.name))[1]
          AND e.id::text = (storage.foldername(storage.objects.name))[2]
        )
      )
      AND (
        is_company_owner(auth.uid(), e.company_id)
        OR user_is_company_admin(auth.uid(), e.company_id)
      )
    )
  )
);

-- public.employee_documents
DROP POLICY IF EXISTS "Admins can manage employee_documents" ON public.employee_documents;
DROP POLICY IF EXISTS "Managers with permission can manage employee_documents" ON public.employee_documents;

CREATE POLICY "Admins manage employee_documents in their company"
ON public.employee_documents FOR ALL TO authenticated
USING (
  is_global_owner(auth.uid())
  OR is_company_owner(auth.uid(), company_id)
  OR user_is_company_admin(auth.uid(), company_id)
)
WITH CHECK (
  is_global_owner(auth.uid())
  OR is_company_owner(auth.uid(), company_id)
  OR user_is_company_admin(auth.uid(), company_id)
);