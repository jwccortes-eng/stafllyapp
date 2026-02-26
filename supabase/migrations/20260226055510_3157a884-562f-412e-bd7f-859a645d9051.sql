-- Change default status for new pay periods from 'open' to 'closed'
ALTER TABLE public.pay_periods ALTER COLUMN status SET DEFAULT 'closed';