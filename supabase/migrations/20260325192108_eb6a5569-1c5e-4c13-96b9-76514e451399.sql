ALTER TABLE public.reconciliation_employee_rows 
  ADD COLUMN IF NOT EXISTS truth_hours numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS truth_paid_hours numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS truth_hourly_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS truth_hourly_rate_derived numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closure_hours_used numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closure_source text DEFAULT NULL;