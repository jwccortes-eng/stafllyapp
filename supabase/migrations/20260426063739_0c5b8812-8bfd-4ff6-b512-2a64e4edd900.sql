CREATE OR REPLACE FUNCTION public.get_or_create_unsubscribe_token(p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token text;
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'EMAIL_REQUIRED: cannot generate unsubscribe token for empty email';
  END IF;

  SELECT token INTO v_token
  FROM public.email_unsubscribe_tokens
  WHERE email = v_email
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  -- Use fully-qualified extensions.gen_random_bytes for resilience
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.email_unsubscribe_tokens (email, token)
  VALUES (v_email, v_token)
  ON CONFLICT (email) DO UPDATE SET token = email_unsubscribe_tokens.token
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$function$;