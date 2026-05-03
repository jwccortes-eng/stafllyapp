-- 1. Revoke direct column access on switch_pin
REVOKE SELECT (switch_pin), UPDATE (switch_pin), INSERT (switch_pin)
  ON public.profiles FROM authenticated, anon, PUBLIC;

-- 2. Self-service RPCs (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_switch_pin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT switch_pin IS NOT NULL AND length(switch_pin) > 0
     FROM public.profiles WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_switch_pin(_pin text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND switch_pin = _pin
  );
$$;

CREATE OR REPLACE FUNCTION public.set_switch_pin(_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format';
  END IF;
  UPDATE public.profiles
     SET switch_pin = _pin
   WHERE user_id = auth.uid();
END;
$$;

-- 3. Lock down EXECUTE
REVOKE EXECUTE ON FUNCTION
  public.has_switch_pin(),
  public.verify_switch_pin(text),
  public.set_switch_pin(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.has_switch_pin(),
  public.verify_switch_pin(text),
  public.set_switch_pin(text)
TO authenticated;