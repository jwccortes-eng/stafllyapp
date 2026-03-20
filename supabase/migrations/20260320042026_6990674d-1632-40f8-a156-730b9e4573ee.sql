ALTER TABLE public.reconciliation_final_records
  ADD COLUMN IF NOT EXISTS shift_full_day_count numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_half_day_count numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_calculated_total numeric DEFAULT 0;