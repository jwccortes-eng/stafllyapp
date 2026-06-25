
-- ============================================================
-- EIC P0.1 minimal patch: dedicated rate-limit table + display_name fix
-- Idempotent. Scope: 2 RPCs + 1 helper + 1 new table.
-- Touches: public.eic_rate_limits (new), public._eic_check_rate_limit,
--          public.ecosystem_identity_lookup_for_existing_employee,
--          public.ecosystem_identity_attach_existing_employee_to_auth_user.
-- Does NOT touch: public.auth_rate_limits, public.employees schema,
--                 payroll/time_entries/shifts/documents/auth/etc.
-- ============================================================

-- (A) Dedicated rate-limit table
CREATE TABLE IF NOT EXISTS public.eic_rate_limits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier    text NOT NULL,
  attempt_type  text NOT NULL DEFAULT 'lookup',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eic_rate_limits_identifier_created_at
  ON public.eic_rate_limits (identifier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eic_rate_limits_attempt_type_created_at
  ON public.eic_rate_limits (attempt_type, created_at DESC);

-- Lock down access. Only SECURITY DEFINER helpers (owned by postgres) may use it.
REVOKE ALL ON public.eic_rate_limits FROM PUBLIC;
REVOKE ALL ON public.eic_rate_limits FROM anon;
REVOKE ALL ON public.eic_rate_limits FROM authenticated;
GRANT  ALL ON public.eic_rate_limits TO service_role;

ALTER TABLE public.eic_rate_limits ENABLE ROW LEVEL SECURITY;

-- No-op policy block: deny by default (no policies = no access for non-bypass roles).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='eic_rate_limits'
       AND policyname='eic_rate_limits_deny_all'
  ) THEN
    CREATE POLICY "eic_rate_limits_deny_all"
      ON public.eic_rate_limits
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END$$;

