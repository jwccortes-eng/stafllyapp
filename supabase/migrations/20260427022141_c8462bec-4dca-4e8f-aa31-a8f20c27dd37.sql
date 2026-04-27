DROP FUNCTION IF EXISTS public.get_invitation_by_token(uuid);

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token uuid)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  company_id uuid,
  company_name text,
  company_slug text,
  invite_token uuid,
  status text,
  expires_at timestamptz,
  opened_at timestamptz,
  employee_first_name text,
  employee_last_name text,
  employee_phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.employee_id,
    i.company_id,
    c.name AS company_name,
    c.slug AS company_slug,
    i.invite_token,
    i.status,
    i.expires_at,
    i.opened_at,
    e.first_name AS employee_first_name,
    e.last_name AS employee_last_name,
    e.phone_number AS employee_phone
  FROM public.employee_invitations i
  JOIN public.employees e ON e.id = i.employee_id
  LEFT JOIN public.companies c ON c.id = i.company_id
  WHERE i.invite_token = _token
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;