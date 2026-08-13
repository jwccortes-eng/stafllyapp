CREATE OR REPLACE FUNCTION public.internal_set_auth_pin(
  _user_id uuid,
  _pin text,
  _reason text DEFAULT 'backend',
  _actor uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_required' USING ERRCODE = '22023';
  END IF;
  IF _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format' USING ERRCODE = '22023';
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

  -- Never steal a canonical phone already claimed by another identity.
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.auth_pin_credentials c
    WHERE c.phone_canonical = v_phone AND c.user_id <> _user_id
  ) THEN
    INSERT INTO public.auth_pin_migration_review (user_id, phone_canonical, reason, details)
    VALUES (_user_id, v_phone, 'phone_shared_by_multiple_auth_users',
            jsonb_build_object('via', 'internal_set_auth_pin'));
    v_phone := NULL;
  END IF;

  INSERT INTO public.auth_pin_credentials AS c
    (user_id, phone_canonical, pin_hash, pin_version, failed_attempts, locked_until,
     pin_set_at, pin_set_by, pin_set_reason)
  VALUES
    (_user_id, v_phone, extensions.crypt(_pin, extensions.gen_salt('bf', 10)), 'bcrypt', 0, NULL,
     now(), _actor, _reason)
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash        = EXCLUDED.pin_hash,
        pin_version     = 'bcrypt',
        phone_canonical = COALESCE(EXCLUDED.phone_canonical, c.phone_canonical),
        failed_attempts = 0,
        locked_until    = NULL,
        pin_set_at      = now(),
        pin_set_by      = _actor,
        pin_set_reason  = _reason;

  DELETE FROM public.auth_rate_limits r
  WHERE public.normalize_auth_phone(r.phone_number) IN (
    SELECT public.normalize_auth_phone(e.phone_number)
    FROM public.employees e WHERE e.user_id = _user_id
    UNION SELECT v_phone
  );

  UPDATE public.profiles SET switch_pin = NULL WHERE user_id = _user_id AND switch_pin IS NOT NULL;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (_actor, NULL, 'set_auth_pin', 'auth_user', _user_id::text,
            jsonb_build_object('reason', _reason, 'lockout_cleared', true, 'via', 'backend'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_set_auth_pin(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_set_auth_pin(uuid, text, text, uuid) TO service_role;

-- Route the user-facing writer through the same body (single writer implementation).
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
  v_allowed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_actor = _user_id OR public.is_global_owner(v_actor) THEN
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

  RETURN public.internal_set_auth_pin(_user_id, _pin, _reason, v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.set_auth_pin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auth_pin(uuid, text, text) TO authenticated, service_role;
