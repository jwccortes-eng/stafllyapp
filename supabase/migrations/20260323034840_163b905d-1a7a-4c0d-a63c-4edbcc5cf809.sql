
ALTER TABLE public.reconciliation_batches 
  ADD COLUMN IF NOT EXISTS health_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_grade text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS checklist_json jsonb DEFAULT NULL;
