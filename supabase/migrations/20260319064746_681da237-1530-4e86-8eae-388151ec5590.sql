
-- =============================================
-- STAGED RECONCILIATION ENGINE v2
-- =============================================

-- 1. RAW IMPORT TABLES
CREATE TABLE public.raw_schedule_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL,
  row_hash text,
  is_duplicate boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_schedule_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_raw_schedule" ON public.raw_schedule_import_rows
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE TABLE public.raw_clock_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL,
  row_hash text,
  is_duplicate boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_clock_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_raw_clock" ON public.raw_clock_import_rows
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE TABLE public.raw_payroll_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL,
  row_hash text,
  is_duplicate boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_payroll_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_raw_payroll" ON public.raw_payroll_import_rows
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 2. NORMALIZED TABLES
CREATE TABLE public.normalized_schedule_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_row_id uuid NOT NULL REFERENCES public.raw_schedule_import_rows(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  matched_employee_id uuid REFERENCES public.employees(id),
  employee_name_raw text,
  employee_name_normalized text,
  employee_phone text,
  employee_email text,
  employee_match_confidence numeric DEFAULT 0,
  employee_match_method text,
  work_date date,
  start_time time,
  end_time time,
  total_hours numeric,
  client_name text,
  location_name text,
  shift_title text,
  external_shift_id text,
  pay_type text,
  notes text,
  has_conflict boolean DEFAULT false,
  conflict_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.normalized_schedule_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_norm_schedule" ON public.normalized_schedule_rows
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE TABLE public.normalized_clock_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_row_id uuid NOT NULL REFERENCES public.raw_clock_import_rows(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  matched_employee_id uuid REFERENCES public.employees(id),
  employee_name_raw text,
  employee_name_normalized text,
  employee_phone text,
  employee_email text,
  employee_match_confidence numeric DEFAULT 0,
  employee_match_method text,
  work_date date,
  clock_in timestamptz,
  clock_out timestamptz,
  total_hours numeric,
  break_minutes numeric DEFAULT 0,
  location_name text,
  client_name text,
  external_clock_id text,
  clock_method text,
  notes text,
  has_conflict boolean DEFAULT false,
  conflict_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.normalized_clock_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_norm_clock" ON public.normalized_clock_rows
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE TABLE public.normalized_payroll_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_row_id uuid NOT NULL REFERENCES public.raw_payroll_import_rows(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  matched_employee_id uuid REFERENCES public.employees(id),
  employee_name_raw text,
  employee_name_normalized text,
  employee_phone text,
  employee_email text,
  employee_match_confidence numeric DEFAULT 0,
  employee_match_method text,
  work_date date,
  total_hours numeric,
  hourly_rate numeric,
  total_pay numeric,
  pay_type text,
  ride_amount numeric DEFAULT 0,
  weekend_amount numeric DEFAULT 0,
  manual_amount numeric DEFAULT 0,
  base_pay numeric DEFAULT 0,
  notes text,
  has_conflict boolean DEFAULT false,
  conflict_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.normalized_payroll_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_norm_payroll" ON public.normalized_payroll_rows
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 3. RECONCILIATION MATCHES
CREATE TABLE public.reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  batch_id uuid REFERENCES public.import_batches(id),
  period_id uuid REFERENCES public.pay_periods(id),
  match_type text NOT NULL,
  schedule_row_id uuid REFERENCES public.normalized_schedule_rows(id),
  clock_row_id uuid REFERENCES public.normalized_clock_rows(id),
  payroll_row_id uuid REFERENCES public.normalized_payroll_rows(id),
  employee_id uuid REFERENCES public.employees(id),
  confidence_score numeric NOT NULL DEFAULT 0,
  match_status text NOT NULL DEFAULT 'pending',
  hours_variance numeric,
  pay_variance numeric,
  conflict_flags jsonb DEFAULT '[]'::jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_recon_matches" ON public.reconciliation_matches
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 4. RECONCILIATION EXCEPTIONS
CREATE TABLE public.reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  batch_id uuid REFERENCES public.import_batches(id),
  period_id uuid REFERENCES public.pay_periods(id),
  exception_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  source_type text,
  source_row_id uuid,
  employee_id uuid REFERENCES public.employees(id),
  description text,
  source_data jsonb,
  suggested_resolution text,
  status text NOT NULL DEFAULT 'open',
  resolution_action text,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_recon_exceptions" ON public.reconciliation_exceptions
  FOR ALL TO authenticated USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 5. INDEXES
CREATE INDEX idx_raw_sched_batch ON public.raw_schedule_import_rows(batch_id);
CREATE INDEX idx_raw_clock_batch ON public.raw_clock_import_rows(batch_id);
CREATE INDEX idx_raw_pay_batch ON public.raw_payroll_import_rows(batch_id);
CREATE INDEX idx_norm_sched_batch ON public.normalized_schedule_rows(batch_id, company_id);
CREATE INDEX idx_norm_clock_batch ON public.normalized_clock_rows(batch_id, company_id);
CREATE INDEX idx_norm_pay_batch ON public.normalized_payroll_rows(batch_id, company_id);
CREATE INDEX idx_norm_sched_emp ON public.normalized_schedule_rows(matched_employee_id);
CREATE INDEX idx_norm_clock_emp ON public.normalized_clock_rows(matched_employee_id);
CREATE INDEX idx_norm_pay_emp ON public.normalized_payroll_rows(matched_employee_id);
CREATE INDEX idx_recon_match_co ON public.reconciliation_matches(company_id, period_id);
CREATE INDEX idx_recon_exc_co ON public.reconciliation_exceptions(company_id, status);
CREATE INDEX idx_raw_sched_hash ON public.raw_schedule_import_rows(row_hash);
CREATE INDEX idx_raw_clock_hash ON public.raw_clock_import_rows(row_hash);
CREATE INDEX idx_raw_pay_hash ON public.raw_payroll_import_rows(row_hash);
