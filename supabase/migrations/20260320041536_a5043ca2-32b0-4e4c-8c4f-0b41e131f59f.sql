
ALTER TABLE public.reconciliation_final_records 
  ADD COLUMN IF NOT EXISTS payroll_reference_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_vs_payroll_diff numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_calculation_source text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS shift_daily_rate_used numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shift_half_day_rate_used numeric DEFAULT NULL;
