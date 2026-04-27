CREATE OR REPLACE FUNCTION public.validate_invitation_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN (
    'created', 'queued', 'processing', 'sent', 'provider_accepted', 'delivered',
    'opened', 'accepted', 'expired', 'revoked', 'superseded', 'failed', 'bounced', 'dlq', 'resent'
  ) THEN
    RAISE EXCEPTION 'Invalid invitation status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;