
-- FIX 2: employee_documents - restrict ALL policy to admin/owner roles only
DROP POLICY IF EXISTS "Company admins manage employee documents" ON public.employee_documents;

CREATE POLICY "Admins manage employee documents"
ON public.employee_documents FOR ALL TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = employee_documents.company_id
        AND cu.role IN ('admin', 'owner')
    )
  )
)
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = employee_documents.company_id
        AND cu.role IN ('admin', 'owner')
    )
  )
);
