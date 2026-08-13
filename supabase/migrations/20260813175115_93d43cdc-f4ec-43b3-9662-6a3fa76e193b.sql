CREATE OR REPLACE FUNCTION public.emergency_worker_add_company_membership(
  _company_id uuid,
  _source_employee_id uuid,
  _note text DEFAULT NULL
)
RETURNS TABLE (employee_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.employees%ROWTYPE;
  existing_id uuid;
  new_id uuid;
BEGIN
  IF NOT public.can_manage_shift_company(_company_id) THEN
    RAISE EXCEPTION 'No autorizado para gestionar esta empresa';
  END IF;

  SELECT * INTO src FROM public.employees WHERE id = _source_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona de origen no encontrada';
  END IF;
  IF src.merged_into_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'La persona de origen fue fusionada en otro registro';
  END IF;

  SELECT e.id INTO existing_id
  FROM public.employees e
  WHERE e.company_id = _company_id
    AND public.normalize_auth_phone(e.phone_number) IS NOT NULL
    AND public.normalize_auth_phone(e.phone_number) = public.normalize_auth_phone(src.phone_number)
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_id, false;
    RETURN;
  END IF;

  INSERT INTO public.employees (
    company_id, first_name, last_name, phone_number, email,
    user_id, portal_access_enabled, is_active,
    worker_type, identity_status, requires_identity_resolution,
    identity_source, resolved_person_id, identity_notes, added_via
  ) VALUES (
    _company_id, src.first_name, src.last_name, src.phone_number, src.email,
    src.user_id, coalesce(src.portal_access_enabled, false) AND src.user_id IS NOT NULL, true,
    coalesce(src.worker_type, 'real_employee'), coalesce(src.identity_status, 'verified'), false,
    'ecosystem_membership', coalesce(src.resolved_person_id, src.id),
    concat_ws(' · ',
      concat('[', now()::text, '] membership from employee ', src.id::text, ' (company ', src.company_id::text, ')'),
      nullif(_note, '')),
    'ecosystem_membership'
  )
  RETURNING id INTO new_id;

  RETURN QUERY SELECT new_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.emergency_worker_add_company_membership(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emergency_worker_add_company_membership(uuid, uuid, text) TO authenticated;