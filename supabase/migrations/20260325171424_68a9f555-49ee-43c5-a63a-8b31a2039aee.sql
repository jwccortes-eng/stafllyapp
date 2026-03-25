-- 1. Known mismatch patterns registry: the system learns from each close
CREATE TABLE IF NOT EXISTS public.reconciliation_known_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  pattern_key text NOT NULL,
  pattern_label text NOT NULL,
  description text,
  auto_resolution text,
  match_criteria jsonb NOT NULL DEFAULT '{}',
  times_seen integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(company_id, pattern_key)
);
ALTER TABLE public.reconciliation_known_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users can view patterns" ON public.reconciliation_known_patterns
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins can manage patterns" ON public.reconciliation_known_patterns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Closure quality log: tracks improvement metrics per close
CREATE TABLE IF NOT EXISTS public.closure_quality_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  period_id uuid NOT NULL,
  period_status_id uuid,
  closed_at timestamptz NOT NULL DEFAULT now(),
  total_employees integer NOT NULL DEFAULT 0,
  auto_approved integer NOT NULL DEFAULT 0,
  truth_validated integer NOT NULL DEFAULT 0,
  manual_review integer NOT NULL DEFAULT 0,
  known_pattern_resolved integer NOT NULL DEFAULT 0,
  new_patterns_detected integer NOT NULL DEFAULT 0,
  anomalous_clocks_suppressed integer NOT NULL DEFAULT 0,
  closure_confidence_pct numeric DEFAULT 0,
  notes text,
  created_by uuid
);
ALTER TABLE public.closure_quality_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users can view closure quality" ON public.closure_quality_log
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins can insert closure quality" ON public.closure_quality_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Add anomaly flags to period_base_pay
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'period_base_pay' AND column_name = 'anomaly_flags') THEN
    ALTER TABLE public.period_base_pay ADD COLUMN anomaly_flags jsonb DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'period_base_pay' AND column_name = 'is_anomalous') THEN
    ALTER TABLE public.period_base_pay ADD COLUMN is_anomalous boolean DEFAULT false;
  END IF;
END $$;