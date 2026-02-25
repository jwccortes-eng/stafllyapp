
-- 1. auth_rate_limits: Add RLS policies (only service_role accesses this table via edge function)
CREATE POLICY "Service role only - no anon access"
ON public.auth_rate_limits
FOR ALL
USING (false);

-- 2. employees_safe view: Recreate with security_invoker so RLS from employees table applies
DROP VIEW IF EXISTS public.employees_safe;
CREATE VIEW public.employees_safe WITH (security_invoker = true) AS
SELECT 
  id, company_id, first_name, last_name, phone_number, email,
  employee_role, direct_manager, groups, tags,
  connecteam_employee_id, start_date, end_date,
  is_active, user_id, created_at, updated_at
FROM public.employees;

-- 3. shifts_safe view: Recreate with security_invoker so RLS from shifts table applies
DROP VIEW IF EXISTS public.shifts_safe;
CREATE VIEW public.shifts_safe WITH (security_invoker = true) AS
SELECT
  id, employee_id, period_id, import_id,
  type, shift_number, scheduled_shift_title,
  shift_start_date, shift_end_date, shift_hours,
  clock_in_time, clock_in_location, clock_in_device,
  clock_out_time, clock_out_location, clock_out_device,
  daily_total_hours,
  job_code, sub_job, sub_job_code,
  customer, ride,
  manager_notes, employee_notes, shift_hash,
  created_at
FROM public.shifts;
