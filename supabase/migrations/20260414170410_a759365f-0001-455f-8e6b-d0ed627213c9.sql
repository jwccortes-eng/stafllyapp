
-- Add delivery tracking columns to employee_invitations
ALTER TABLE public.employee_invitations
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_recipient text;

-- Update status check constraint to allow new lifecycle statuses
-- First drop existing constraint if any, then add new one
DO $$
BEGIN
  -- Try to drop any existing check constraint on status
  BEGIN
    ALTER TABLE public.employee_invitations DROP CONSTRAINT IF EXISTS employee_invitations_status_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END$$;

-- Create a validation trigger for status values instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_invitation_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN (
    'created', 'queued', 'sent', 'provider_accepted', 'delivered',
    'opened', 'accepted', 'expired', 'revoked', 'failed', 'bounced', 'resent'
  ) THEN
    RAISE EXCEPTION 'Invalid invitation status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invitation_status ON public.employee_invitations;
CREATE TRIGGER trg_validate_invitation_status
  BEFORE INSERT OR UPDATE ON public.employee_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invitation_status();
