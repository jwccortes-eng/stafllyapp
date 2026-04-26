-- 1. Helper to get or create unsubscribe token per email address
CREATE OR REPLACE FUNCTION public.get_or_create_unsubscribe_token(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT token INTO v_token
  FROM public.email_unsubscribe_tokens
  WHERE email = lower(p_email)
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.email_unsubscribe_tokens (email, token)
  VALUES (lower(p_email), v_token)
  ON CONFLICT (email) DO UPDATE SET token = EXCLUDED.token
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_unsubscribe_token(text) TO service_role, authenticated;

-- Ensure email column has unique index for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribe_tokens_email_unique
  ON public.email_unsubscribe_tokens (lower(email));

-- 2. Trigger: sync employee_invitations.status from email_send_log
CREATE OR REPLACE FUNCTION public.sync_invitation_status_from_email_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation_id uuid;
  v_new_status text;
BEGIN
  -- Only act on invitation-related templates
  IF NEW.template_name IS NULL OR NEW.template_name NOT IN ('invite_email', 'portal_activation') THEN
    RETURN NEW;
  END IF;

  -- Find invitation_id from metadata
  v_invitation_id := NULLIF((NEW.metadata->>'invitation_id'), '')::uuid;
  IF v_invitation_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map email_send_log status to invitation status
  v_new_status := CASE NEW.status
    WHEN 'sent' THEN 'sent'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'failed' THEN 'failed'
    WHEN 'dlq' THEN 'dlq'
    WHEN 'bounced' THEN 'bounced'
    WHEN 'pending' THEN 'queued'
    WHEN 'rate_limited' THEN 'queued'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.employee_invitations
  SET
    status = v_new_status,
    last_error = CASE WHEN NEW.status IN ('failed','dlq','bounced') THEN NEW.error_message ELSE last_error END,
    failed_at = CASE WHEN NEW.status IN ('failed','dlq','bounced') THEN NOW() ELSE failed_at END,
    delivered_at = CASE WHEN NEW.status IN ('sent','delivered') THEN NOW() ELSE delivered_at END,
    last_attempt_at = NOW()
  WHERE id = v_invitation_id
    -- Don't downgrade accepted/opened
    AND status NOT IN ('accepted', 'opened');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_invitation_status_trigger ON public.email_send_log;
CREATE TRIGGER sync_invitation_status_trigger
AFTER INSERT ON public.email_send_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_invitation_status_from_email_log();

-- 3. Backfill: mark already-failed invitations as failed
UPDATE public.employee_invitations ei
SET status = 'failed',
    last_error = COALESCE(ei.last_error, 'Email delivery failed (backfilled from email_send_log)'),
    failed_at = COALESCE(ei.failed_at, NOW())
FROM (
  SELECT DISTINCT (metadata->>'invitation_id')::uuid AS invitation_id
  FROM public.email_send_log
  WHERE template_name = 'invite_email'
    AND status = 'dlq'
    AND metadata->>'invitation_id' IS NOT NULL
) failed
WHERE ei.id = failed.invitation_id
  AND ei.status IN ('sent', 'queued', 'created')
  AND ei.accepted_at IS NULL;