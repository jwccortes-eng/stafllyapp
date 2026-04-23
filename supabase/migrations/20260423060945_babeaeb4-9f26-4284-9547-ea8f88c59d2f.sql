-- Eligible users for a target company: returns all profiles NOT already
-- a member of that company, plus their existing memberships (with role +
-- company name) so the picker can render visual context like
-- "Admin in Quality Staff" or "Sin empresa". SECURITY DEFINER bypasses
-- RLS on company_users which would otherwise hide cross-tenant memberships.
CREATE OR REPLACE FUNCTION public.get_eligible_users_for_company(_company_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  memberships jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller_check AS (
    -- Only allow callers who are admins of the target company OR global admins/owners/devs
    SELECT 1
    WHERE
      public.user_is_company_admin(auth.uid(), _company_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ),
  member_ids AS (
    SELECT cu.user_id
    FROM public.company_users cu
    WHERE cu.company_id = _company_id
  )
  SELECT
    p.user_id,
    p.email,
    p.full_name,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'company_id', cu2.company_id,
            'company_name', c.name,
            'role', cu2.role
          )
          ORDER BY c.name
        )
        FROM public.company_users cu2
        JOIN public.companies c ON c.id = cu2.company_id
        WHERE cu2.user_id = p.user_id
      ),
      '[]'::jsonb
    ) AS memberships
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM caller_check)
    AND NOT EXISTS (SELECT 1 FROM member_ids m WHERE m.user_id = p.user_id)
  ORDER BY COALESCE(NULLIF(p.full_name, ''), p.email) NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_eligible_users_for_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_eligible_users_for_company(uuid) TO authenticated;