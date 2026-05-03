
-- ============================================================================
-- Launch Privacy Lockdown (minimal). Idempotent.
-- ============================================================================

-- 1) job_applications: restrict SELECT to company admins/owners
DROP POLICY IF EXISTS "Company members can view company applications" ON public.job_applications;
CREATE POLICY "Admins can view company applications"
ON public.job_applications
FOR SELECT
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
);

-- Update policy already restricted to members; tighten it to admins too
DROP POLICY IF EXISTS "Company members can update applications" ON public.job_applications;
CREATE POLICY "Admins can update company applications"
ON public.job_applications
FOR UPDATE
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
);

-- 2) contractor_w9: scope admin access to the same company
DROP POLICY IF EXISTS "Admins can manage company w9" ON public.contractor_w9;
CREATE POLICY "Company admins can manage w9"
ON public.contractor_w9
FOR ALL
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
);

-- 3) reconciliation_batches & rows: restrict to company admins/owners
DROP POLICY IF EXISTS "Users can manage reconciliation_batches for their companies" ON public.reconciliation_batches;
CREATE POLICY "Company admins manage reconciliation_batches"
ON public.reconciliation_batches
FOR ALL
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Users can manage reconciliation_employee_rows via batch" ON public.reconciliation_employee_rows;
CREATE POLICY "Company admins manage reconciliation_employee_rows"
ON public.reconciliation_employee_rows
FOR ALL
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.reconciliation_batches b
    WHERE b.id = reconciliation_employee_rows.batch_id
      AND public.user_is_company_admin(auth.uid(), b.company_id)
  )
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.reconciliation_batches b
    WHERE b.id = reconciliation_employee_rows.batch_id
      AND public.user_is_company_admin(auth.uid(), b.company_id)
  )
);

-- 4) historical_payroll_entries: restrict SELECT to admins/owners (write policies untouched)
DROP POLICY IF EXISTS "Managers can view historical payroll entries" ON public.historical_payroll_entries;
CREATE POLICY "Company admins view historical payroll entries"
ON public.historical_payroll_entries
FOR SELECT
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
);

-- 5) billing_clients: restrict SELECT to admins/owners
DROP POLICY IF EXISTS "billing_clients_select_company_members" ON public.billing_clients;
CREATE POLICY "billing_clients_select_admins"
ON public.billing_clients
FOR SELECT
TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
);

-- 6) worker_profiles: remove broad public-readable policy
DROP POLICY IF EXISTS "Public profiles readable" ON public.worker_profiles;
-- Keep "Owner can manage own profile" and "Admins can read all profiles" (global owner only)

-- 7) profiles: remove broad admin/manager cross-member SELECT (exposed switch_pin)
DROP POLICY IF EXISTS "Admins and managers can view co-member profiles" ON public.profiles;
-- Self-SELECT and global owner SELECT remain in place

-- 8) Storage: kiosk-photos SELECT must be company-scoped
DROP POLICY IF EXISTS "Company admins can view kiosk photos" ON storage.objects;
CREATE POLICY "Company admins can view kiosk photos (scoped)"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'kiosk-photos'
  AND (
    public.is_global_owner(auth.uid())
    OR public.user_is_company_admin(auth.uid(), public.try_path_uuid(name, 1))
  )
);
