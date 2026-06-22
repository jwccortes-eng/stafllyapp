CREATE OR REPLACE FUNCTION public.internal_verify_pin_hash(
  _employee_id uuid,
  _pin text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF _employee_id IS NULL OR _pin IS NULL OR length(_pin) = 0 THEN
    RETURN false;
  END IF;

  SELECT access_pin_hash
    INTO v_hash
  FROM public.employees
  WHERE id = _employee_id;

  IF v_hash IS NULL OR length(v_hash) = 0 THEN
    RETURN false;
  END IF;

  RETURN crypt(_pin, v_hash) = v_hash;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.internal_verify_pin_hash(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_verify_pin_hash(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_verify_pin_hash(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_verify_pin_hash(uuid, text) TO service_role;