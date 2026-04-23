CREATE OR REPLACE FUNCTION public.list_unassigned_profiles()
RETURNS TABLE (user_id uuid, email text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.email, p.full_name
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p.user_id
  )
  ORDER BY COALESCE(NULLIF(p.full_name, ''), p.email) NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_unassigned_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unassigned_profiles() TO authenticated;