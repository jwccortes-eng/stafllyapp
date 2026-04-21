-- =========================================================
-- 1) COMPANIES: remove broad anon access; route anon to view
-- =========================================================

-- Drop the overly permissive anon policy
DROP POLICY IF EXISTS "Anon can view active company branding" ON public.companies;

-- Switch companies_public view to SECURITY DEFINER so anonymous users
-- can read the safe branding columns without needing RLS on companies.
-- The view only exposes safe columns (name, slug, logo_url, brand_color,
-- application_*, is_active) — invite_code and billing fields are excluded.
ALTER VIEW public.companies_public SET (security_invoker = off);

-- Ensure anon and authenticated can read the safe view
GRANT SELECT ON public.companies_public TO anon, authenticated;

-- =========================================================
-- 2) NORMALIZED IMPORT ROWS: restrict to payroll/admin roles
-- =========================================================

DROP POLICY IF EXISTS "rls_norm_clock" ON public.normalized_clock_rows;
DROP POLICY IF EXISTS "rls_norm_payroll" ON public.normalized_payroll_rows;
DROP POLICY IF EXISTS "rls_norm_schedule" ON public.normalized_schedule_rows;

-- Helper expression: user must be platform owner, company owner/admin, or have payroll.manage permission
-- normalized_clock_rows
CREATE POLICY "norm_clock_admin_select" ON public.normalized_clock_rows
FOR SELECT TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
);

CREATE POLICY "norm_clock_admin_write" ON public.normalized_clock_rows
FOR ALL TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
);

-- normalized_payroll_rows
CREATE POLICY "norm_payroll_admin_select" ON public.normalized_payroll_rows
FOR SELECT TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
);

CREATE POLICY "norm_payroll_admin_write" ON public.normalized_payroll_rows
FOR ALL TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
);

-- normalized_schedule_rows
CREATE POLICY "norm_schedule_admin_select" ON public.normalized_schedule_rows
FOR SELECT TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
);

CREATE POLICY "norm_schedule_admin_write" ON public.normalized_schedule_rows
FOR ALL TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'payroll.manage')
);

-- =========================================================
-- 3) FINANCIAL RECORDS / LEDGER: restrict to admin/owner roles
-- =========================================================

DROP POLICY IF EXISTS "financial_records_select" ON public.employee_financial_records;
DROP POLICY IF EXISTS "financial_records_update" ON public.employee_financial_records;
DROP POLICY IF EXISTS "financial_ledger_select" ON public.employee_financial_ledger;
DROP POLICY IF EXISTS "financial_attachments_select" ON public.employee_financial_attachments;

-- employee_financial_records: SELECT and UPDATE limited to admins / advance managers
CREATE POLICY "financial_records_select" ON public.employee_financial_records
FOR SELECT TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
);

CREATE POLICY "financial_records_update" ON public.employee_financial_records
FOR UPDATE TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
)
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
);

-- employee_financial_ledger: SELECT only to admins
CREATE POLICY "financial_ledger_select" ON public.employee_financial_ledger
FOR SELECT TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
);

-- employee_financial_attachments: SELECT only to admins
CREATE POLICY "financial_attachments_select" ON public.employee_financial_attachments
FOR SELECT TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR public.user_is_company_admin(auth.uid(), company_id)
  OR public.has_action_permission(auth.uid(), company_id, 'advances_loans.manage')
);