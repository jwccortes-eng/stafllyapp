
-- Table to control which portal modules each employee can access
CREATE TABLE public.employee_portal_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(employee_id, module)
);

ALTER TABLE public.employee_portal_modules ENABLE ROW LEVEL SECURITY;

-- Owners/admins can manage
CREATE POLICY "Admins can manage employee portal modules"
  ON public.employee_portal_modules
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_company_role(auth.uid(), company_id, 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_company_role(auth.uid(), company_id, 'admin')
  );

-- Employees can read their own modules
CREATE POLICY "Employees can read own portal modules"
  ON public.employee_portal_modules
  FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- Add phone_number column to profiles for admin phone login linking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_login_enabled BOOLEAN DEFAULT false;
