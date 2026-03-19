-- Persist manual ambiguous-name resolutions so re-normalization can deterministically apply user choices
CREATE TABLE IF NOT EXISTS public.reconciliation_name_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'all',
  scope_key text NOT NULL DEFAULT 'global',
  imported_name_raw text NOT NULL,
  imported_name_normalized text NOT NULL,
  selected_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  applies_to_rows text NOT NULL DEFAULT 'same_imported_name',
  resolution_source text NOT NULL DEFAULT 'manual_ambiguous_resolution',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_name_resolutions_source_type_chk
    CHECK (source_type IN ('all', 'schedule', 'clock', 'payroll')),
  CONSTRAINT reconciliation_name_resolutions_scope_key_chk
    CHECK (char_length(trim(scope_key)) > 0),
  CONSTRAINT reconciliation_name_resolutions_name_norm_chk
    CHECK (char_length(trim(imported_name_normalized)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_name_resolutions_unique_scope
  ON public.reconciliation_name_resolutions (company_id, source_type, scope_key, imported_name_normalized);

CREATE INDEX IF NOT EXISTS reconciliation_name_resolutions_selected_employee_idx
  ON public.reconciliation_name_resolutions (selected_employee_id);

ALTER TABLE public.reconciliation_name_resolutions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_name_resolutions'
      AND policyname = 'Company users can view reconciliation name resolutions'
  ) THEN
    CREATE POLICY "Company users can view reconciliation name resolutions"
      ON public.reconciliation_name_resolutions
      FOR SELECT
      USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_name_resolutions'
      AND policyname = 'Company users can insert reconciliation name resolutions'
  ) THEN
    CREATE POLICY "Company users can insert reconciliation name resolutions"
      ON public.reconciliation_name_resolutions
      FOR INSERT
      WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_name_resolutions'
      AND policyname = 'Company users can update reconciliation name resolutions'
  ) THEN
    CREATE POLICY "Company users can update reconciliation name resolutions"
      ON public.reconciliation_name_resolutions
      FOR UPDATE
      USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
      WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_name_resolutions'
      AND policyname = 'Company users can delete reconciliation name resolutions'
  ) THEN
    CREATE POLICY "Company users can delete reconciliation name resolutions"
      ON public.reconciliation_name_resolutions
      FOR DELETE
      USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_reconciliation_name_resolutions_updated_at
  ON public.reconciliation_name_resolutions;

CREATE TRIGGER update_reconciliation_name_resolutions_updated_at
  BEFORE UPDATE ON public.reconciliation_name_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();