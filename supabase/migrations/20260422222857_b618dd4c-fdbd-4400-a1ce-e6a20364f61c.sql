-- Sync employee_invitations status from email_send_log so the UI shows
-- truthful delivery state (sent/failed/dlq) instead of staying stuck on "queued".
CREATE OR REPLACE FUNCTION public.sync_invitation_from_email_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation_id uuid;
BEGIN
  -- Only act on invite emails
  IF NEW.template_name <> 'invite_email' THEN
    RETURN NEW;
  END IF;

  -- Find the invitation linked to this message
  SELECT id INTO v_invitation_id
  FROM public.employee_invitations
  WHERE provider_message_id = NEW.message_id
  LIMIT 1;

  IF v_invitation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'sent' THEN
    UPDATE public.employee_invitations
    SET status = 'sent',
        delivered_at = COALESCE(delivered_at, now()),
        last_attempt_at = now(),
        last_error = NULL
    WHERE id = v_invitation_id
      AND status NOT IN ('accepted','opened','delivered');
  ELSIF NEW.status IN ('failed','dlq') THEN
    UPDATE public.employee_invitations
    SET status = 'failed',
        failed_at = now(),
        last_attempt_at = now(),
        last_error = COALESCE(NEW.error_message, 'Send failed'),
        attempts = COALESCE(attempts, 0) + 1
    WHERE id = v_invitation_id
      AND status NOT IN ('accepted');
  ELSIF NEW.status = 'bounced' THEN
    UPDATE public.employee_invitations
    SET status = 'bounced',
        failed_at = now(),
        last_error = COALESCE(NEW.error_message, 'Bounced'),
        bounce_reason = NEW.error_message
    WHERE id = v_invitation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invitation_from_email_log ON public.email_send_log;
CREATE TRIGGER trg_sync_invitation_from_email_log
AFTER INSERT ON public.email_send_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_invitation_from_email_log();