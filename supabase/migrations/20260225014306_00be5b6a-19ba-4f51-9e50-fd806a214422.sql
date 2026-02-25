
DROP VIEW IF EXISTS public.employees_safe;

CREATE VIEW public.employees_safe AS
SELECT
  id,
  connecteam_employee_id,
  direct_manager,
  end_date,
  first_name,
  last_name,
  email,
  phone_number,
  employee_role,
  groups,
  tags,
  start_date,
  updated_at,
  created_at,
  user_id,
  is_active
FROM public.employees;
