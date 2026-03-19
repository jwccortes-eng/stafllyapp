
CREATE TABLE public.reconciliation_uat_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_status_id UUID NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  linked_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  linked_record_id TEXT,
  linked_step TEXT,
  reported_by UUID,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixed','retested','accepted','wontfix')),
  fix_notes TEXT,
  fixed_at TIMESTAMPTZ,
  retested_at TIMESTAMPTZ,
  retested_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_uat_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage UAT issues for their companies"
  ON public.reconciliation_uat_issues
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE INDEX idx_uat_issues_company_period ON public.reconciliation_uat_issues(company_id, period_status_id);
CREATE INDEX idx_uat_issues_status ON public.reconciliation_uat_issues(status);
