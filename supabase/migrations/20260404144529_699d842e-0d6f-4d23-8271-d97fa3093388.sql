
-- Add opened_at column
ALTER TABLE public.employee_invitations
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

-- Rename activated_at → accepted_at
ALTER TABLE public.employee_invitations
  RENAME COLUMN activated_at TO accepted_at;

-- Change default status from 'sent' to 'created'
ALTER TABLE public.employee_invitations
  ALTER COLUMN status SET DEFAULT 'created';

-- Normalize any existing 'activated' statuses to 'accepted'
UPDATE public.employee_invitations SET status = 'accepted' WHERE status = 'activated';

-- Document the status lifecycle
COMMENT ON COLUMN public.employee_invitations.status IS 'Lifecycle: created → sent → opened → accepted | expired | revoked | failed';
