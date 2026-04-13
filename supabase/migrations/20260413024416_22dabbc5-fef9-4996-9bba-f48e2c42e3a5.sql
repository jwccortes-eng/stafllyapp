
-- Security-definer function to fetch employee data for activation page
-- Only returns minimal fields needed for the activation wizard
-- Validates that a valid, non-expired invitation exists for this employee
CREATE OR REPLACE FUNCTION public.get_employee_for_activation(_employee_id uuid, _invite_token uuid)
RETURNS TABLE(
  first_name text,
  last_name text,
  company_id uuid,
  phone_number text,
  avatar_url text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verify that a valid invitation exists with this token for this employee
  IF NOT EXISTS (
    SELECT 1 FROM employee_invitations ei
    WHERE ei.invite_token = _invite_token
      AND ei.employee_id = _employee_id
      AND ei.status IN ('created', 'sent', 'opened')
      AND (ei.expires_at IS NULL OR ei.expires_at > now())
  ) THEN
    RETURN; -- Return empty result set
  END IF;

  RETURN QUERY
  SELECT e.first_name, e.last_name, e.company_id, e.phone_number, e.avatar_url, e.email
  FROM employees e
  WHERE e.id = _employee_id;
END;
$$;
