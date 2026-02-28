
-- Add gender column to employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gender text;

-- Update the employees_safe view to include gender
DROP VIEW IF EXISTS public.employees_safe;
CREATE VIEW public.employees_safe WITH (security_invoker = true) AS
SELECT 
  id, first_name, last_name, phone_number, email,
  connecteam_employee_id, start_date, end_date,
  employee_role, direct_manager, groups, tags,
  company_id, user_id, is_active, created_at, updated_at, gender
FROM public.employees;
