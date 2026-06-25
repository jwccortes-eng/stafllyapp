CREATE OR REPLACE FUNCTION public.ecosystem_identity_lookup_for_existing_employee(p_target_employee_id uuid, p_target_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  v_input_hash := encode(extensions.digest(coalesce(v_phone_norm,'') || '|' || coalesce(v_email_norm,''), 'sha256'), 'hex');

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
    v_reasons := ARRAY[]::text[];
    IF v_phone_norm IS NOT NULL AND v_match.phone_norm = v_phone_norm THEN
      v_reasons := array_append(v_reasons, 'phone'::text);
    END IF;
    IF v_email_norm IS NOT NULL AND v_match.email_norm = v_email_norm THEN
      v_reasons := array_append(v_reasons, 'email'::text);
    END IF;

    IF array_length(v_reasons,1) >= 2 THEN
      v_strength := 'HIGH';
    ELSIF 'phone' = ANY(v_reasons)
          AND v_target.display_name IS NOT NULL AND v_target.display_name <> ''
          AND v_match.display_name  IS NOT NULL AND v_match.display_name  <> ''
          AND lower(split_part(v_target.display_name, ' ', 1))
            = lower(split_part(v_match.display_name,  ' ', 1)) THEN
      v_strength := 'HIGH';
      v_reasons  := array_append(v_reasons, 'name'::text);
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
      'nonce',              encode(extensions.gen_random_bytes(16), 'hex')
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