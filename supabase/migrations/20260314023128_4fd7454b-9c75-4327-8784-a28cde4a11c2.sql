
-- FIX 1: payroll_adjustments - restrict to admin/manager/owner roles
-- Drop the overly permissive ALL policy
DROP POLICY IF EXISTS "Company users can manage payroll_adjustments" ON public.payroll_adjustments;

-- SELECT: admins/managers see all company records, employees see only their own
CREATE POLICY "Admins managers select payroll_adjustments"
ON public.payroll_adjustments FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = payroll_adjustments.company_id
        AND cu.role IN ('admin', 'owner', 'manager')
    )
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
);

-- INSERT/UPDATE/DELETE: only admin, owner, manager
CREATE POLICY "Admins managers insert payroll_adjustments"
ON public.payroll_adjustments FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = payroll_adjustments.company_id
        AND cu.role IN ('admin', 'owner', 'manager')
    )
  )
);

CREATE POLICY "Admins managers update payroll_adjustments"
ON public.payroll_adjustments FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = payroll_adjustments.company_id
        AND cu.role IN ('admin', 'owner', 'manager')
    )
  )
)
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = payroll_adjustments.company_id
        AND cu.role IN ('admin', 'owner', 'manager')
    )
  )
);

CREATE POLICY "Admins managers delete payroll_adjustments"
ON public.payroll_adjustments FOR DELETE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_global_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = payroll_adjustments.company_id
        AND cu.role IN ('admin', 'owner', 'manager')
    )
  )
);
