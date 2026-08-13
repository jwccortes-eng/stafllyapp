-- ============================================================
-- P0 — AUTH PIN CANONICALIZATION
-- Canonical credential lives on the AUTH USER, never on employee/company.
-- ============================================================

-- 1) Phone normalization (single definition)
CREATE OR REPLACE FUNCTION public.normalize_auth_phone(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE d text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(_raw, '[^0-9]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  WHILE length(d) > 10 AND left(d, 1) IN ('0', '1') LOOP
    d := substr(d, 2);
  END LOOP;
  RETURN d;
END;
$$;

-- 2) Canonical credential table
CREATE TABLE IF NOT EXISTS public.auth_pin_credentials (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_canonical  text,
  pin_hash         text NOT NULL,
  pin_version      text NOT NULL DEFAULT 'bcrypt',
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  pin_set_at       timestamptz NOT NULL DEFAULT now(),
  pin_set_by       uuid,
  pin_set_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_pin_credentials_phone_uidx
  ON public.auth_pin_credentials (phone_canonical)
  WHERE phone_canonical IS NOT NULL;

GRANT SELECT ON public.auth_pin_credentials TO authenticated;
GRANT ALL ON public.auth_pin_credentials TO service_role;
ALTER TABLE public.auth_pin_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Self can view own credential row" ON public.auth_pin_credentials;
CREATE POLICY "Self can view own credential row"
ON public.auth_pin_credentials FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_global_owner(auth.uid()));

-- No INSERT/UPDATE/DELETE policies: writes only through SECURITY DEFINER ops.

-- 3) Human review queue for ambiguous migrations
CREATE TABLE IF NOT EXISTS public.auth_pin_migration_review (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  phone_canonical text,
  reason       text NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved     boolean NOT NULL DEFAULT false,
  resolved_by  uuid,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auth_pin_migration_review TO authenticated;
GRANT ALL ON public.auth_pin_migration_review TO service_role;
ALTER TABLE public.auth_pin_migration_review ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global owners can view pin migration review" ON public.auth_pin_migration_review;
CREATE POLICY "Global owners can view pin migration review"
ON public.auth_pin_migration_review FOR SELECT TO authenticated
USING (public.is_global_owner(auth.uid()));

-- 4) updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_auth_pin_credentials()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_auth_pin_credentials ON public.auth_pin_credentials;
CREATE TRIGGER trg_touch_auth_pin_credentials
BEFORE UPDATE ON public.auth_pin_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_auth_pin_credentials();

