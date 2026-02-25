
-- Recreate employees_safe view WITH company_id and auth-based WHERE clause
-- This view excludes sensitive PII (SSN, access_pin, driver_licence, etc.)
-- and enforces company-level access control

DROP VIEW IF EXISTS employees_safe;

CREATE VIEW employees_safe AS
SELECT 
  id, first_name, last_name, phone_number, email, employee_role,
  is_active, start_date, end_date, groups, tags, direct_manager,
  connecteam_employee_id, user_id, created_at, updated_at, company_id
FROM employees
WHERE 
  is_global_owner(auth.uid())
  OR company_id IN (SELECT user_company_ids(auth.uid()))
  OR user_id = auth.uid();

-- Remove manager SELECT on employees table (they must use employees_safe)
DROP POLICY IF EXISTS "Managers can view employees" ON public.employees;
