-- P0.3 — Delivery truth: accepted (API) != sent (provider dispatch)

ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
  CHECK (status = ANY (ARRAY[
    'created','pending','queued','accepted','sent','delivered',
    'rejected','failed','suppressed','bounced','complained','rate_limited','dlq'
  ]));

-- Reconciliación auditable de los intentos QA del 2026-09-04 rechazados por el
-- proveedor (dominio remitente sin verificar). No se borran: se corrigen.
UPDATE public.email_send_log
SET status = 'rejected',
    error_message = 'DOMAIN_UNVERIFIED: notify.staflyapps.com is not allowed to send (unverified sender domain). Reconciliado en P0.3.',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'p0_3_reconciled', true,
      'provider_event', 'rejected',
      'failure_code', 'DOMAIN_UNVERIFIED'
    )
WHERE id IN (
  'b3dd5b55-b0de-4700-b55f-c016744c3e55',
  'df7d7f93-e427-4e1e-9348-49e512369a8f',
  'f9e1ae44-86c0-49bf-b051-a27b9c53ea64'
);

-- El índice único de "sent" ya no debe premiar la simple aceptación del API.
DROP INDEX IF EXISTS public.idx_email_send_log_message_sent_unique;
CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique
  ON public.email_send_log (message_id)
  WHERE status IN ('sent','delivered');

CREATE OR REPLACE FUNCTION public.sync_invitation_status_from_email_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation_id uuid;
BEGIN
  IF NEW.template_name <> 'invite_email' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_invitation_id
  FROM public.employee_invitations
  WHERE provider_message_id = NEW.message_id
  LIMIT 1;

  IF v_invitation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'accepted' THEN
    -- Aceptado por el API: todavía NO es entrega.
    UPDATE public.employee_invitations
    SET status = 'queued',
        last_attempt_at = now(),
        last_error = NULL
    WHERE id = v_invitation_id
      AND status NOT IN ('accepted','sent','delivered','opened');
  ELSIF NEW.status = 'sent' THEN
    UPDATE public.employee_invitations
    SET status = 'sent',
        last_attempt_at = now(),
        last_error = NULL
    WHERE id = v_invitation_id
      AND status NOT IN ('accepted','opened','delivered');
  ELSIF NEW.status = 'delivered' THEN
    UPDATE public.employee_invitations
    SET status = 'delivered',
        delivered_at = COALESCE(delivered_at, now()),
        last_attempt_at = now(),
        last_error = NULL
    WHERE id = v_invitation_id
      AND status NOT IN ('accepted','opened');
  ELSIF NEW.status IN ('failed','rejected','dlq') THEN
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

CREATE OR REPLACE FUNCTION public.sync_invitation_from_email_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation_id uuid;
  v_new_status text;
BEGIN
  IF NEW.template_name IS NULL OR NEW.template_name NOT IN ('invite_email', 'portal_activation') THEN
    RETURN NEW;
  END IF;

  v_invitation_id := NULLIF((NEW.metadata->>'invitation_id'), '')::uuid;
  IF v_invitation_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_status := CASE NEW.status
    WHEN 'accepted' THEN 'queued'
    WHEN 'sent' THEN 'sent'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'rejected' THEN 'failed'
    WHEN 'failed' THEN 'failed'
    WHEN 'dlq' THEN 'dlq'
    WHEN 'bounced' THEN 'bounced'
    WHEN 'suppressed' THEN 'suppressed'
    WHEN 'pending' THEN 'queued'
    WHEN 'queued' THEN 'queued'
    WHEN 'rate_limited' THEN 'queued'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.employee_invitations
  SET
    status = v_new_status,
    last_error = CASE WHEN NEW.status IN ('failed','rejected','dlq','bounced','suppressed') THEN NEW.error_message ELSE last_error END,
    failed_at = CASE WHEN NEW.status IN ('failed','rejected','dlq','bounced') THEN NOW() ELSE failed_at END,
    -- Solo un evento real de entrega marca delivered_at.
    delivered_at = CASE WHEN NEW.status = 'delivered' THEN NOW() ELSE delivered_at END,
    last_attempt_at = NOW()
  WHERE id = v_invitation_id;

  RETURN NEW;
END;
$$;

-- Los eventos tardíos del proveedor llegan como UPDATE del registro: los
-- disparadores deben reaccionar también a esos cambios de estado.
DROP TRIGGER IF EXISTS sync_invitation_status_trigger ON public.email_send_log;
CREATE TRIGGER sync_invitation_status_trigger
AFTER INSERT OR UPDATE OF status ON public.email_send_log
FOR EACH ROW EXECUTE FUNCTION public.sync_invitation_status_from_email_log();

DROP TRIGGER IF EXISTS trg_sync_invitation_from_email_log ON public.email_send_log;
CREATE TRIGGER trg_sync_invitation_from_email_log
AFTER INSERT OR UPDATE OF status ON public.email_send_log
FOR EACH ROW EXECUTE FUNCTION public.sync_invitation_from_email_log();