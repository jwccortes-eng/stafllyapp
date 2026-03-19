
-- Employee aliases for reconciliation matching
CREATE TABLE IF NOT EXISTS public.employee_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  alias_name_normalized text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(company_id, alias_name_normalized)
);

ALTER TABLE public.employee_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view aliases for their companies"
  ON public.employee_aliases FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Users can insert aliases for their companies"
  ON public.employee_aliases FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Users can delete aliases for their companies"
  ON public.employee_aliases FOR DELETE TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE INDEX idx_employee_aliases_company ON public.employee_aliases(company_id);
CREATE INDEX idx_employee_aliases_normalized ON public.employee_aliases(company_id, alias_name_normalized);
