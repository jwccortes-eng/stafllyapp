-- =============================================================================
-- EIC P0.1 — Ecosystem Identity Checkpoint (Foundations RPC migration)
-- =============================================================================
-- Scope: TWO security-definer RPCs + helpers. NO frontend, NO MSS/QS data
-- writes, NO changes to payroll / documents / auth.users / shifts /
-- time_entries / compensation / RLS / employees schema.
--
-- The match_token is bound to (target_company_id, target_employee_id,
-- source_company_id, source_employee_id, issued_to_user_id) so it cannot be
-- replayed against a different target employee.
--
-- SECRET: HMAC key lives in Supabase Vault under name 'eic_match_token_secret'.
-- It is read via the SECURITY DEFINER helper public._eic_get_match_token_secret().
-- The secret itself is NOT created in this migration. After SQL is approved we
-- will (1) generate the random value via generate_secret EIC_MATCH_TOKEN_SECRET
-- and (2) insert it into vault.secrets in a follow-up step before any RPC call.
-- Until the secret exists, both RPCs raise 'eic_secret_unconfigured' and abort.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Phone normalization helper (10-digit US, mirrors src/lib/phone.ts)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._eic_normalize_phone(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_raw, '\D', '', 'g');
  IF v_digits LIKE '00%' THEN v_digits := substring(v_digits from 3); END IF;
  IF length(v_digits) = 11 AND left(v_digits, 1) = '1' THEN
    v_digits := substring(v_digits from 2);
  END IF;
  IF length(v_digits) < 7 THEN RETURN NULL; END IF;
  RETURN v_digits;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_normalize_phone(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Email normalization helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._eic_normalize_email(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(lower(btrim(p_raw)), '');
$$;
REVOKE EXECUTE ON FUNCTION public._eic_normalize_email(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Mask helpers (return UI-safe partial strings; never full PII)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._eic_mask_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_phone IS NULL OR length(p_phone) < 4 THEN NULL
    ELSE '••• ••• ' || right(p_phone, 4)
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_mask_phone(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._eic_mask_email(p_email text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_local text; v_domain text; v_at int;
BEGIN
  IF p_email IS NULL THEN RETURN NULL; END IF;
  v_at := position('@' in p_email);
  IF v_at < 2 THEN RETURN NULL; END IF;
  v_local := substring(p_email from 1 for v_at - 1);
  v_domain := substring(p_email from v_at + 1);
  RETURN left(v_local, 1) || repeat('•', greatest(length(v_local) - 1, 1)) || '@' || v_domain;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_mask_email(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._eic_mask_name(p_name text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  parts text[]; out_parts text[] := '{}'; p text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN RETURN NULL; END IF;
  parts := regexp_split_to_array(btrim(p_name), '\s+');
  FOREACH p IN ARRAY parts LOOP
    IF length(p) <= 1 THEN
      out_parts := out_parts || p;
    ELSE
      out_parts := out_parts || (left(p, 1) || repeat('•', length(p) - 1));
    END IF;
  END LOOP;
  RETURN array_to_string(out_parts, ' ');
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_mask_name(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Secret accessor (reads from Supabase Vault). Raises if not configured.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._eic_get_match_token_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'eic_match_token_secret'
  LIMIT 1;

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE EXCEPTION 'eic_secret_unconfigured'
      USING HINT = 'Insert EIC_MATCH_TOKEN_SECRET into vault.secrets as name=eic_match_token_secret before invoking EIC RPCs.';
  END IF;
  RETURN v_secret;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_get_match_token_secret() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Token sign / verify helpers (HMAC-SHA256, base64url, payload = JSONB)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._eic_b64url_encode(p_bytes bytea)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(rtrim(encode(p_bytes, 'base64'), '='), '+/'||E'\n', '-_');
$$;
REVOKE EXECUTE ON FUNCTION public._eic_b64url_encode(bytea) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._eic_b64url_decode(p_text text)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text := translate(p_text, '-_', '+/');
  pad int;
BEGIN
  pad := (4 - (length(s) % 4)) % 4;
  RETURN decode(s || repeat('=', pad), 'base64');
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_b64url_decode(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._eic_sign_match_token(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text := public._eic_get_match_token_secret();
  v_body text := public._eic_b64url_encode(convert_to(p_payload::text, 'UTF8'));
  v_sig  text := public._eic_b64url_encode(extensions.hmac(v_body, v_secret, 'sha256'));
BEGIN
  RETURN v_body || '.' || v_sig;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_sign_match_token(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._eic_verify_match_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text := public._eic_get_match_token_secret();
  v_dot int;
  v_body text;
  v_sig  text;
  v_expected text;
  v_payload jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'eic_token_missing'; END IF;
  v_dot := position('.' in p_token);
  IF v_dot < 2 THEN RAISE EXCEPTION 'eic_token_malformed'; END IF;
  v_body := substring(p_token from 1 for v_dot - 1);
  v_sig  := substring(p_token from v_dot + 1);
  v_expected := public._eic_b64url_encode(extensions.hmac(v_body, v_secret, 'sha256'));
  -- Length-safe equality
  IF length(v_sig) <> length(v_expected) OR v_sig <> v_expected THEN
    RAISE EXCEPTION 'eic_token_bad_signature';
  END IF;
  v_payload := convert_from(public._eic_b64url_decode(v_body), 'UTF8')::jsonb;
  IF (v_payload->>'expires_at')::timestamptz < now() THEN
    RAISE EXCEPTION 'eic_token_expired';
  END IF;
  RETURN v_payload;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_verify_match_token(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Rate limit helper (reuses auth_rate_limits table; 10/min, 100/h per user)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._eic_check_rate_limit(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute int;
  v_hour   int;
BEGIN
  SELECT count(*) INTO v_minute
    FROM public.auth_rate_limits
   WHERE identifier = 'eic_lookup:' || p_user_id::text
     AND created_at > now() - interval '1 minute';
  IF v_minute >= 10 THEN
    RAISE EXCEPTION 'eic_rate_limited_minute';
  END IF;

  SELECT count(*) INTO v_hour
    FROM public.auth_rate_limits
   WHERE identifier = 'eic_lookup:' || p_user_id::text
     AND created_at > now() - interval '1 hour';
  IF v_hour >= 100 THEN
    RAISE EXCEPTION 'eic_rate_limited_hour';
  END IF;

  INSERT INTO public.auth_rate_limits (identifier, attempt_type)
  VALUES ('eic_lookup:' || p_user_id::text, 'eic_lookup');
END;
$$;
REVOKE EXECUTE ON FUNCTION public._eic_check_rate_limit(uuid) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 7. MAIN RPC #1 — LOOKUP (bound to a target employee)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ecosystem_identity_lookup_for_existing_employee(
  p_target_employee_id uuid,
  p_target_company_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_target record;
  v_phone_norm text;
  v_email_norm text;
  v_input_hash text;
  v_matches jsonb := '[]'::jsonb;
  v_result_count int := 0;
  v_match record;
  v_strength text;
  v_reasons text[];
  v_token text;
  v_payload jsonb;
  v_now timestamptz := now();
  v_expires timestamptz := now() + interval '10 minutes';
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'eic_unauthenticated';
  END IF;

  -- (1) Authorization: global owner OR tenant-scoped admin of TARGET company
  v_is_admin := public.is_global_owner(v_caller)
             OR public.user_is_company_admin(v_caller, p_target_company_id);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'eic_forbidden';
  END IF;

  -- (2) Rate limit
  PERFORM public._eic_check_rate_limit(v_caller);

  -- (3) Target employee belongs to target company; read phone/email/name only
  SELECT id, company_id, user_id, phone_number, email, full_name
    INTO v_target
    FROM public.employees
   WHERE id = p_target_employee_id
     AND company_id = p_target_company_id
   LIMIT 1;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'eic_target_not_found';
  END IF;

  -- (4) Reject if target lacks sufficient lookup signal
  v_phone_norm := public._eic_normalize_phone(v_target.phone_number);
  v_email_norm := public._eic_normalize_email(v_target.email);
  IF v_phone_norm IS NULL AND v_email_norm IS NULL THEN
    RAISE EXCEPTION 'eic_target_missing_phone_and_email';
  END IF;

  v_input_hash := encode(digest(coalesce(v_phone_norm,'') || '|' || coalesce(v_email_norm,''), 'sha256'), 'hex');

  -- (5) Cross-tenant matches. Exclude same company. Read minimal columns.
  FOR v_match IN
    SELECT e.id           AS source_employee_id,
           e.company_id   AS source_company_id,
           e.user_id      AS source_user_id,
           e.full_name,
           public._eic_normalize_phone(e.phone_number) AS phone_norm,
           public._eic_normalize_email(e.email)        AS email_norm,
           c.name         AS source_company_name
      FROM public.employees e
      JOIN public.companies c ON c.id = e.company_id
     WHERE e.company_id <> p_target_company_id
       AND (
            (v_phone_norm IS NOT NULL AND public._eic_normalize_phone(e.phone_number) = v_phone_norm)
         OR (v_email_norm IS NOT NULL AND public._eic_normalize_email(e.email)       = v_email_norm)
       )
     LIMIT 25
  LOOP
    v_reasons := '{}';
    IF v_phone_norm IS NOT NULL AND v_match.phone_norm = v_phone_norm THEN
      v_reasons := v_reasons || 'phone';
    END IF;
    IF v_email_norm IS NOT NULL AND v_match.email_norm = v_email_norm THEN
      v_reasons := v_reasons || 'email';
    END IF;
    -- HIGH = phone+email OR phone+name-overlap; MEDIUM = phone-only; LOW = email-only
    IF array_length(v_reasons,1) >= 2 THEN
      v_strength := 'HIGH';
    ELSIF 'phone' = ANY(v_reasons)
          AND v_target.full_name IS NOT NULL AND v_match.full_name IS NOT NULL
          AND lower(split_part(btrim(v_target.full_name),' ',1))
            = lower(split_part(btrim(v_match.full_name),' ',1)) THEN
      v_strength := 'HIGH';
      v_reasons  := v_reasons || 'name';
    ELSIF 'phone' = ANY(v_reasons) THEN
      v_strength := 'MEDIUM';
    ELSE
      v_strength := 'LOW';
    END IF;

    v_payload := jsonb_build_object(
      'target_company_id',  p_target_company_id,
      'target_employee_id', p_target_employee_id,
      'source_company_id',  v_match.source_company_id,
      'source_employee_id', v_match.source_employee_id,
      'match_strength',     v_strength,
      'match_reasons',      to_jsonb(v_reasons),
      'issued_to_user_id',  v_caller,
      'issued_at',          v_now,
      'expires_at',         v_expires,
      'nonce',              encode(gen_random_bytes(16), 'hex')
    );
    v_token := public._eic_sign_match_token(v_payload);

    v_matches := v_matches || jsonb_build_object(
      'source_employee_id',  v_match.source_employee_id,
      'source_company_id',   v_match.source_company_id,
      'source_company_name', v_match.source_company_name,
      'has_auth_user',       (v_match.source_user_id IS NOT NULL),
      'masked_name',         public._eic_mask_name(v_match.full_name),
      'masked_phone',        public._eic_mask_phone(v_match.phone_norm),
      'masked_email',        public._eic_mask_email(v_match.email_norm),
      'match_strength',      v_strength,
      'match_reasons',       to_jsonb(v_reasons),
      'match_token',         v_token,
      'expires_at',          v_expires
    );
    v_result_count := v_result_count + 1;
  END LOOP;

  -- (8) Audit
  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (v_caller, p_target_company_id, 'eic_lookup', 'employee', p_target_employee_id,
          jsonb_build_object(
            'input_hash',   v_input_hash,
            'result_count', v_result_count,
            'has_phone',    v_phone_norm IS NOT NULL,
            'has_email',    v_email_norm IS NOT NULL
          ));

  RETURN jsonb_build_object(
    'target_employee_id', p_target_employee_id,
    'target_company_id',  p_target_company_id,
    'result_count',       v_result_count,
    'matches',            v_matches
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ecosystem_identity_lookup_for_existing_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ecosystem_identity_lookup_for_existing_employee(uuid, uuid) TO authenticated;

-- =============================================================================
-- 8. MAIN RPC #2 — ATTACH existing employee to existing auth user
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ecosystem_identity_attach_existing_employee_to_auth_user(
  p_target_employee_id uuid,
  p_target_company_id  uuid,
  p_match_token        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_payload jsonb;
  v_source_employee_id uuid;
  v_source_company_id  uuid;
  v_source_user_id uuid;
  v_target record;
  v_recheck_strength text;
  v_phone_norm text;
  v_email_norm text;
  v_attached_rows int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'eic_unauthenticated'; END IF;

  v_is_admin := public.is_global_owner(v_caller)
             OR public.user_is_company_admin(v_caller, p_target_company_id);
  IF NOT v_is_admin THEN RAISE EXCEPTION 'eic_forbidden'; END IF;

  -- Verify token (signature + expiry)
  v_payload := public._eic_verify_match_token(p_match_token);

  -- Token binding checks
  IF (v_payload->>'issued_to_user_id')::uuid <> v_caller THEN
    RAISE EXCEPTION 'eic_token_wrong_user';
  END IF;
  IF (v_payload->>'target_company_id')::uuid  <> p_target_company_id
     OR (v_payload->>'target_employee_id')::uuid <> p_target_employee_id THEN
    RAISE EXCEPTION 'eic_token_target_mismatch';
  END IF;
  IF (v_payload->>'match_strength') <> 'HIGH' THEN
    RAISE EXCEPTION 'eic_token_low_strength';
  END IF;

  v_source_employee_id := (v_payload->>'source_employee_id')::uuid;
  v_source_company_id  := (v_payload->>'source_company_id')::uuid;

  -- Re-read source row server-side
  SELECT user_id INTO v_source_user_id
    FROM public.employees
   WHERE id = v_source_employee_id
     AND company_id = v_source_company_id
   LIMIT 1;
  IF v_source_user_id IS NULL THEN
    RAISE EXCEPTION 'eic_source_no_auth_user';
  END IF;

  -- Re-read target row server-side
  SELECT id, user_id, phone_number, email, full_name
    INTO v_target
    FROM public.employees
   WHERE id = p_target_employee_id
     AND company_id = p_target_company_id
   LIMIT 1;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'eic_target_not_found';
  END IF;
  IF v_target.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'eic_target_already_linked';
  END IF;

  -- Re-evaluate HIGH strength server-side (do NOT trust token alone)
  v_phone_norm := public._eic_normalize_phone(v_target.phone_number);
  v_email_norm := public._eic_normalize_email(v_target.email);

  SELECT CASE
    WHEN v_phone_norm IS NOT NULL
         AND public._eic_normalize_phone(s.phone_number) = v_phone_norm
         AND v_email_norm IS NOT NULL
         AND public._eic_normalize_email(s.email) = v_email_norm
      THEN 'HIGH'
    WHEN v_phone_norm IS NOT NULL
         AND public._eic_normalize_phone(s.phone_number) = v_phone_norm
         AND v_target.full_name IS NOT NULL AND s.full_name IS NOT NULL
         AND lower(split_part(btrim(v_target.full_name),' ',1))
           = lower(split_part(btrim(s.full_name),' ',1))
      THEN 'HIGH'
    ELSE 'LOW'
  END INTO v_recheck_strength
  FROM public.employees s
  WHERE s.id = v_source_employee_id;

  IF v_recheck_strength <> 'HIGH' THEN
    RAISE EXCEPTION 'eic_strength_recheck_failed';
  END IF;

  -- Mutation: ONLY user_id + portal_access_enabled on target. Nothing else.
  UPDATE public.employees
     SET user_id = v_source_user_id,
         portal_access_enabled = true,
         updated_at = now()
   WHERE id = p_target_employee_id
     AND company_id = p_target_company_id
     AND user_id IS NULL;
  GET DIAGNOSTICS v_attached_rows = ROW_COUNT;

  IF v_attached_rows <> 1 THEN
    RAISE EXCEPTION 'eic_attach_race';
  END IF;

  -- Audit (both companies surface in details; primary scope = target)
  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (v_caller, p_target_company_id, 'eic_attach', 'employee', p_target_employee_id,
          jsonb_build_object(
            'source_company_id',  v_source_company_id,
            'source_employee_id', v_source_employee_id,
            'attached_user_id',   v_source_user_id,
            'match_strength',     'HIGH',
            'token_nonce',        v_payload->>'nonce',
            'token_issued_at',    v_payload->>'issued_at'
          ));

  RETURN jsonb_build_object(
    'attached',           true,
    'target_employee_id', p_target_employee_id,
    'target_company_id',  p_target_company_id,
    'attached_user_id',   v_source_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ecosystem_identity_attach_existing_employee_to_auth_user(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ecosystem_identity_attach_existing_employee_to_auth_user(uuid, uuid, text) TO authenticated;