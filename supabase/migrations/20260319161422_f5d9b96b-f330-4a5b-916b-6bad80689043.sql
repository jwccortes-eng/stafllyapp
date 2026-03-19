
-- Add formal signoff fields and outcome label to reconciliation_period_status
ALTER TABLE public.reconciliation_period_status
  ADD COLUMN IF NOT EXISTS reconciled_by uuid,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_note text,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_note text,
  ADD COLUMN IF NOT EXISTS approved_note text,
  ADD COLUMN IF NOT EXISTS posted_note text,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_note text,
  ADD COLUMN IF NOT EXISTS outcome_label text,
  ADD COLUMN IF NOT EXISTS golive_checklist jsonb DEFAULT '{}'::jsonb;
