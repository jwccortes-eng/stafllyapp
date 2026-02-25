
-- Enable RLS on the employees_safe view
ALTER VIEW public.employees_safe SET (security_invoker = on);

-- Note: Views with security_invoker=on inherit the RLS policies 
-- of the underlying tables. The employees table already has proper
-- RESTRICTIVE RLS policies. No additional policies needed on the view itself.
