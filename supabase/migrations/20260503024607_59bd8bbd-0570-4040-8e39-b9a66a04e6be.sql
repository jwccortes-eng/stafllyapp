-- Drop permissive PII-leaking policy
DROP POLICY IF EXISTS profiles_select_safe_co_members ON public.profiles;

-- Recreate profiles_safe as SECURITY DEFINER view (security_invoker=false)
-- Only exposes user_id, full_name, avatar_url
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe
WITH (security_invoker = false) AS
SELECT user_id, full_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.profiles_safe TO authenticated, anon;