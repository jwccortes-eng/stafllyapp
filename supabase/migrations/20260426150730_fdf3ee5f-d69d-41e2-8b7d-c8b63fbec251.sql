ALTER TABLE public.shifts
ADD COLUMN IF NOT EXISTS pay_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shifts.pay_override IS
'UI intent flag: true when admin explicitly enabled a per-shift pay override. Currently NOT read by payroll engine — captured for future use to distinguish real override from inherited default. See Phase 2 decision #1.';