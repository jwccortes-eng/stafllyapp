
-- =============================================
-- Employee Availability System
-- =============================================

-- 1. Per-employee availability configuration (defaults + recurring weekday blocks)
CREATE TABLE public.employee_availability_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  default_available boolean NOT NULL DEFAULT true,
  blocked_weekdays integer[] NOT NULL DEFAULT '{}',  -- 0=Sun,1=Mon,...6=Sat
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

-- 2. Specific date overrides (manual or imported)
CREATE TABLE public.employee_availability_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  date date NOT NULL,
  is_available boolean NOT NULL DEFAULT false,
  reason text,
  set_by uuid,  -- user_id who set it
  source text NOT NULL DEFAULT 'admin',  -- 'employee', 'admin', 'import'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

-- Indexes
CREATE INDEX idx_avail_config_company ON employee_availability_config(company_id);
CREATE INDEX idx_avail_overrides_company_date ON employee_availability_overrides(company_id, date);
CREATE INDEX idx_avail_overrides_employee_date ON employee_availability_overrides(employee_id, date);

-- Trigger for updated_at on config
CREATE TRIGGER update_avail_config_updated_at
  BEFORE UPDATE ON employee_availability_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RLS Policies
-- =============================================

ALTER TABLE employee_availability_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_availability_overrides ENABLE ROW LEVEL SECURITY;

-- Config: Owners
CREATE POLICY "Owners can manage all availability config"
  ON employee_availability_config FOR ALL
  USING (is_global_owner(auth.uid()));

-- Config: Admins
CREATE POLICY "Admins can manage company availability config"
  ON employee_availability_config FOR ALL
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Config: Managers with employee view
CREATE POLICY "Managers can view availability config"
  ON employee_availability_config FOR SELECT
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'employees', 'view')
  );

-- Config: Employees can view and update own
CREATE POLICY "Employees can view own availability config"
  ON employee_availability_config FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = employee_availability_config.employee_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Employees can update own availability config"
  ON employee_availability_config FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = employee_availability_config.employee_id AND e.user_id = auth.uid()
  ));

-- Overrides: Owners
CREATE POLICY "Owners can manage all availability overrides"
  ON employee_availability_overrides FOR ALL
  USING (is_global_owner(auth.uid()));

-- Overrides: Admins
CREATE POLICY "Admins can manage company availability overrides"
  ON employee_availability_overrides FOR ALL
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Overrides: Managers with shifts view
CREATE POLICY "Managers can view availability overrides"
  ON employee_availability_overrides FOR SELECT
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'shifts', 'view')
  );

-- Overrides: Employees can manage own overrides
CREATE POLICY "Employees can view own availability overrides"
  ON employee_availability_overrides FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = employee_availability_overrides.employee_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Employees can insert own availability overrides"
  ON employee_availability_overrides FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = employee_availability_overrides.employee_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Employees can update own availability overrides"
  ON employee_availability_overrides FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = employee_availability_overrides.employee_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Employees can delete own availability overrides"
  ON employee_availability_overrides FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = employee_availability_overrides.employee_id AND e.user_id = auth.uid()
  ));
