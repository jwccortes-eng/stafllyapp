-- 1. Update get_invitation_by_token to include has_newer flag
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
  employee_phone text,
  has_newer boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    e.last_name  AS employee_last_name,
    e.phone_number AS employee_phone,
    EXISTS (
      SELECT 1 FROM public.employee_invitations i2
      WHERE i2.employee_id = i.employee_id
        AND i2.company_id  = i.company_id
        AND i2.id <> i.id
        AND i2.created_at > i.created_at
        AND i2.status NOT IN ('revoked','expired','superseded','accepted','failed','bounced','dlq')
    ) AS has_newer
  FROM public.employee_invitations i
  LEFT JOIN public.companies c ON c.id = i.company_id
  LEFT JOIN public.employees e ON e.id = i.employee_id
  WHERE i.invite_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;

-- 2. Supersede prior active invitations for the same employee+company
CREATE OR REPLACE FUNCTION public.supersede_employee_invitations(
  _employee_id uuid,
  _company_id uuid,
  _keep_invite_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.employee_invitations
     SET status = 'superseded'
   WHERE employee_id = _employee_id
     AND company_id  = _company_id
     AND id <> COALESCE(_keep_invite_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND status IN ('created','queued','processing','sent','provider_accepted','delivered','opened','resent');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.supersede_employee_invitations(uuid, uuid, uuid) TO authenticated;
