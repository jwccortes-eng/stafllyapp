
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_type TEXT NOT NULL DEFAULT 'unified', -- 'unified', 'schedule', 'timeclock', 'payroll'
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'rolled_back'
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID,
  -- Step 1: Schedules
  schedule_file_name TEXT,
  schedule_shifts_created INT DEFAULT 0,
  schedule_assignments_created INT DEFAULT 0,
  schedule_duplicates_skipped INT DEFAULT 0,
  schedule_clients_created INT DEFAULT 0,
  schedule_employees_created INT DEFAULT 0,
  schedule_weekend_jobs INT DEFAULT 0,
  schedule_payrides INT DEFAULT 0,
  schedule_unavailable INT DEFAULT 0,
  -- Step 2: Time Clock
  timeclock_file_name TEXT,
  timeclock_entries_created INT DEFAULT 0,
  timeclock_linked_shifts INT DEFAULT 0,
  timeclock_overlaps_skipped INT DEFAULT 0,
  timeclock_unpaid_skipped INT DEFAULT 0,
  -- Step 3: Payroll
  payroll_file_name TEXT,
  payroll_movements_created INT DEFAULT 0,
  payroll_duplicates_skipped INT DEFAULT 0,
  -- Shared
  unmatched_employees JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  errors JSONB DEFAULT '[]'::jsonb,
  date_range_from DATE,
  date_range_to DATE
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view import batches for their companies"
  ON public.import_batches FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert import batches for their companies"
  ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update import batches for their companies"
  ON public.import_batches FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));
