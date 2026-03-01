
-- Fix security definer on the new views
ALTER VIEW public.employees_safe SET (security_invoker = on);
ALTER VIEW public.profiles_safe SET (security_invoker = on);
