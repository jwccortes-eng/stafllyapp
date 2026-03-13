ALTER TABLE public.scheduled_shifts ADD COLUMN IF NOT EXISTS reconciliation_hash text;

CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_recon_hash ON public.scheduled_shifts(reconciliation_hash) WHERE reconciliation_hash IS NOT NULL;