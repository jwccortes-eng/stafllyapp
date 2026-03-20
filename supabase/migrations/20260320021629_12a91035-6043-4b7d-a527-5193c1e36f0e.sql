
CREATE TABLE public.payroll_concept_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  match_field TEXT NOT NULL DEFAULT 'pay_type',
  target_type TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.payroll_concept_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage mappings for their companies"
  ON public.payroll_concept_mappings
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE INDEX idx_pcm_company ON public.payroll_concept_mappings(company_id);

-- Seed default global-ish mappings (will be company-scoped via insert)
