
-- Table to persist resolution decisions for unmatched truth rows
CREATE TABLE public.truth_resolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_status_id TEXT NOT NULL,
  truth_employee_name TEXT NOT NULL,
  truth_total NUMERIC DEFAULT 0,
  truth_hours NUMERIC DEFAULT NULL,
  resolution_mode TEXT NOT NULL CHECK (resolution_mode IN ('create', 'link', 'truth_only')),
  resolved_employee_id UUID DEFAULT NULL,
  resolved_by UUID NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT DEFAULT NULL,
  truth_raw_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups per period
CREATE INDEX idx_truth_resolution_log_period ON public.truth_resolution_log(company_id, period_status_id);

-- RLS
ALTER TABLE public.truth_resolution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view resolutions for their companies"
  ON public.truth_resolution_log
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Users can insert resolutions for their companies"
  ON public.truth_resolution_log
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));
