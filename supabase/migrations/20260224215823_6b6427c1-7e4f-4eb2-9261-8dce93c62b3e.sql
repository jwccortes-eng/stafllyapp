
-- Drop all RESTRICTIVE policies and recreate as PERMISSIVE

-- user_roles
DROP POLICY "Users can view own roles" ON public.user_roles;
DROP POLICY "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- profiles
DROP POLICY "Users can view own profile" ON public.profiles;
DROP POLICY "Users can update own profile" ON public.profiles;
DROP POLICY "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- employees
DROP POLICY "Admins can manage employees" ON public.employees;
DROP POLICY "Employees can view own record" ON public.employees;
CREATE POLICY "Admins can manage employees" ON public.employees FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Employees can view own record" ON public.employees FOR SELECT TO authenticated USING (user_id = auth.uid());

-- pay_periods
DROP POLICY "Admins can manage periods" ON public.pay_periods;
DROP POLICY "Employees can view periods" ON public.pay_periods;
CREATE POLICY "Admins can manage periods" ON public.pay_periods FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Employees can view periods" ON public.pay_periods FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.employees WHERE employees.user_id = auth.uid()));

-- imports
DROP POLICY "Admins can manage imports" ON public.imports;
CREATE POLICY "Admins can manage imports" ON public.imports FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- import_rows
DROP POLICY "Admins can manage import rows" ON public.import_rows;
CREATE POLICY "Admins can manage import rows" ON public.import_rows FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- period_base_pay
DROP POLICY "Admins can manage base pay" ON public.period_base_pay;
DROP POLICY "Employees can view own base pay" ON public.period_base_pay;
CREATE POLICY "Admins can manage base pay" ON public.period_base_pay FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Employees can view own base pay" ON public.period_base_pay FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.employees WHERE employees.id = period_base_pay.employee_id AND employees.user_id = auth.uid()));

-- shifts
DROP POLICY "Admins can manage shifts" ON public.shifts;
DROP POLICY "Employees can view own shifts" ON public.shifts;
CREATE POLICY "Admins can manage shifts" ON public.shifts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Employees can view own shifts" ON public.shifts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.employees WHERE employees.id = shifts.employee_id AND employees.user_id = auth.uid()));

-- concepts
DROP POLICY "Admins can manage concepts" ON public.concepts;
DROP POLICY "Employees can view active concepts" ON public.concepts;
CREATE POLICY "Admins can manage concepts" ON public.concepts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Employees can view active concepts" ON public.concepts FOR SELECT TO authenticated USING (is_active AND EXISTS (SELECT 1 FROM public.employees WHERE employees.user_id = auth.uid()));

-- concept_employee_rates
DROP POLICY "Admins can manage rates" ON public.concept_employee_rates;
DROP POLICY "Employees can view own rates" ON public.concept_employee_rates;
CREATE POLICY "Admins can manage rates" ON public.concept_employee_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Employees can view own rates" ON public.concept_employee_rates FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.employees WHERE employees.id = concept_employee_rates.employee_id AND employees.user_id = auth.uid()));

-- movements
DROP POLICY "Admins can manage movements" ON public.movements;
DROP POLICY "Employees can view own movements" ON public.movements;
CREATE POLICY "Admins can manage movements" ON public.movements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Employees can view own movements" ON public.movements FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.employees WHERE employees.id = movements.employee_id AND employees.user_id = auth.uid()));
