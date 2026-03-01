-- Drop the old restrictive check and add one that covers the full pay period lifecycle
ALTER TABLE public.pay_periods DROP CONSTRAINT pay_periods_status_check;

ALTER TABLE public.pay_periods ADD CONSTRAINT pay_periods_status_check
  CHECK (status = ANY (ARRAY['open', 'closed', 'published', 'paid']));