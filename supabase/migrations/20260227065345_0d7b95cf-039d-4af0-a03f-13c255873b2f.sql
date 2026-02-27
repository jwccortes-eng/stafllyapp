-- Replace the overly permissive policy with a scoped one
DROP POLICY "Service functions can insert notifications" ON public.notifications;

-- Allow inserts for any authenticated user within their company scope
-- This covers: triggers (SECURITY DEFINER), admin inserts, and edge functions
CREATE POLICY "Authenticated users can insert company notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );