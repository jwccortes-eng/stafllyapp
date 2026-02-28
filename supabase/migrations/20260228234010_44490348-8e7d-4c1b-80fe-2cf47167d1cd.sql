-- Remove overly permissive manager access to W-9 tax data
DROP POLICY IF EXISTS "Managers can view w9" ON public.contractor_w9;