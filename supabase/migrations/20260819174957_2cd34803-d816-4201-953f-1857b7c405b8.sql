CREATE TABLE IF NOT EXISTS public.auth_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  channel text NOT NULL DEFAULT 'email',
  destination_masked text NOT NULL,
  code_hash text NOT NULL,
  code_attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  token_hash text,
  token_expires_at timestamptz,
  consumed_at timestamptz,
  initiated_source text NOT NULL DEFAULT 'worker',
  initiated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.auth_recovery_requests TO service_role;
ALTER TABLE public.auth_recovery_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_recovery_requests_no_client_access" ON public.auth_recovery_requests;
CREATE POLICY "auth_recovery_requests_no_client_access"
ON public.auth_recovery_requests FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_auth_recovery_user_created
  ON public.auth_recovery_requests (user_id, created_at DESC);

-- Inicia una recuperación verificada. Devuelve el código en claro UNA sola vez
-- al backend (service_role) para enviarlo por el canal verificado.
CREATE OR REPLACE FUNCTION public.internal_start_pin_recovery(
  _user_id uuid,
  _destination_masked text,
  _company_id uuid DEFAULT NULL,
  _source text DEFAULT 'worker',
  _actor uuid DEFAULT NULL,
  _channel text DEFAULT 'email'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recent integer;
  v_last timestamptz;
  v_code text;
  v_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_user_required');
  END IF;

  SELECT count(*), max(created_at) INTO v_recent, v_last
  FROM public.auth_recovery_requests
  WHERE user_id = _user_id AND created_at > now() - interval '15 minutes';

  IF v_recent >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited',
      'retry_after_seconds', GREATEST(1, ceil(extract(epoch FROM (v_last + interval '15 minutes' - now()))))::int);
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown',
      'retry_after_seconds', GREATEST(1, ceil(extract(epoch FROM (v_last + interval '60 seconds' - now()))))::int);
  END IF;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  INSERT INTO public.auth_recovery_requests
    (user_id, company_id, channel, destination_masked, code_hash, expires_at, initiated_source, initiated_by)
  VALUES
    (_user_id, _company_id, COALESCE(_channel, 'email'), _destination_masked,
     extensions.crypt(v_code, extensions.gen_salt('bf', 10)),
     now() + interval '10 minutes', COALESCE(_source, 'worker'), _actor)
  RETURNING id INTO v_id;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (_actor, _company_id, 'pin_recovery_started', 'auth_user', _user_id::text,
            jsonb_build_object('request_id', v_id, 'source', COALESCE(_source, 'worker'),
                               'channel', COALESCE(_channel, 'email'), 'destination', _destination_masked));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id, 'code', v_code,
                            'expires_at', now() + interval '10 minutes');
END;
$$;

-- Verifica el código. Devuelve un token de un solo uso (10 min) para fijar el PIN.
CREATE OR REPLACE FUNCTION public.internal_verify_pin_recovery(_request_id uuid, _code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.auth_recovery_requests%ROWTYPE;
  v_token text;
BEGIN
  IF _request_id IS NULL OR _code IS NULL OR _code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO r FROM public.auth_recovery_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF r.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'consumed');
  END IF;
  IF r.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF r.code_attempts >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  END IF;

  IF r.code_hash <> extensions.crypt(_code, r.code_hash) THEN
    UPDATE public.auth_recovery_requests
       SET code_attempts = r.code_attempts + 1
     WHERE id = r.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code',
                              'attempts_left', GREATEST(0, 4 - r.code_attempts));
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.auth_recovery_requests
     SET verified_at = now(),
         token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         token_expires_at = now() + interval '10 minutes'
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'token', v_token);
END;
$$;

-- Cierra la recuperación: fija el PIN nuevo por la vía canónica y consume el token.
CREATE OR REPLACE FUNCTION public.internal_complete_pin_recovery(_request_id uuid, _token text, _pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.auth_recovery_requests%ROWTYPE;
BEGIN
  IF _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_pin_format');
  END IF;

  SELECT * INTO r FROM public.auth_recovery_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF r.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'consumed');
  END IF;
  IF r.verified_at IS NULL OR r.token_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_verified');
  END IF;
  IF r.token_expires_at IS NULL OR r.token_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF _token IS NULL
     OR r.token_hash <> encode(extensions.digest(_token, 'sha256'), 'hex') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  PERFORM public.internal_set_auth_pin(r.user_id, _pin, 'verified_recovery', r.user_id);

  UPDATE public.auth_recovery_requests
     SET consumed_at = now(), token_hash = NULL
   WHERE id = r.id;

  BEGIN
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
    VALUES (r.user_id, r.company_id, 'pin_recovery_completed', 'auth_user', r.user_id::text,
            jsonb_build_object('request_id', r.id, 'source', r.initiated_source,
                               'initiated_by', r.initiated_by, 'lockout_cleared', true));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'user_id', r.user_id);
END;
$$;

-- ¿Puede este admin iniciar la recuperación de este trabajador? Nunca devuelve PIN.
CREATE OR REPLACE FUNCTION public.admin_can_recover_employee(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_company uuid;
  v_email text;
BEGIN
  SELECT e.user_id, e.company_id, e.email INTO v_user_id, v_company, v_email
  FROM public.employees e WHERE e.id = _employee_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'employee_not_found');
  END IF;

  IF NOT (public.is_global_owner(auth.uid())
       OR public.has_company_role(auth.uid(), v_company, 'admin')) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'forbidden');
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_auth_user');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'user_id', v_user_id,
                            'company_id', v_company, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.internal_start_pin_recovery(uuid, text, uuid, text, uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_verify_pin_recovery(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_complete_pin_recovery(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_start_pin_recovery(uuid, text, uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_verify_pin_recovery(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_complete_pin_recovery(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_can_recover_employee(uuid) TO authenticated, service_role;