-- (B) Rewrite rate-limit helper to use eic_rate_limits
CREATE OR REPLACE FUNCTION public._eic_check_rate_limit(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_identifier text := 'eic_lookup:' || p_user_id::text;
  v_minute int;
  v_hour   int;
BEGIN
  SELECT count(*) INTO v_minute
    FROM public.eic_rate_limits
   WHERE identifier = v_identifier
     AND created_at > now() - interval '1 minute';
  IF v_minute >= 10 THEN
    RAISE EXCEPTION 'eic_rate_limit_exceeded' USING DETAIL = 'minute';
  END IF;

  SELECT count(*) INTO v_hour
    FROM public.eic_rate_limits
   WHERE identifier = v_identifier
     AND created_at > now() - interval '1 hour';
  IF v_hour >= 100 THEN
    RAISE EXCEPTION 'eic_rate_limit_exceeded' USING DETAIL = 'hour';
  END IF;

  INSERT INTO public.eic_rate_limits (identifier, attempt_type)
  VALUES (v_identifier, 'lookup');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._eic_check_rate_limit(uuid) FROM PUBLIC, anon, authenticated;

-- (C) Lookup RPC: replace employees.full_name with built display name
CREATE OR REPLACE FUNCTION public.ecosystem_identity_lookup_for_existing_employee(
  p_target_employee_id uuid,
  p_target_company_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  v_is_admin := public.is_global_owner(v_caller)
             OR public.user_is_company_admin(v_caller, p_target_company_id);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'eic_forbidden';
  END IF;

  PERFORM public._eic_check_rate_limit(v_caller);

  SELECT id, company_id, user_id, phone_number, email,
         btrim(coalesce(
           nullif(preferred_name, ''),
           concat_ws(' ', nullif(first_name, ''), nullif(last_name, ''))
         )) AS display_name
    INTO v_target
    FROM public.employees
   WHERE id = p_target_employee_id
     AND company_id = p_target_company_id
   LIMIT 1;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'eic_target_not_found';
  END IF;

  v_phone_norm := public._eic_normalize_phone(v_target.phone_number);
  v_email_norm := public._eic_normalize_email(v_target.email);
  IF v_phone_norm IS NULL AND v_email_norm IS NULL THEN
    RAISE EXCEPTION 'eic_target_missing_phone_and_email';
  END IF;

  v_input_hash := encode(digest(coalesce(v_phone_norm,'') || '|' || coalesce(v_email_norm,''), 'sha256'), 'hex');

  FOR v_match IN
    SELECT e.id           AS source_employee_id,
           e.company_id   AS source_company_id,
           e.user_id      AS source_user_id,
           btrim(coalesce(
             nullif(e.preferred_name, ''),
             concat_ws(' ', nullif(e.first_name, ''), nullif(e.last_name, ''))
           )) AS display_name,
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

    IF array_length(v_reasons,1) >= 2 THEN
      v_strength := 'HIGH';
    ELSIF 'phone' = ANY(v_reasons)
          AND v_target.display_name IS NOT NULL AND v_target.display_name <> ''
          AND v_match.display_name  IS NOT NULL AND v_match.display_name  <> ''
          AND lower(split_part(v_target.display_name, ' ', 1))
            = lower(split_part(v_match.display_name,  ' ', 1)) THEN
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
      'masked_name',         public._eic_mask_name(v_match.display_name),
      'masked_phone',        public._eic_mask_phone(v_match.phone_norm),
      'masked_email',        public._eic_mask_email(v_match.email_norm),
      'match_strength',      v_strength,
      'match_reasons',       to_jsonb(v_reasons),
      'match_token',         v_token,
      'expires_at',          v_expires
    );
    v_result_count := v_result_count + 1;
  END LOOP;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.ecosystem_identity_lookup_for_existing_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ecosystem_identity_lookup_for_existing_employee(uuid, uuid) TO authenticated;

-- (D) Attach RPC: same display_name fix
CREATE OR REPLACE FUNCTION public.ecosystem_identity_attach_existing_employee_to_auth_user(
  p_target_employee_id uuid,
  p_target_company_id  uuid,
  p_match_token        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_payload jsonb;
  v_source_employee_id uuid;
  v_source_company_id  uuid;
  v_source_user_id uuid;
  v_target record;
  v_source record;
  v_recheck_strength text;
  v_phone_norm text;
  v_email_norm text;
  v_attached_rows int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'eic_unauthenticated'; END IF;

  v_is_admin := public.is_global_owner(v_caller)
             OR public.user_is_company_admin(v_caller, p_target_company_id);
  IF NOT v_is_admin THEN RAISE EXCEPTION 'eic_forbidden'; END IF;

  v_payload := public._eic_verify_match_token(p_match_token);

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

  SELECT user_id,
         btrim(coalesce(
           nullif(preferred_name, ''),
           concat_ws(' ', nullif(first_name, ''), nullif(last_name, ''))
         )) AS display_name,
         phone_number, email
    INTO v_source
    FROM public.employees
   WHERE id = v_source_employee_id
     AND company_id = v_source_company_id
   LIMIT 1;
  IF v_source.user_id IS NULL THEN
    RAISE EXCEPTION 'eic_source_no_auth_user';
  END IF;
  v_source_user_id := v_source.user_id;

  SELECT id, user_id, phone_number, email,
         btrim(coalesce(
           nullif(preferred_name, ''),
           concat_ws(' ', nullif(first_name, ''), nullif(last_name, ''))
         )) AS display_name
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

  v_phone_norm := public._eic_normalize_phone(v_target.phone_number);
  v_email_norm := public._eic_normalize_email(v_target.email);

  v_recheck_strength := CASE
    WHEN v_phone_norm IS NOT NULL
         AND public._eic_normalize_phone(v_source.phone_number) = v_phone_norm
         AND v_email_norm IS NOT NULL
         AND public._eic_normalize_email(v_source.email) = v_email_norm
      THEN 'HIGH'
    WHEN v_phone_norm IS NOT NULL
         AND public._eic_normalize_phone(v_source.phone_number) = v_phone_norm
         AND v_target.display_name IS NOT NULL AND v_target.display_name <> ''
         AND v_source.display_name IS NOT NULL AND v_source.display_name <> ''
         AND lower(split_part(v_target.display_name, ' ', 1))
           = lower(split_part(v_source.display_name, ' ', 1))
      THEN 'HIGH'
    ELSE 'LOW'
  END;

  IF v_recheck_strength <> 'HIGH' THEN
    RAISE EXCEPTION 'eic_strength_recheck_failed';
  END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.ecosystem_identity_attach_existing_employee_to_auth_user(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ecosystem_identity_attach_existing_employee_to_auth_user(uuid, uuid, text) TO authenticated;
