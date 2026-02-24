
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_number TEXT UNIQUE,
  email TEXT,
  connecteam_employee_id TEXT,
  verification_ssn_ein TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage employees" ON public.employees FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can view own record" ON public.employees FOR SELECT USING (user_id = auth.uid());

-- Pay periods
CREATE TABLE public.pay_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage periods" ON public.pay_periods FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can view periods" ON public.pay_periods FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.user_id = auth.uid())
);

-- Imports
CREATE TABLE public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID REFERENCES public.pay_periods(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  column_mapping JSONB,
  row_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  imported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage imports" ON public.imports FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Import rows (raw data)
CREATE TABLE public.import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID REFERENCES public.imports(id) ON DELETE CASCADE NOT NULL,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  employee_id UUID REFERENCES public.employees(id),
  matched BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage import rows" ON public.import_rows FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Period base pay
CREATE TABLE public.period_base_pay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  period_id UUID REFERENCES public.pay_periods(id) ON DELETE CASCADE NOT NULL,
  weekly_total_hours NUMERIC(10,2) DEFAULT 0,
  total_work_hours NUMERIC(10,2) DEFAULT 0,
  total_paid_hours NUMERIC(10,2) DEFAULT 0,
  total_regular NUMERIC(10,2) DEFAULT 0,
  total_overtime NUMERIC(10,2) DEFAULT 0,
  base_total_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  import_id UUID REFERENCES public.imports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_id)
);
ALTER TABLE public.period_base_pay ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage base pay" ON public.period_base_pay FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can view own base pay" ON public.period_base_pay FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = period_base_pay.employee_id AND employees.user_id = auth.uid())
);

-- Shifts
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  period_id UUID REFERENCES public.pay_periods(id) ON DELETE CASCADE NOT NULL,
  import_id UUID REFERENCES public.imports(id),
  shift_number TEXT,
  scheduled_shift_title TEXT,
  type TEXT,
  job_code TEXT,
  sub_job TEXT,
  sub_job_code TEXT,
  shift_start_date DATE,
  clock_in_time TEXT,
  clock_in_location TEXT,
  clock_in_device TEXT,
  shift_end_date DATE,
  clock_out_time TEXT,
  clock_out_location TEXT,
  clock_out_device TEXT,
  shift_hours NUMERIC(10,2),
  hourly_rate_usd NUMERIC(10,2),
  daily_total_hours NUMERIC(10,2),
  daily_total_pay_usd NUMERIC(12,2),
  customer TEXT,
  ride TEXT,
  employee_notes TEXT,
  manager_notes TEXT,
  shift_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage shifts" ON public.shifts FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can view own shifts" ON public.shifts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = shifts.employee_id AND employees.user_id = auth.uid())
);

-- Concepts (dynamic categories)
CREATE TYPE public.concept_category AS ENUM ('extra', 'deduction');
CREATE TYPE public.calc_mode AS ENUM ('quantity_x_rate', 'manual_value', 'hybrid');
CREATE TYPE public.rate_source AS ENUM ('concept_default', 'per_employee');

CREATE TABLE public.concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category concept_category NOT NULL,
  calc_mode calc_mode NOT NULL DEFAULT 'manual_value',
  unit_label TEXT DEFAULT 'units',
  default_rate NUMERIC(12,2),
  rate_source rate_source NOT NULL DEFAULT 'concept_default',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage concepts" ON public.concepts FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can view active concepts" ON public.concepts FOR SELECT USING (
  is_active AND EXISTS (SELECT 1 FROM public.employees WHERE employees.user_id = auth.uid())
);

-- Concept employee rates
CREATE TABLE public.concept_employee_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID REFERENCES public.concepts(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  rate NUMERIC(12,2) NOT NULL,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (concept_id, employee_id, effective_from)
);
ALTER TABLE public.concept_employee_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage rates" ON public.concept_employee_rates FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can view own rates" ON public.concept_employee_rates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = concept_employee_rates.employee_id AND employees.user_id = auth.uid())
);

-- Movements (novedades)
CREATE TABLE public.movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  period_id UUID REFERENCES public.pay_periods(id) ON DELETE CASCADE NOT NULL,
  concept_id UUID REFERENCES public.concepts(id) NOT NULL,
  quantity NUMERIC(10,2),
  rate NUMERIC(12,2),
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage movements" ON public.movements FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can view own movements" ON public.movements FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE employees.id = movements.employee_id AND employees.user_id = auth.uid())
);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_movements_updated_at BEFORE UPDATE ON public.movements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
