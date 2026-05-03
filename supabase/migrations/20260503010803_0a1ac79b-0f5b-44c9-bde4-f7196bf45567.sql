-- FIX 1: Financial records INSERT WITH CHECK (admin/owner/advances_loans.manage only)
DROP POLICY IF EXISTS financial_records_insert ON public.employee_financial_records;
CREATE POLICY financial_records_insert ON public.employee_financial_records
  FOR INSERT TO authenticated
  WITH CHECK (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
  );

DROP POLICY IF EXISTS financial_ledger_insert ON public.employee_financial_ledger;
CREATE POLICY financial_ledger_insert ON public.employee_financial_ledger
  FOR INSERT TO authenticated
  WITH CHECK (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
  );

DROP POLICY IF EXISTS financial_attachments_insert ON public.employee_financial_attachments;
CREATE POLICY financial_attachments_insert ON public.employee_financial_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
  );

DROP POLICY IF EXISTS financial_policies_insert ON public.company_financial_policies;
CREATE POLICY financial_policies_insert ON public.company_financial_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
  );

DROP POLICY IF EXISTS financial_policies_update ON public.company_financial_policies;
CREATE POLICY financial_policies_update ON public.company_financial_policies
  FOR UPDATE TO authenticated
  USING (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
  )
  WITH CHECK (
    is_global_owner(auth.uid())
    OR user_is_company_admin(auth.uid(), company_id)
    OR has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
  );

-- FIX 2: Restrict anon uploads to employee-documents bucket to valid onboarding invites only
CREATE OR REPLACE FUNCTION public.anon_can_upload_onboarding_doc(_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_invitations ei
    WHERE ei.company_id::text = (storage.foldername(_path))[1]
      AND ei.employee_id::text = (storage.foldername(_path))[2]
      AND (storage.foldername(_path))[3] = 'onboarding'
      AND ei.status IN ('pending','sent','accepted')
      AND (ei.expires_at IS NULL OR ei.expires_at > now())
  )
$$;

DROP POLICY IF EXISTS "Anon can upload employee docs during onboarding" ON storage.objects;
CREATE POLICY "Anon can upload employee docs during onboarding"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND public.anon_can_upload_onboarding_doc(name)
  );