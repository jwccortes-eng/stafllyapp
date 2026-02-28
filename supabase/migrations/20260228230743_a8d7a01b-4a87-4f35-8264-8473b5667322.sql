-- Remove employee access to subscription billing details (Stripe IDs, payment status, etc.)
DROP POLICY IF EXISTS "Employees can view subscription status" ON public.subscriptions;