REVOKE ALL ON FUNCTION public.user_identity_employee_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_identity_employee_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_identity_employee_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_identity_employee_ids(uuid) TO service_role;