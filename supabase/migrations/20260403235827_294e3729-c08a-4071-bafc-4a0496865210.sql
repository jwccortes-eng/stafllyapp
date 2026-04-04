-- Add invite_token and expires_at to employee_invitations
ALTER TABLE public.employee_invitations
  ADD COLUMN IF NOT EXISTS invite_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days');

-- Unique index for token lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_invitations_token ON public.employee_invitations (invite_token);

-- Allow public read of invitation by token (for acceptance page)
CREATE POLICY "Anyone can read invitation by token"
  ON public.employee_invitations
  FOR SELECT
  USING (true);