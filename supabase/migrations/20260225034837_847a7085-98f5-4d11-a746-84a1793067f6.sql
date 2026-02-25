
-- Table to control which modules are active per company
CREATE TABLE public.company_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  activated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, module)
);

ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

-- Owners can manage all
CREATE POLICY "Owners can manage company modules"
  ON public.company_modules FOR ALL
  USING (is_global_owner(auth.uid()));

-- Admins can view their company modules
CREATE POLICY "Company admins can view modules"
  ON public.company_modules FOR SELECT
  USING (company_id IN (SELECT user_company_ids(auth.uid())));

-- Add is_sandbox flag to companies
ALTER TABLE public.companies ADD COLUMN is_sandbox boolean NOT NULL DEFAULT false;
