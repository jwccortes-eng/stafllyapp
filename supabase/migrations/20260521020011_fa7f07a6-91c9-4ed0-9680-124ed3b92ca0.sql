
-- =====================================================================
-- Security Phase 1.5 — cross-tenant bare admin cleanup
-- =====================================================================

-- 1) employees: drop bare has_role(admin), scope to company
DROP POLICY IF EXISTS "Company users can manage employees" ON public.employees;

CREATE POLICY "Company admins can manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
)
WITH CHECK (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 1b) Hide full SSN/EIN column from broad-permission readers.
REVOKE SELECT (verification_ssn_ein) ON public.employees FROM authenticated;
REVOKE SELECT (verification_ssn_ein) ON public.employees FROM anon;

CREATE OR REPLACE FUNCTION public.admin_get_employees_with_fiscal(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  phone_number text,
  email text,
  connecteam_employee_id text,
  employer_identification text,
  verification_ssn_ein text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    is_global_owner(auth.uid())
    OR has_role(auth.uid(), 'developer'::app_role)
    OR user_is_company_admin(auth.uid(), p_company_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT e.id, e.first_name, e.last_name, e.phone_number, e.email,
         e.connecteam_employee_id, e.employer_identification,
         e.verification_ssn_ein
  FROM public.employees e
  WHERE e.company_id = p_company_id
    AND e.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_employees_with_fiscal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_employees_with_fiscal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_employees_with_fiscal(uuid) TO authenticated;

-- 2) module_permissions
DROP POLICY IF EXISTS "Admins can view permissions" ON public.module_permissions;

CREATE POLICY "Company admins can view co-member permissions"
ON public.module_permissions
FOR SELECT
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = module_permissions.user_id
      AND user_is_company_admin(auth.uid(), e.company_id)
  )
);

-- 3) dispatch_logs
DROP POLICY IF EXISTS "Company admins can view dispatch logs" ON public.dispatch_logs;
DROP POLICY IF EXISTS "Company admins can insert dispatch logs" ON public.dispatch_logs;
DROP POLICY IF EXISTS "Company admins can update dispatch logs" ON public.dispatch_logs;

CREATE POLICY "Company admins can view dispatch logs"
ON public.dispatch_logs
FOR SELECT TO authenticated
USING (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Company admins can insert dispatch logs"
ON public.dispatch_logs
FOR INSERT TO authenticated
WITH CHECK (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Company admins can update dispatch logs"
ON public.dispatch_logs
FOR UPDATE TO authenticated
USING (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
)
WITH CHECK (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 4) shift_assignment_admin_overrides
DROP POLICY IF EXISTS "Admins can view overrides in their company"  ON public.shift_assignment_admin_overrides;
DROP POLICY IF EXISTS "Admins can create overrides in their company" ON public.shift_assignment_admin_overrides;
DROP POLICY IF EXISTS "Admins can update overrides in their company" ON public.shift_assignment_admin_overrides;
DROP POLICY IF EXISTS "Admins can delete overrides in their company" ON public.shift_assignment_admin_overrides;

CREATE POLICY "Admins can view overrides in their company"
ON public.shift_assignment_admin_overrides
FOR SELECT TO authenticated
USING (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Admins can create overrides in their company"
ON public.shift_assignment_admin_overrides
FOR INSERT TO authenticated
WITH CHECK (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Admins can update overrides in their company"
ON public.shift_assignment_admin_overrides
FOR UPDATE TO authenticated
USING (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
)
WITH CHECK (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Admins can delete overrides in their company"
ON public.shift_assignment_admin_overrides
FOR DELETE TO authenticated
USING (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 5) closure_quality_log
DROP POLICY IF EXISTS "Admins can insert closure quality" ON public.closure_quality_log;

CREATE POLICY "Company admins can insert closure quality"
ON public.closure_quality_log
FOR INSERT TO authenticated
WITH CHECK (
  user_is_company_admin(auth.uid(), company_id)
  OR is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 6) employee_portal_modules
DROP POLICY IF EXISTS "Admins can manage employee portal modules" ON public.employee_portal_modules;

CREATE POLICY "Company admins can manage employee portal modules"
ON public.employee_portal_modules
FOR ALL TO authenticated
USING (
  is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
  OR user_is_company_admin(auth.uid(), company_id)
  OR has_company_role(auth.uid(), company_id, 'admin'::text)
)
WITH CHECK (
  is_global_owner(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
  OR user_is_company_admin(auth.uid(), company_id)
  OR has_company_role(auth.uid(), company_id, 'admin'::text)
);
