-- 1) Extend shift_assignments.status to support 'no_show' explicitly
-- (no CHECK constraint exists; column is plain text. We add a check that allows the documented values.)
DO $$
BEGIN
  -- drop any prior check we added previously to avoid duplicate constraint errors
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shift_assignments_status_check'
      AND conrelid = 'public.shift_assignments'::regclass
  ) THEN
    ALTER TABLE public.shift_assignments DROP CONSTRAINT shift_assignments_status_check;
  END IF;
END$$;

ALTER TABLE public.shift_assignments
  ADD CONSTRAINT shift_assignments_status_check
  CHECK (status IN ('pending','accepted','rejected','removed','no_show','confirmed'));

COMMENT ON COLUMN public.shift_assignments.status IS
  'Lifecycle of the assignment. no_show = explicitly marked by an admin as not attended (overrides clock/manual evidence).';

-- 2) Source-of-truth flag on time_entries so we can distinguish a real punch from
--    a manual administrative resolution. Defaults to 'clock' for backward compatibility.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'clock';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'time_entries_entry_source_check'
      AND conrelid = 'public.time_entries'::regclass
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_entry_source_check
      CHECK (entry_source IN ('clock','manual','daypay','import'));
  END IF;
END$$;

COMMENT ON COLUMN public.time_entries.entry_source IS
  'Where this entry came from: clock (real punch), manual (admin resolution), daypay (daily/weekend job confirmation), import (Connecteam or other external source).';

-- 3) Helpful indices for the coverage hook
CREATE INDEX IF NOT EXISTS idx_time_entries_company_shift
  ON public.time_entries(company_id, shift_id) WHERE shift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_company_shift
  ON public.shift_assignments(company_id, shift_id);