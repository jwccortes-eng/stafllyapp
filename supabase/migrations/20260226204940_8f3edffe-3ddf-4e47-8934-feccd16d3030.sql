
-- Fix: restrict billing_events insert to authenticated users in the company (webhook uses service_role which bypasses RLS)
DROP POLICY IF EXISTS "Service can insert billing_events" ON public.billing_events;

-- Replace with a policy that allows admins to insert
CREATE POLICY "Admins can insert billing_events"
ON public.billing_events FOR INSERT
WITH CHECK (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_role(auth.uid(), 'admin'::app_role)
);
