
-- ============================================================
-- Phase B: Secure RPCs around employees.access_pin
-- ============================================================

-- 1) employee_has_access_pin
CREATE OR REPLACE FUNCTION public.employee_has_access_pin(_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_pin text;
BEGIN
  SELECT company_id, user_id, access_pin
    INTO v_company_id, v_user_id, v_pin
  FROM public.employees
  WHERE id = _employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_user_id = auth.uid()
     OR public.is_global_owner(auth.uid())
     OR public.has_company_role(auth.uid(), v_company_id, 'admin')
  THEN
    RETURN v_pin IS NOT NULL AND length(v_pin) > 0;
  END IF;

  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.employee_has_access_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_has_access_pin(uuid) TO authenticated;


-- 2) reset_employee_access_pin
CREATE OR REPLACE FUNCTION public.reset_employee_access_pin(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_new_pin text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.employees WHERE id = _employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_global_owner(auth.uid())
       OR public.has_company_role(auth.uid(), v_company_id, 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_new_pin := lpad((floor(random() * 10000))::int::text, 4, '0');

  UPDATE public.employees
     SET access_pin = v_new_pin
   WHERE id = _employee_id;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_company_id, 'reset_access_pin', 'employee', _employee_id::text,
            jsonb_build_object('via','rpc'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_new_pin;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_employee_access_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_employee_access_pin(uuid) TO authenticated;


-- 3) set_employee_access_pin
CREATE OR REPLACE FUNCTION public.set_employee_access_pin(_employee_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.employees WHERE id = _employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_global_owner(auth.uid())
       OR public.has_company_role(auth.uid(), v_company_id, 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees
     SET access_pin = _pin
   WHERE id = _employee_id;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_company_id, 'set_access_pin', 'employee', _employee_id::text,
            jsonb_build_object('via','rpc'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_employee_access_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_access_pin(uuid, text) TO authenticated;
