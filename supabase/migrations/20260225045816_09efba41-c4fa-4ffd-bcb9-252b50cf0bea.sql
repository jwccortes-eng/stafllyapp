
-- Re-add manager SELECT on employees (company-scoped) for joins to work
-- Managers need table-level SELECT for PostgREST joins (movements->employees, etc.)
CREATE POLICY "Managers can view employees" ON public.employees FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'employees', 'view'));

-- Fix SECURITY DEFINER view warning: recreate with security_invoker
DROP VIEW IF EXISTS employees_safe;

CREATE VIEW employees_safe WITH (security_invoker = true) AS
SELECT 
  id, first_name, last_name, phone_number, email, employee_role,
  is_active, start_date, end_date, groups, tags, direct_manager,
  connecteam_employee_id, user_id, created_at, updated_at, company_id
FROM employees;
