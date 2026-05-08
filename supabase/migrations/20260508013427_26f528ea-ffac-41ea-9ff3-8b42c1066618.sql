
-- 1. Helper to upsert the vault secret (only callable via service-role; revoke from anon/auth)
CREATE OR REPLACE FUNCTION public._set_cron_secret(p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, 'cron_secret', 'Shared secret for pg_cron -> edge function calls');
  ELSE
    PERFORM vault.update_secret(v_id, p_value);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._set_cron_secret(text) FROM PUBLIC, anon, authenticated;

-- 2. Helper to read decrypted cron_secret (definer; restricted to service role)
CREATE OR REPLACE FUNCTION public._get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault, extensions
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._get_cron_secret() FROM PUBLIC, anon, authenticated;

-- 3. Rewrite the 4 cron jobs so they read the secret at run-time from the vault.
--    Job command uses format() with the decrypted secret resolved inside the SQL the cron runner executes.
SELECT cron.unschedule('auto-close-periods-daily');
SELECT cron.unschedule('trial-downgrade-hourly');
SELECT cron.unschedule('invite-reminders-hourly');
SELECT cron.unschedule('shift-reminders-every-15min');

SELECT cron.schedule(
  'auto-close-periods-daily',
  '0 5 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://jplhtputzixwqarqlrth.supabase.co/functions/v1/auto-close-periods',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public._get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'trial-downgrade-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://jplhtputzixwqarqlrth.supabase.co/functions/v1/trial-downgrade',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public._get_cron_secret()
    ),
    body := '{"time": "now"}'::jsonb
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'invite-reminders-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://jplhtputzixwqarqlrth.supabase.co/functions/v1/invite-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public._get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'shift-reminders-every-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://jplhtputzixwqarqlrth.supabase.co/functions/v1/shift-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public._get_cron_secret()
    ),
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $cron$
);
