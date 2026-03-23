
-- Reconciliation Batches
CREATE TABLE public.reconciliation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  payroll_period_start date,
  payroll_period_end date,
  payroll_date date,
  payroll_corte text,
  truth_source_file_url text,
  truth_source_file_name text,
  truth_source_uploaded_at timestamptz,
  employees_truth_count int DEFAULT 0,
  employees_system_count int DEFAULT 0,
  matched_count int DEFAULT 0,
  unmatched_truth_count int DEFAULT 0,
  unmatched_system_count int DEFAULT 0,
  exact_match_count int DEFAULT 0,
  mismatch_count int DEFAULT 0,
  component_mismatch_count int DEFAULT 0,
  critical_mismatch_count int DEFAULT 0,
  total_variance_amount numeric DEFAULT 0,
  totals_truth_json jsonb DEFAULT '{}',
  totals_system_json jsonb DEFAULT '{}',
  totals_variance_json jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'DRAFT',
  notes text,
  tolerance_hours numeric DEFAULT 0.10,
  tolerance_money numeric DEFAULT 1.00,
  tolerance_tips numeric DEFAULT 0.50,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  locked_at timestamptz
);

ALTER TABLE public.reconciliation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage reconciliation_batches for their companies"
  ON public.reconciliation_batches FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Reconciliation Employee Rows
CREATE TABLE public.reconciliation_employee_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.reconciliation_batches(id) ON DELETE CASCADE,
  employer_identification text,
  verification_ssn_ein text,
  employer_identification_normalized text,
  verification_ssn_ein_normalized text,
  first_name text,
  last_name text,
  full_name_normalized text,
  phone text,
  email text,
  employee_external_id text,
  matched_system_employee_id uuid REFERENCES public.employees(id),
  match_status text DEFAULT 'UNMATCHED',
  match_confidence int DEFAULT 0,
  matched_by text,
  match_notes text,
  truth_total_hours numeric,
  truth_total_pay numeric,
  truth_pay_per_day numeric,
  truth_ryde numeric,
  truth_tips numeric,
  truth_reimbursements numeric,
  truth_total numeric,
  truth_observaciones text,
  truth_date text,
  truth_corte text,
  truth_raw_json jsonb,
  system_total_hours numeric,
  system_total_pay numeric,
  system_pay_per_day numeric,
  system_ryde numeric,
  system_tips numeric,
  system_reimbursements numeric,
  system_total numeric,
  system_date_range text,
  system_source_summary_json jsonb,
  variance_hours numeric,
  variance_total_pay numeric,
  variance_pay_per_day numeric,
  variance_ryde numeric,
  variance_tips numeric,
  variance_reimbursements numeric,
  variance_total numeric,
  row_status text DEFAULT 'PENDING',
  is_exact_match boolean DEFAULT false,
  has_component_mismatch boolean DEFAULT false,
  has_critical_mismatch boolean DEFAULT false,
  has_manual_adjustment boolean DEFAULT false,
  anomaly_flags_json jsonb DEFAULT '[]',
  shift_count int DEFAULT 0,
  clock_count int DEFAULT 0,
  source_tags text[] DEFAULT '{}',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  excluded_from_reconciliation boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_employee_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage reconciliation_employee_rows via batch"
  ON public.reconciliation_employee_rows FOR ALL TO authenticated
  USING (batch_id IN (SELECT id FROM public.reconciliation_batches WHERE company_id IN (SELECT public.user_company_ids(auth.uid()))))
  WITH CHECK (batch_id IN (SELECT id FROM public.reconciliation_batches WHERE company_id IN (SELECT public.user_company_ids(auth.uid()))));

-- Reconciliation Audit Log
CREATE TABLE public.reconciliation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.reconciliation_batches(id) ON DELETE CASCADE,
  employee_row_id uuid REFERENCES public.reconciliation_employee_rows(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  previous_value text,
  new_value text,
  performed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage reconciliation_audit_log via batch"
  ON public.reconciliation_audit_log FOR ALL TO authenticated
  USING (batch_id IN (SELECT id FROM public.reconciliation_batches WHERE company_id IN (SELECT public.user_company_ids(auth.uid()))))
  WITH CHECK (batch_id IN (SELECT id FROM public.reconciliation_batches WHERE company_id IN (SELECT public.user_company_ids(auth.uid()))));

-- Indexes
CREATE INDEX idx_recon_batches_company ON public.reconciliation_batches(company_id);
CREATE INDEX idx_recon_rows_batch ON public.reconciliation_employee_rows(batch_id);
CREATE INDEX idx_recon_rows_match ON public.reconciliation_employee_rows(match_status);
CREATE INDEX idx_recon_audit_batch ON public.reconciliation_audit_log(batch_id);