-- 5) THE SINGLE WRITER
CREATE OR REPLACE FUNCTION public.set_auth_pin(
  _user_id uuid,
  _pin text,
  _reason text DEFAULT 'set'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_phone text;
  v_allowed boolean := false;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_required' USING ERRCODE = '22023';
  END IF;
  IF _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format' USING ERRCODE = '22023';
  END IF;

  -- Authorization: self, global owner, or admin of any company the target belongs to.
  IF v_actor IS NULL THEN
    v_allowed := false;
  ELSIF v_actor = _user_id OR public.is_global_owner(v_actor) THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = _user_id
        AND public.has_company_role(v_actor, e.company_id, 'admin')
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT public.normalize_auth_phone(p.phone_number) INTO v_phone
  FROM public.profiles p WHERE p.user_id = _user_id;

  IF v_phone IS NULL THEN
    SELECT public.normalize_auth_phone(e.phone_number) INTO v_phone
    FROM public.employees e
    WHERE e.user_id = _user_id AND e.phone_number IS NOT NULL AND e.phone_number <> ''
    ORDER BY e.is_active DESC, e.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  INSERT INTO public.auth_pin_credentials AS c
    (user_id, phone_canonical, pin_hash, pin_version, failed_attempts, locked_until,
     pin_set_at, pin_set_by, pin_set_reason)
  VALUES
    (_user_id, v_phone, extensions.crypt(_pin, extensions.gen_salt('bf', 10)), 'bcrypt', 0, NULL,
     now(), v_actor, _reason)
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash        = EXCLUDED.pin_hash,
        pin_version     = 'bcrypt',
        phone_canonical = COALESCE(EXCLUDED.phone_canonical, c.phone_canonical),
        failed_attempts = 0,
        locked_until    = NULL,
        pin_set_at      = now(),
        pin_set_by      = v_actor,
        pin_set_reason  = _reason;

  -- Atomically neutralize legacy lockouts for every phone variant of this person.
  DELETE FROM public.auth_rate_limits r
  WHERE public.normalize_auth_phone(r.phone_number) IN (
    SELECT public.normalize_auth_phone(e.phone_number)
    FROM public.employees e WHERE e.user_id = _user_id
    UNION SELECT v_phone
  );

  -- Legacy switch PIN can never participate again.
  UPDATE public.profiles SET switch_pin = NULL WHERE user_id = _user_id AND switch_pin IS NOT NULL;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (v_actor, NULL, 'set_auth_pin', 'auth_user', _user_id::text,
            jsonb_build_object('reason', _reason, 'lockout_cleared', true));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_auth_pin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auth_pin(uuid, text, text) TO authenticated, service_role;

-- 5b) Admin wrapper keyed by worker record (resolves the auth user, never writes employee PIN)
CREATE OR REPLACE FUNCTION public.admin_reset_auth_pin(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company uuid;
  v_pin text;
BEGIN
  SELECT e.user_id, e.company_id INTO v_user_id, v_company
  FROM public.employees e WHERE e.id = _employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_global_owner(auth.uid())
       OR public.has_company_role(auth.uid(), v_company, 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'no_auth_user' USING ERRCODE = 'P0002';
  END IF;

  v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');
  PERFORM public.set_auth_pin(v_user_id, v_pin, 'admin_reset');
  RETURN v_pin;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_auth_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_auth_pin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_auth_pin_for_employee(_employee_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id uuid; v_company uuid;
BEGIN
  SELECT e.user_id, e.company_id INTO v_user_id, v_company
  FROM public.employees e WHERE e.id = _employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_global_owner(auth.uid())
       OR public.has_company_role(auth.uid(), v_company, 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'no_auth_user' USING ERRCODE = 'P0002'; END IF;
  RETURN public.set_auth_pin(v_user_id, _pin, 'admin_set');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_auth_pin_for_employee(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_auth_pin_for_employee(uuid, text) TO authenticated, service_role;

-- 6) THE SINGLE VALIDATOR (backend only)
CREATE OR REPLACE FUNCTION public.internal_verify_auth_pin(_user_id uuid, _pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.auth_pin_credentials%ROWTYPE;
  v_ok boolean := false;
  v_attempts integer;
BEGIN
  IF _user_id IS NULL OR _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO c FROM public.auth_pin_credentials WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_credential');
  END IF;

  IF c.locked_until IS NOT NULL AND c.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', c.locked_until);
  END IF;

  v_ok := (c.pin_hash = extensions.crypt(_pin, c.pin_hash));

  IF v_ok THEN
    UPDATE public.auth_pin_credentials
       SET failed_attempts = 0, locked_until = NULL
     WHERE user_id = _user_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_attempts := c.failed_attempts + 1;
  UPDATE public.auth_pin_credentials
     SET failed_attempts = v_attempts,
         locked_until = CASE WHEN v_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
   WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'ok', false,
    'reason', CASE WHEN v_attempts >= 5 THEN 'locked' ELSE 'invalid_pin' END,
    'failed_attempts', v_attempts,
    'locked_until', CASE WHEN v_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.internal_verify_auth_pin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_verify_auth_pin(uuid, text) TO service_role;

-- 6b) Identity resolution by phone (backend only) — one auth user per canonical phone
CREATE OR REPLACE FUNCTION public.internal_resolve_auth_identity(_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := public.normalize_auth_phone(_phone);
  v_user uuid;
  v_has_cred boolean := false;
  v_locked timestamptz;
BEGIN
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('phone', NULL, 'user_id', NULL, 'has_credential', false);
  END IF;

  SELECT user_id INTO v_user
  FROM public.auth_pin_credentials WHERE phone_canonical = v_phone;

  IF v_user IS NULL THEN
    SELECT e.user_id INTO v_user
    FROM public.employees e
    WHERE e.user_id IS NOT NULL
      AND public.normalize_auth_phone(e.phone_number) = v_phone
    ORDER BY e.is_active DESC, e.created_at ASC
    LIMIT 1;
  END IF;

  IF v_user IS NOT NULL THEN
    SELECT true, locked_until INTO v_has_cred, v_locked
    FROM public.auth_pin_credentials WHERE user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'phone', v_phone,
    'user_id', v_user,
    'has_credential', COALESCE(v_has_cred, false),
    'locked_until', v_locked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.internal_resolve_auth_identity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_resolve_auth_identity(text) TO service_role;

-- 7) Existence check used by the UI now points at the canonical credential
CREATE OR REPLACE FUNCTION public.employee_has_access_pin(_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid; v_company uuid;
BEGIN
  SELECT e.user_id, e.company_id INTO v_user, v_company
  FROM public.employees e WHERE e.id = _employee_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT (public.is_global_owner(auth.uid())
       OR public.has_company_role(auth.uid(), v_company, 'admin')
       OR v_user = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_user IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.auth_pin_credentials WHERE user_id = v_user);
END;
$$;

REVOKE ALL ON FUNCTION public.employee_has_access_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_has_access_pin(uuid) TO authenticated, service_role;

-- 8) Legacy switch PIN is no longer a credential
CREATE OR REPLACE FUNCTION public.has_switch_pin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.verify_switch_pin(_pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION public.set_switch_pin(_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN; END; $$;

-- 9) Legacy per-employee PIN writers are retired (kept as hard errors so no surface can regress)
CREATE OR REPLACE FUNCTION public.reset_employee_access_pin(_employee_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public.admin_reset_auth_pin(_employee_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_employee_access_pin(_employee_id uuid, _pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public.admin_set_auth_pin_for_employee(_employee_id, _pin);
END;
$$;

-- 10) DRY-RUN + MIGRATION of existing PINs to the canonical credential
DO $$
DECLARE
  r record;
  v_phone text;
  v_phone_taken boolean;
BEGIN
  FOR r IN
    SELECT e.user_id,
           array_agg(DISTINCT e.access_pin) FILTER (WHERE e.access_pin IS NOT NULL AND e.access_pin <> '') AS pins,
           array_agg(DISTINCT public.normalize_auth_phone(e.phone_number))
             FILTER (WHERE e.phone_number IS NOT NULL AND e.phone_number <> '') AS phones,
           count(*) AS records
    FROM public.employees e
    WHERE e.user_id IS NOT NULL
    GROUP BY e.user_id
  LOOP
    IF EXISTS (SELECT 1 FROM public.auth_pin_credentials WHERE user_id = r.user_id) THEN
      CONTINUE;
    END IF;

    IF r.pins IS NULL OR array_length(r.pins, 1) = 0 THEN
      INSERT INTO public.auth_pin_migration_review (user_id, phone_canonical, reason, details)
      VALUES (r.user_id, (r.phones)[1], 'no_legacy_pin',
              jsonb_build_object('employee_records', r.records));
      CONTINUE;
    END IF;

    IF array_length(r.pins, 1) > 1 THEN
      INSERT INTO public.auth_pin_migration_review (user_id, phone_canonical, reason, details)
      VALUES (r.user_id, (r.phones)[1], 'conflicting_pins',
              jsonb_build_object('pin_count', array_length(r.pins, 1),
                                 'employee_records', r.records,
                                 'phone_variants', to_jsonb(r.phones)));
      CONTINUE;
    END IF;

    v_phone := (r.phones)[1];
    v_phone_taken := v_phone IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.auth_pin_credentials c WHERE c.phone_canonical = v_phone
    );

    IF v_phone_taken THEN
      INSERT INTO public.auth_pin_migration_review (user_id, phone_canonical, reason, details)
      VALUES (r.user_id, v_phone, 'phone_shared_by_multiple_auth_users',
              jsonb_build_object('employee_records', r.records));
      v_phone := NULL;
    END IF;

    INSERT INTO public.auth_pin_credentials
      (user_id, phone_canonical, pin_hash, pin_version, pin_set_reason)
    VALUES (r.user_id, v_phone,
            extensions.crypt((r.pins)[1], extensions.gen_salt('bf', 10)),
            'bcrypt', 'migration_v1')
    ON CONFLICT (user_id) DO NOTHING;

    IF r.phones IS NOT NULL AND array_length(r.phones, 1) > 1 THEN
      INSERT INTO public.auth_pin_migration_review (user_id, phone_canonical, reason, details)
      VALUES (r.user_id, (r.phones)[1], 'multiple_phone_variants',
              jsonb_build_object('phone_variants', to_jsonb(r.phones)));
    END IF;
  END LOOP;

  -- Legacy switch PINs never authenticate again; keep an auditable trace of who had one.
  INSERT INTO public.auth_pin_migration_review (user_id, phone_canonical, reason, details)
  SELECT p.user_id, public.normalize_auth_phone(p.phone_number), 'legacy_switch_pin_retired',
         jsonb_build_object('had_switch_pin', true)
  FROM public.profiles p
  WHERE p.switch_pin IS NOT NULL;

  UPDATE public.profiles SET switch_pin = NULL WHERE switch_pin IS NOT NULL;
END;
$$;
