CREATE OR REPLACE FUNCTION public.emergency_worker_phone_lookup(
  _company_id uuid,
  _phone text
)
RETURNS TABLE (
  employee_id uuid,
  company_id uuid,
  company_name text,
  same_company boolean,
  first_name text,
  last_name text,
  phone_number text,
  is_active boolean,
  portal_access_enabled boolean,
  has_portal_user boolean,
  worker_type text,
  identity_status text,
  merged_into_employee_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.company_id,
    c.name,
    e.company_id = _company_id,
    CASE WHEN e.company_id = _company_id THEN e.first_name ELSE e.first_name END,
    CASE WHEN e.company_id = _company_id THEN e.last_name ELSE left(coalesce(e.last_name, ''), 1) END,
    CASE WHEN e.company_id = _company_id THEN e.phone_number ELSE NULL END,
    e.is_active,
    coalesce(e.portal_access_enabled, false),
    e.user_id IS NOT NULL,
    e.worker_type,
    e.identity_status,
    e.merged_into_employee_id
  FROM public.employees e
  LEFT JOIN public.companies c ON c.id = e.company_id
  WHERE public.can_manage_shift_company(_company_id)
    AND public.normalize_auth_phone(_phone) IS NOT NULL
    AND length(public.normalize_auth_phone(_phone)) >= 7
    AND public.normalize_auth_phone(e.phone_number) = public.normalize_auth_phone(_phone)
  ORDER BY (e.company_id = _company_id) DESC, e.is_active DESC, e.first_name
  LIMIT 25;
$$;

REVOKE ALL ON FUNCTION public.emergency_worker_phone_lookup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_worker_phone_lookup(uuid, text) TO authenticated;