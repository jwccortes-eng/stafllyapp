
CREATE TABLE public.reconciliation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_status_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  override_type TEXT NOT NULL, -- hourly, full_day, half_day, manual, pay_ride, etc.
  override_source TEXT NOT NULL DEFAULT 'manual', -- manual, variance_workbench
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_status_id, employee_id)
);

ALTER TABLE public.reconciliation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage overrides for their companies"
  ON public.reconciliation_overrides
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));
