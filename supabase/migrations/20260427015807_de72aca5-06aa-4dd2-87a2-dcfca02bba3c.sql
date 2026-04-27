DROP FUNCTION IF EXISTS public.get_employee_for_activation(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_employee_for_activation(_employee_id uuid, _invite_token uuid)
RETURNS TABLE(
  first_name text,
  last_name text,
  company_id uuid,
  phone_number text,
  avatar_url text,
  email text,
  address text,
  address_line text,
  address_city text,
  address_state text,
  address_zip text,
  county text,
  approx_latitude numeric,
  approx_longitude numeric,
  address_structured jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM employee_invitations ei
    WHERE ei.invite_token = _invite_token
      AND ei.employee_id = _employee_id
      AND ei.status IN ('created', 'sent', 'opened')
      AND (ei.expires_at IS NULL OR ei.expires_at > now())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.first_name,
    e.last_name,
    e.company_id,
    e.phone_number,
    e.avatar_url,
    e.email,
    e.address,
    e.address_line,
    e.address_city,
    e.address_state,
    e.address_zip,
    e.county,
    e.approx_latitude,
    e.approx_longitude,
    e.address_structured
  FROM employees e
  WHERE e.id = _employee_id;
END;
$function$;