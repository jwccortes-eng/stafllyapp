
-- Employees: managers with 'employees' module access
CREATE POLICY "Managers can view employees"
ON public.employees FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'employees', 'view'));

CREATE POLICY "Managers can edit employees"
ON public.employees FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'employees', 'edit'));

CREATE POLICY "Managers can insert employees"
ON public.employees FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'employees', 'edit'));

CREATE POLICY "Managers can delete employees"
ON public.employees FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'employees', 'delete'));

-- Pay periods: managers with 'periods' module access
CREATE POLICY "Managers can view periods"
ON public.pay_periods FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'periods', 'view'));

CREATE POLICY "Managers can edit periods"
ON public.pay_periods FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'periods', 'edit'));

CREATE POLICY "Managers can insert periods"
ON public.pay_periods FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'periods', 'edit'));

CREATE POLICY "Managers can delete periods"
ON public.pay_periods FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'periods', 'delete'));

-- Concepts: managers with 'concepts' module access
CREATE POLICY "Managers can view concepts"
ON public.concepts FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'concepts', 'view'));

CREATE POLICY "Managers can edit concepts"
ON public.concepts FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can insert concepts"
ON public.concepts FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can delete concepts"
ON public.concepts FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'concepts', 'delete'));

-- Concept employee rates: managers with 'concepts' module access
CREATE POLICY "Managers can view rates"
ON public.concept_employee_rates FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'concepts', 'view'));

CREATE POLICY "Managers can edit rates"
ON public.concept_employee_rates FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can insert rates"
ON public.concept_employee_rates FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can delete rates"
ON public.concept_employee_rates FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'concepts', 'delete'));

-- Movements: managers with 'movements' module access
CREATE POLICY "Managers can view movements"
ON public.movements FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'movements', 'view'));

CREATE POLICY "Managers can edit movements"
ON public.movements FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'movements', 'edit'));

CREATE POLICY "Managers can insert movements"
ON public.movements FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'movements', 'edit'));

CREATE POLICY "Managers can delete movements"
ON public.movements FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'movements', 'delete'));

-- Imports: managers with 'import' module access
CREATE POLICY "Managers can view imports"
ON public.imports FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'view'));

CREATE POLICY "Managers can edit imports"
ON public.imports FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert imports"
ON public.imports FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete imports"
ON public.imports FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'delete'));

-- Import rows: managers with 'import' module access
CREATE POLICY "Managers can view import rows"
ON public.import_rows FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'view'));

CREATE POLICY "Managers can edit import rows"
ON public.import_rows FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert import rows"
ON public.import_rows FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete import rows"
ON public.import_rows FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'delete'));

-- Period base pay: managers with 'summary' module access (view) or 'import' (edit)
CREATE POLICY "Managers can view base pay"
ON public.period_base_pay FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'summary', 'view') 
    OR public.has_module_permission(auth.uid(), 'import', 'view'));

CREATE POLICY "Managers can edit base pay"
ON public.period_base_pay FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert base pay"
ON public.period_base_pay FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete base pay"
ON public.period_base_pay FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'delete'));

-- Shifts: managers with 'import' module access
CREATE POLICY "Managers can view shifts"
ON public.shifts FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'view'));

CREATE POLICY "Managers can edit shifts"
ON public.shifts FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert shifts"
ON public.shifts FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete shifts"
ON public.shifts FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'import', 'delete'));
