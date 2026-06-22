-- =============================================================
-- Sprint S4: PIN Hashing Additive Foundation (READ-FLIP DEFERRED)
-- =============================================================
-- Strict guardrails:
--   * Additive-only. No drops, no renames, no NOT NULL, no UNIQUE.
--   * `access_pin` (plaintext) is NEVER altered for any existing row.
--   * No reader uses `access_pin_hash` yet (S4-C).
--   * RLS / policies / auth / edge fns / payroll untouched.
--   * Backfill scoped to Stafly Demo only.
-- =============================================================

-- 1) Ensure pgcrypto (already installed in this project, idempotent).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Additive columns on public.employees.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS access_pin_hash   text,
  ADD COLUMN IF NOT EXISTS pin_hash_version  text,
  ADD COLUMN IF NOT EXISTS pin_set_at        timestamptz,
  ADD COLUMN IF NOT EXISTS pin_migrated_at   timestamptz;

COMMENT ON COLUMN public.employees.access_pin_hash IS
  'S4 PIN Hashing — bcrypt hash of the worker PIN. Written via dual-write in set_employee_access_pin / reset_employee_access_pin. NOT yet used by any reader (kiosk/portal/front-desk still compare plaintext access_pin). Reader flip is S4-C.';
COMMENT ON COLUMN public.employees.pin_hash_version IS
  'S4 — algorithm tag for access_pin_hash. Currently always "bcrypt".';
COMMENT ON COLUMN public.employees.pin_set_at IS
  'S4 — timestamp when access_pin was last set/reset by admin or activation flow.';
COMMENT ON COLUMN public.employees.pin_migrated_at IS
  'S4 — timestamp when access_pin_hash was first populated for this row (backfill or dual-write).';

-- 3) Per-column grants (Phase 1.5 model — new employees columns need explicit grants
--    or any client SELECT that touches them 403s the whole row).
--    Safe to expose to `authenticated`: RLS still scopes by company; bcrypt hashes
--    are designed to be public-safe; non-hash cols are pure metadata.
GRANT SELECT (access_pin_hash, pin_hash_version, pin_set_at, pin_migrated_at)
  ON public.employees TO authenticated;
GRANT SELECT (access_pin_hash, pin_hash_version, pin_set_at, pin_migrated_at)
  ON public.employees TO anon;
-- service_role already has full table-level privileges from prior migrations.

-- 4) Replace set_employee_access_pin to dual-write hash + metadata.
--    Behavior preserved: same args, same return type (boolean), same permission gate,
--    same plaintext write, same activity_log entry. ADDS bcrypt hash + timestamps + version.
CREATE OR REPLACE FUNCTION public.set_employee_access_pin(_employee_id uuid, _pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- DUAL-WRITE: plaintext (existing readers) + bcrypt hash (future readers).
  UPDATE public.employees
     SET access_pin       = _pin,
         access_pin_hash  = extensions.crypt(_pin, extensions.gen_salt('bf', 10)),
         pin_hash_version = 'bcrypt',
         pin_set_at       = now(),
         pin_migrated_at  = COALESCE(pin_migrated_at, now())
   WHERE id = _employee_id;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_company_id, 'set_access_pin', 'employee', _employee_id::text,
            jsonb_build_object('via','rpc','hash','dual_write'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN true;
END;
$function$;

-- 5) Replace reset_employee_access_pin to dual-write hash + metadata.
--    Same args, same return (the new plaintext PIN — surfaced once to admin), same gates.
CREATE OR REPLACE FUNCTION public.reset_employee_access_pin(_employee_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- DUAL-WRITE: plaintext (existing readers) + bcrypt hash (future readers).
  UPDATE public.employees
     SET access_pin       = v_new_pin,
         access_pin_hash  = extensions.crypt(v_new_pin, extensions.gen_salt('bf', 10)),
         pin_hash_version = 'bcrypt',
         pin_set_at       = now(),
         pin_migrated_at  = COALESCE(pin_migrated_at, now())
   WHERE id = _employee_id;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_company_id, 'reset_access_pin', 'employee', _employee_id::text,
            jsonb_build_object('via','rpc','hash','dual_write'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_new_pin;
END;
$function$;

-- 6) BACKFILL — SCOPED TO STAFLY DEMO COMPANY ONLY.
--    id verified in S4 plan: d3500000-0000-4000-8000-000000000001 ("Stafly Demo Company", is_demo=true).
--    Real tenants (Quality Staff, MyStaff, JKitchen, Eminence, Milenium, Hamaspik, Zemer, Parceros)
--    are intentionally excluded. Other demo tenants (Sandbox, QA Testing) are also excluded
--    in this sprint to keep the blast radius minimal.
UPDATE public.employees e
   SET access_pin_hash  = extensions.crypt(e.access_pin, extensions.gen_salt('bf', 10)),
       pin_hash_version = 'bcrypt',
       pin_set_at       = COALESCE(e.pin_set_at, now()),
       pin_migrated_at  = now()
 WHERE e.company_id = 'd3500000-0000-4000-8000-000000000001'
   AND e.access_pin IS NOT NULL
   AND e.access_pin_hash IS NULL;
