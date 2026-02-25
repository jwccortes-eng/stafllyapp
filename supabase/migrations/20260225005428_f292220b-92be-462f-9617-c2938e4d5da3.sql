
-- Create a secure view that excludes sensitive PII fields
CREATE VIEW public.employees_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  first_name,
  last_name,
  email,
  phone_number,
  is_active,
  user_id,
  employee_role,
  groups,
  tags,
  start_date,
  end_date,
  direct_manager,
  connecteam_employee_id,
  created_at,
  updated_at
FROM public.employees;

-- Drop the old employee SELECT policy
DROP POLICY IF EXISTS "Employees can view own record" ON public.employees;

-- Recreate: employees can only access own record (same as before, kept restrictive)
CREATE POLICY "Employees can view own record"
ON public.employees
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
