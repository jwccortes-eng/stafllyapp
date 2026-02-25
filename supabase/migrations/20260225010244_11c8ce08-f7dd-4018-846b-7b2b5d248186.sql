
-- Create a secure view for shifts that excludes wage/pay information
CREATE VIEW public.shifts_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  employee_id,
  period_id,
  import_id,
  shift_number,
  type,
  scheduled_shift_title,
  shift_start_date,
  shift_end_date,
  shift_hours,
  daily_total_hours,
  clock_in_time,
  clock_in_location,
  clock_in_device,
  clock_out_time,
  clock_out_location,
  clock_out_device,
  job_code,
  sub_job,
  sub_job_code,
  customer,
  ride,
  manager_notes,
  employee_notes,
  shift_hash,
  created_at
FROM public.shifts;
-- Excluded: hourly_rate_usd, daily_total_pay_usd
