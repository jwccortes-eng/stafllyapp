
ALTER TABLE public.compensation_profiles
  ADD COLUMN IF NOT EXISTS overtime_hourly_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kitchen_hourly_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bonus_transport_hourly_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS double_pay_hourly_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inferred_hourly_rate numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inferred_hourly_source text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inferred_hourly_confidence text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hourly_rate_last_verified_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hourly_rate_override_manual boolean DEFAULT false;
