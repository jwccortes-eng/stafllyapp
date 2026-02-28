
-- W-9 data per contractor/employee
CREATE TABLE public.contractor_w9 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  legal_name text NOT NULL DEFAULT '',
  business_name text,
  tax_classification text NOT NULL DEFAULT 'individual',
  tin_last4 text,
  tin_encrypted text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,
  signed_at timestamptz,
  signed_by uuid,
  w9_file_url text,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, employee_id)
);

ALTER TABLE public.contractor_w9 ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage company w9" ON public.contractor_w9
  FOR ALL USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Owners can manage all w9" ON public.contractor_w9
  FOR ALL USING (is_global_owner(auth.uid()));

CREATE POLICY "Employees can view own w9" ON public.contractor_w9
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = contractor_w9.employee_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Employees can upsert own w9" ON public.contractor_w9
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = contractor_w9.employee_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Employees can update own w9" ON public.contractor_w9
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = contractor_w9.employee_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Managers can view w9" ON public.contractor_w9
  FOR SELECT USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'employees', 'view')
  );

-- 1099 generated forms
CREATE TABLE public.tax_forms_1099 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  tax_year integer NOT NULL,
  total_compensation numeric NOT NULL DEFAULT 0,
  nonemployee_compensation numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  pdf_url text,
  generated_at timestamptz,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, employee_id, tax_year)
);

ALTER TABLE public.tax_forms_1099 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company 1099" ON public.tax_forms_1099
  FOR ALL USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Owners can manage all 1099" ON public.tax_forms_1099
  FOR ALL USING (is_global_owner(auth.uid()));

CREATE POLICY "Employees can view own 1099" ON public.tax_forms_1099
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = tax_forms_1099.employee_id AND e.user_id = auth.uid())
  );

CREATE POLICY "Managers can view 1099" ON public.tax_forms_1099
  FOR SELECT USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'employees', 'view')
  );

-- Triggers for updated_at
CREATE TRIGGER update_contractor_w9_updated_at
  BEFORE UPDATE ON public.contractor_w9
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_forms_1099_updated_at
  BEFORE UPDATE ON public.tax_forms_1099
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
