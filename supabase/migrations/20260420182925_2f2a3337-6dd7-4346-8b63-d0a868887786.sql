-- Drop public-readable policy on employee_invitations (exposed all tokens)
DROP POLICY IF EXISTS "Anyone can read invitation by token" ON public.employee_invitations;

-- RPC: securely fetch a single invitation by token (anon-callable, token acts as bearer secret)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token uuid)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  status text,
  expires_at timestamptz,
  company_id uuid,
  opened_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, employee_id, status, expires_at, company_id, opened_at
  FROM public.employee_invitations
  WHERE invite_token = _token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;

-- RPC: mark an invitation status transition by token (opened/expired/accepted)
CREATE OR REPLACE FUNCTION public.update_invitation_status_by_token(
  _token uuid,
  _new_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed text[] := ARRAY['opened','expired','accepted'];
  _row public.employee_invitations%ROWTYPE;
BEGIN
  IF _new_status IS NULL OR NOT (_new_status = ANY(_allowed)) THEN
    RETURN false;
  END IF;

  SELECT * INTO _row FROM public.employee_invitations WHERE invite_token = _token LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Already accepted invitations cannot be reverted
  IF _row.status = 'accepted' AND _new_status <> 'accepted' THEN
    RETURN false;
  END IF;

  IF _new_status = 'opened' THEN
    UPDATE public.employee_invitations
       SET status = 'opened',
           opened_at = COALESCE(opened_at, now())
     WHERE id = _row.id AND status NOT IN ('accepted','expired');
  ELSIF _new_status = 'expired' THEN
    UPDATE public.employee_invitations
       SET status = 'expired'
     WHERE id = _row.id AND status <> 'accepted';
  ELSIF _new_status = 'accepted' THEN
    UPDATE public.employee_invitations
       SET status = 'accepted',
           accepted_at = COALESCE(accepted_at, now())
     WHERE id = _row.id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_invitation_status_by_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invitation_status_by_token(uuid, text) TO anon, authenticated;