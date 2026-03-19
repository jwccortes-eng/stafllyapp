
-- Phase 4: Validation & Verification tables

-- 1. Validation test results
CREATE TABLE IF NOT EXISTS public.reconciliation_validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  period_status_id uuid NOT NULL,
  tested_by uuid NOT NULL,
  tested_at timestamptz NOT NULL DEFAULT now(),
  is_dry_run boolean NOT NULL DEFAULT true,
  total_employees int DEFAULT 0,
  employees_exact_match int DEFAULT 0,
  employees_minor_variance int DEFAULT 0,
  employees_major_variance int DEFAULT 0,
  employees_unresolved int DEFAULT 0,
  source_payroll_total numeric DEFAULT 0,
  reconciled_total numeric DEFAULT 0,
  published_total numeric DEFAULT 0,
  total_variance numeric DEFAULT 0,
  unresolved_exceptions int DEFAULT 0,
  publish_readiness text DEFAULT 'blocked',
  confidence_score numeric DEFAULT 0,
  uat_checklist jsonb DEFAULT '{}',
  employee_variances jsonb DEFAULT '[]',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_validation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view validation results"
  ON public.reconciliation_validation_results
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company users can insert validation results"
  ON public.reconciliation_validation_results
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 2. Add variance fields to reconciliation_final_records
ALTER TABLE public.reconciliation_final_records
  ADD COLUMN IF NOT EXISTS source_payroll_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS variance_reasons jsonb DEFAULT '[]';
