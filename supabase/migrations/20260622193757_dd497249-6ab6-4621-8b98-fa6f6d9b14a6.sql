-- S4-B: Additive dual-write helper + sandbox/QA backfill. NO reader flip.

-- 1) Internal helper used ONLY by the employee-auth edge function (service_role).
--    Mirrors plaintext access_pin into the new hash columns. Never touches access_pin.
CREATE OR REPLACE FUNCTION public.internal_dual_write_pin_hash(
  _employee_id uuid,
  _pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Defensive: only accept 4-digit PINs. Silently no-op otherwise (no logs of pin).
  IF _pin IS NULL OR _pin !~ '^\d{4}$' OR _employee_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.employees
     SET access_pin_hash  = extensions.crypt(_pin, extensions.gen_salt('bf', 10)),
         pin_hash_version = 'bcrypt',
         pin_set_at       = now(),
         pin_migrated_at  = COALESCE(pin_migrated_at, now())
   WHERE id = _employee_id;
END;
$function$;

-- Lock down: service_role only. No anon/authenticated/public execute.
REVOKE ALL ON FUNCTION public.internal_dual_write_pin_hash(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_dual_write_pin_hash(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.internal_dual_write_pin_hash(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_dual_write_pin_hash(uuid, text) TO service_role;

-- 2) Backfill approved sandbox/QA tenants only.
--    Stafly Demo Company already backfilled in S4. Real tenants untouched.
UPDATE public.employees
   SET access_pin_hash  = extensions.crypt(access_pin, extensions.gen_salt('bf', 10)),
       pin_hash_version = 'bcrypt',
       pin_set_at       = COALESCE(pin_set_at, now()),
       pin_migrated_at  = COALESCE(pin_migrated_at, now())
 WHERE company_id IN (
         '876d404e-535e-4518-9541-80bc02298f90'::uuid, -- Sandbox
         '7c1458db-109a-4042-a2b0-78e04427ec2d'::uuid  -- QA Testing
       )
   AND access_pin IS NOT NULL
   AND access_pin ~ '^\d{4}$'
   AND access_pin_hash IS NULL;