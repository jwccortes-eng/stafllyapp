-- Add import_batch_id traceability to scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL
    REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_import_batch
  ON public.scheduled_shifts(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Add import_batch_id traceability to shift_assignments
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL
    REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_import_batch
  ON public.shift_assignments(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Helpful index for the new mapping lookups by stafly_shift_id
CREATE INDEX IF NOT EXISTS idx_migration_shift_mapping_stafly_shift
  ON public.migration_shift_mapping(stafly_shift_id)
  WHERE stafly_shift_id IS NOT NULL;