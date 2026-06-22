-- S7-G: DB-backed PIN hash verification (service-role only RPC).
-- Replaces failing JS bcrypt compare in edge runtime with pgcrypto.crypt.
-- Demo-only consumer for now (employee-auth login, kiosk-clock, front-desk-checkin
-- dual branch). Real tenants remain on legacy plaintext gate.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.internal_verify_pin_hash(
  _employee_id uuid,
  _pin text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.internal_verify_pin_hash(uuid, text) IS
  'S7-G: service-role-only PIN hash verifier. Returns boolean. Demo dual consumers only. No logs, no detail. Returns false on any error.';