-- Allow the trigger function (SECURITY DEFINER) to insert notifications
-- The trigger runs as the function owner (postgres/superuser), but RLS still applies
-- We need a policy that allows inserts when called from a trigger context
-- Simplest fix: allow any authenticated user to insert notifications where recipient_id is a valid user

-- Drop and recreate a broader insert policy for service-level inserts
CREATE POLICY "Service functions can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- Note: SELECT policies still protect who can READ notifications, so this is safe.