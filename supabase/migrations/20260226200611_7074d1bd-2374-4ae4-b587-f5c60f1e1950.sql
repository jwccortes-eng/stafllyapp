
-- Add paid_at column to pay_periods
ALTER TABLE public.pay_periods
ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone DEFAULT NULL;

-- Add paid_by column to track who marked it as paid
ALTER TABLE public.pay_periods
ADD COLUMN IF NOT EXISTS paid_by uuid DEFAULT NULL;
