DO $$
DECLARE
  v_exists boolean;
  v_value text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'eic_match_token_secret'
  ) INTO v_exists;

  IF v_exists THEN
    RAISE NOTICE 'eic_match_token_secret already exists in Vault. No overwrite performed.';
  ELSE
    -- Generate 64-char hex (32 random bytes) entirely inside the DB
    v_value := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(
      v_value,
      'eic_match_token_secret',
      'HMAC-SHA256 signing key for Ecosystem Identity Connect match tokens (EIC P0.1). Read only via SECURITY DEFINER helpers; never exposed to clients.'
    );
    -- Scrub local var
    v_value := NULL;
    RAISE NOTICE 'eic_match_token_secret created in Vault.';
  END IF;
END
$$;