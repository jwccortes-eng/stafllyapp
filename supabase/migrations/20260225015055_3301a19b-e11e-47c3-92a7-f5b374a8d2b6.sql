
-- 1. Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create company_users junction (links users to companies with a role within that company)
CREATE TABLE public.company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

-- 3. Create a default company for existing data
INSERT INTO public.companies (id, name, slug) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Empresa Principal', 'empresa-principal');

-- 4. Add company_id to main data tables with default
ALTER TABLE public.employees ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.pay_periods ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.concepts ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.movements ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.imports ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.period_base_pay ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.shifts ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.saved_reports ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001';

-- 5. Set existing data to default company
UPDATE public.employees SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.pay_periods SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.concepts SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.movements SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.imports SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.period_base_pay SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.shifts SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.saved_reports SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 6. Make company_id NOT NULL after data migration
ALTER TABLE public.employees ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.pay_periods ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.concepts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.movements ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.imports ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.period_base_pay ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.shifts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.saved_reports ALTER COLUMN company_id SET NOT NULL;

-- 7. Add indexes for performance
CREATE INDEX idx_employees_company ON public.employees(company_id);
CREATE INDEX idx_pay_periods_company ON public.pay_periods(company_id);
CREATE INDEX idx_concepts_company ON public.concepts(company_id);
CREATE INDEX idx_movements_company ON public.movements(company_id);
CREATE INDEX idx_imports_company ON public.imports(company_id);
CREATE INDEX idx_period_base_pay_company ON public.period_base_pay(company_id);
CREATE INDEX idx_shifts_company ON public.shifts(company_id);
CREATE INDEX idx_company_users_user ON public.company_users(user_id);
CREATE INDEX idx_company_users_company ON public.company_users(company_id);

-- 8. Link existing users to default company
INSERT INTO public.company_users (company_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', ur.user_id, ur.role::text
FROM public.user_roles ur
ON CONFLICT DO NOTHING;

-- 9. Helper function: get user's companies
CREATE OR REPLACE FUNCTION public.user_company_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_users WHERE user_id = _user_id
$$;

-- 10. Helper function: check if user is global owner
CREATE OR REPLACE FUNCTION public.is_global_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  )
$$;

-- 11. Helper function: check user role within a company
CREATE OR REPLACE FUNCTION public.has_company_role(_user_id uuid, _company_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users 
    WHERE user_id = _user_id AND company_id = _company_id AND role = _role
  ) OR public.is_global_owner(_user_id)
$$;

-- 12. RLS for companies
CREATE POLICY "Owners can manage all companies"
ON public.companies FOR ALL TO authenticated
USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Users can view their companies"
ON public.companies FOR SELECT TO authenticated
USING (id IN (SELECT public.user_company_ids(auth.uid())));

-- 13. RLS for company_users
CREATE POLICY "Owners can manage all company users"
ON public.company_users FOR ALL TO authenticated
USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage their company users"
ON public.company_users FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, 'admin'));

CREATE POLICY "Users can view own company memberships"
ON public.company_users FOR SELECT TO authenticated
USING (user_id = auth.uid());
