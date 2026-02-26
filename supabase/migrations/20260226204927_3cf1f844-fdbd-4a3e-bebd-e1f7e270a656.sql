
-- Add cancel_at_period_end to subscriptions
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- Create billing_events table for audit trail
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  type text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- Policies: only admins/owners can view billing events
CREATE POLICY "Admins can view company billing_events"
ON public.billing_events FOR SELECT
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owners can manage all billing_events"
ON public.billing_events FOR ALL
USING (is_global_owner(auth.uid()));

-- Service role can insert (from webhook edge function)
CREATE POLICY "Service can insert billing_events"
ON public.billing_events FOR INSERT
WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_billing_events_company ON public.billing_events(company_id, created_at DESC);
