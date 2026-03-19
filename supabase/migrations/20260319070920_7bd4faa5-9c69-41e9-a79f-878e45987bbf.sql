
-- =====================================================
-- Phase 2: Operational Reconciliation Tables
-- =====================================================

-- 1. Period Reconciliation Status
CREATE TABLE public.reconciliation_period_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id uuid REFERENCES pay_periods(id) ON DELETE SET NULL,
  period_label text NOT NULL DEFAULT '',
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'importing' CHECK (status IN ('importing','normalizing','matching','reviewing','approved','posted','locked')),
  schedule_batch_id uuid REFERENCES import_batches(id),
  clock_batch_id uuid REFERENCES import_batches(id),
  payroll_batch_id uuid REFERENCES import_batches(id),
  total_employees integer DEFAULT 0,
  total_schedules integer DEFAULT 0,
  total_clocks integer DEFAULT 0,
  total_payroll_rows integer DEFAULT 0,
  total_exceptions integer DEFAULT 0,
  resolved_exceptions integer DEFAULT 0,
  total_matches integer DEFAULT 0,
  approved_matches integer DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  posted_by uuid,
  posted_at timestamptz,
  locked boolean DEFAULT false,
  locked_by uuid,
  locked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Final Reconciliation Records (per employee per period)
CREATE TABLE public.reconciliation_final_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_status_id uuid NOT NULL REFERENCES reconciliation_period_status(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  scheduled_shifts jsonb DEFAULT '[]',
  worked_shifts jsonb DEFAULT '[]',
  payroll_rows jsonb DEFAULT '[]',
  total_scheduled_hours numeric DEFAULT 0,
  total_worked_hours numeric DEFAULT 0,
  total_payroll_hours numeric DEFAULT 0,
  total_payroll_amount numeric DEFAULT 0,
  pay_classification text DEFAULT 'unknown',
  hourly_rate numeric,
  daily_rate numeric,
  ride_amount numeric DEFAULT 0,
  weekend_amount numeric DEFAULT 0,
  manual_amount numeric DEFAULT 0,
  base_pay numeric DEFAULT 0,
  final_total_pay numeric DEFAULT 0,
  reconciliation_status text NOT NULL DEFAULT 'pending' CHECK (reconciliation_status IN ('pending','partial','resolved','approved','posted')),
  conflict_count integer DEFAULT 0,
  resolution_notes text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_status_id, employee_id)
);

-- 3. Row-level Resolution Actions
CREATE TABLE public.reconciliation_row_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_status_id uuid REFERENCES reconciliation_period_status(id),
  match_id uuid REFERENCES reconciliation_matches(id),
  exception_id uuid REFERENCES reconciliation_exceptions(id),
  source_row_id uuid,
  target_row_id uuid,
  employee_id uuid REFERENCES employees(id),
  action_type text NOT NULL CHECK (action_type IN ('link','split','merge','classify','ignore','mark_duplicate','mark_not_worked','mark_manual','assign_employee','reassign_pay_type','create_shift','attach_clock')),
  action_data jsonb DEFAULT '{}',
  reason text,
  performed_by uuid NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Learned Mapping Corrections
CREATE TABLE public.reconciliation_learned_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mapping_type text NOT NULL CHECK (mapping_type IN ('employee_name','employee_phone','client_name','location_name','pay_type','job_title')),
  source_value text NOT NULL,
  source_value_normalized text NOT NULL,
  target_id text,
  target_value text NOT NULL,
  usage_count integer DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, mapping_type, source_value_normalized)
);

-- RLS Policies
ALTER TABLE public.reconciliation_period_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_final_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_row_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_learned_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_recon_period_status" ON public.reconciliation_period_status FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())));
CREATE POLICY "rls_recon_final_records" ON public.reconciliation_final_records FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())));
CREATE POLICY "rls_recon_row_actions" ON public.reconciliation_row_actions FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())));
CREATE POLICY "rls_recon_learned_mappings" ON public.reconciliation_learned_mappings FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())));

-- Add source_row_id to reconciliation_exceptions if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reconciliation_exceptions' AND column_name='source_row_id') THEN
    ALTER TABLE reconciliation_exceptions ADD COLUMN source_row_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reconciliation_exceptions' AND column_name='batch_id') THEN
    ALTER TABLE reconciliation_exceptions ADD COLUMN batch_id uuid REFERENCES import_batches(id);
  END IF;
END $$;
