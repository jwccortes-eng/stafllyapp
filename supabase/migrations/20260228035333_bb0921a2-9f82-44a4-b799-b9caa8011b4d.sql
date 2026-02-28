
-- Drop the existing view first
DROP VIEW IF EXISTS public.employees_safe;

-- Remove SSN and verification_ssn_ein columns from employees table
ALTER TABLE public.employees DROP COLUMN IF EXISTS social_security_number;
ALTER TABLE public.employees DROP COLUMN IF EXISTS verification_ssn_ein;

-- Recreate employees_safe view without the dropped columns
CREATE VIEW public.employees_safe WITH (security_invoker = true) AS
SELECT 
  id, first_name, last_name, phone_number, email,
  connecteam_employee_id, start_date, end_date,
  employee_role, direct_manager, groups, tags,
  company_id, user_id, is_active, created_at, updated_at
FROM public.employees;
