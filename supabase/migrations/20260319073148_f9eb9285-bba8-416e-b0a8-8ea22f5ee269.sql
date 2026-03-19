
-- Business Rules Tuning table
CREATE TABLE IF NOT EXISTS public.reconciliation_business_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  rule_key text NOT NULL,
  rule_label text NOT NULL,
  rule_type text NOT NULL DEFAULT 'classification',
  match_field text NOT NULL DEFAULT 'amount',
  match_operator text NOT NULL DEFAULT 'equals',
  match_value text NOT NULL,
  result_pay_type text NOT NULL,
  result_description text,
  applies_to_employee uuid REFERENCES public.employees(id),
  priority int NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, rule_key)
);

ALTER TABLE public.reconciliation_business_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage business rules"
  ON public.reconciliation_business_rules
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Learned Rules table (saved from variance corrections)
CREATE TABLE IF NOT EXISTS public.reconciliation_learned_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  source_type text NOT NULL DEFAULT 'variance_correction',
  rule_label text NOT NULL,
  match_criteria jsonb NOT NULL DEFAULT '{}',
  result_action jsonb NOT NULL DEFAULT '{}',
  employee_id uuid REFERENCES public.employees(id),
  usage_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_learned_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage learned rules"
  ON public.reconciliation_learned_rules
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Pilot comparison reports
CREATE TABLE IF NOT EXISTS public.reconciliation_pilot_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  period_status_id uuid NOT NULL,
  report_data jsonb NOT NULL DEFAULT '{}',
  go_live_readiness text NOT NULL DEFAULT 'not_ready',
  payroll_match_pct numeric DEFAULT 0,
  employee_exact_match_pct numeric DEFAULT 0,
  unresolved_critical int DEFAULT 0,
  unresolved_warnings int DEFAULT 0,
  manual_intervention_count int DEFAULT 0,
  learned_rules_created int DEFAULT 0,
  publish_confidence numeric DEFAULT 0,
  recommendation text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_pilot_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage pilot reports"
  ON public.reconciliation_pilot_reports
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
