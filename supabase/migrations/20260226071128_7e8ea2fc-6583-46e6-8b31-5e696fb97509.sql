-- Allow owners and admins to view auth rate limits for monitoring lockouts
CREATE POLICY "Owners can view rate limits"
ON public.auth_rate_limits FOR SELECT
USING (is_global_owner(auth.uid()));

CREATE POLICY "Admins can view rate limits"
ON public.auth_rate_limits FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));