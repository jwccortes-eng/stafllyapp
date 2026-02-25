-- Add published_at to pay_periods to control employee visibility
ALTER TABLE public.pay_periods ADD COLUMN published_at timestamp with time zone DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.pay_periods.published_at IS 'When set, employees can see this period data. NULL = not published yet.';