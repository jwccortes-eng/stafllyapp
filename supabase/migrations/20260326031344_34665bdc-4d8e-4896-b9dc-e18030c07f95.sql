ALTER TABLE public.reconciliation_batches 
ADD COLUMN IF NOT EXISTS reconciliation_mode text NOT NULL DEFAULT 'standard';