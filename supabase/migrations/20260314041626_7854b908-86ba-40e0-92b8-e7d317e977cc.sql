
-- =============================================
-- FIX 1: payroll_adjustments - restrict to admin/manager only
-- =============================================
DROP POLICY IF EXISTS "Company users can manage payroll_adjustments" ON public.payroll_adjustments;

-- Admins/owners can manage all payroll adjustments in their company
CREATE POLICY "Admins can manage payroll_adjustments"
ON public.payroll_adjustments
FOR ALL
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin')
);

-- Managers with payroll module permission can manage
CREATE POLICY "Managers with permission can manage payroll_adjustments"
ON public.payroll_adjustments
FOR ALL
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_module_permission(auth.uid(), 'payroll', 'edit')
)
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_module_permission(auth.uid(), 'payroll', 'edit')
);

-- Employees can only view their own
CREATE POLICY "Employees view own payroll_adjustments"
ON public.payroll_adjustments
FOR SELECT
TO authenticated
USING (
  employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
);

-- =============================================
-- FIX 2: employee_documents - restrict to admin/manager, employees own only
-- =============================================
DROP POLICY IF EXISTS "Company admins manage employee documents" ON public.employee_documents;

CREATE POLICY "Admins can manage employee_documents"
ON public.employee_documents
FOR ALL
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Managers with permission can manage employee_documents"
ON public.employee_documents
FOR ALL
TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_module_permission(auth.uid(), 'employees', 'edit')
)
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_module_permission(auth.uid(), 'employees', 'edit')
);

-- =============================================
-- FIX 3: shift_chat_messages - verify sender owns employee record
-- =============================================
DROP POLICY IF EXISTS "Employees can send shift chat messages if assigned" ON public.shift_chat_messages;

CREATE POLICY "Employees can send shift chat messages if assigned"
ON public.shift_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM shift_assignments sa
    WHERE sa.shift_id = shift_chat_messages.shift_id
      AND sa.employee_id = shift_chat_messages.sender_employee_id
      AND sa.status NOT IN ('rejected', 'removed')
  )
);

-- =============================================
-- FIX 4: shift_reviews - fix tautology in anon insert policy
-- =============================================
DROP POLICY IF EXISTS "Anon can insert employee reviews" ON public.shift_reviews;

CREATE POLICY "Anon can insert employee reviews"
ON public.shift_reviews
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM scheduled_shifts ss
    WHERE ss.id = shift_reviews.shift_id
      AND ss.company_id = shift_reviews.company_id
  )
);

-- =============================================
-- FIX 5: notifications - remove overly broad insert policy
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can insert company notifications" ON public.notifications;
