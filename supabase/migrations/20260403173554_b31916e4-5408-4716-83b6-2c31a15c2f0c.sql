-- Drop the overly permissive admin policy that lacks company_id scoping
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;