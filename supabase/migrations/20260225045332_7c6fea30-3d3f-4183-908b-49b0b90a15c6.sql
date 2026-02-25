
-- =============================================
-- FIX: Add company-scoped RLS policies
-- Replace global has_role('admin') with company-scoped checks
-- =============================================

-- ========== EMPLOYEES ==========
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Managers can view employees" ON public.employees;
DROP POLICY IF EXISTS "Managers can edit employees" ON public.employees;
DROP POLICY IF EXISTS "Managers can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Managers can delete employees" ON public.employees;

CREATE POLICY "Owners can manage all employees" ON public.employees FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company users can manage employees" ON public.employees FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view employees" ON public.employees FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'employees', 'view'));

CREATE POLICY "Managers can edit employees" ON public.employees FOR UPDATE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'employees', 'edit'));

CREATE POLICY "Managers can insert employees" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'employees', 'edit'));

CREATE POLICY "Managers can delete employees" ON public.employees FOR DELETE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'employees', 'delete'));

-- ========== PAY_PERIODS ==========
DROP POLICY IF EXISTS "Admins can manage periods" ON public.pay_periods;
DROP POLICY IF EXISTS "Managers can view periods" ON public.pay_periods;
DROP POLICY IF EXISTS "Managers can edit periods" ON public.pay_periods;
DROP POLICY IF EXISTS "Managers can insert periods" ON public.pay_periods;
DROP POLICY IF EXISTS "Managers can delete periods" ON public.pay_periods;

CREATE POLICY "Owners can manage all periods" ON public.pay_periods FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage periods" ON public.pay_periods FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view periods" ON public.pay_periods FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'periods', 'view'));

CREATE POLICY "Managers can edit periods" ON public.pay_periods FOR UPDATE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'periods', 'edit'));

CREATE POLICY "Managers can insert periods" ON public.pay_periods FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'periods', 'edit'));

CREATE POLICY "Managers can delete periods" ON public.pay_periods FOR DELETE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'periods', 'delete'));

-- ========== CONCEPTS ==========
DROP POLICY IF EXISTS "Admins can manage concepts" ON public.concepts;
DROP POLICY IF EXISTS "Managers can view concepts" ON public.concepts;
DROP POLICY IF EXISTS "Managers can edit concepts" ON public.concepts;
DROP POLICY IF EXISTS "Managers can insert concepts" ON public.concepts;
DROP POLICY IF EXISTS "Managers can delete concepts" ON public.concepts;

CREATE POLICY "Owners can manage all concepts" ON public.concepts FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage concepts" ON public.concepts FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view concepts" ON public.concepts FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'concepts', 'view'));

CREATE POLICY "Managers can edit concepts" ON public.concepts FOR UPDATE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can insert concepts" ON public.concepts FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can delete concepts" ON public.concepts FOR DELETE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'concepts', 'delete'));

-- ========== MOVEMENTS ==========
DROP POLICY IF EXISTS "Admins can manage movements" ON public.movements;
DROP POLICY IF EXISTS "Managers can view movements" ON public.movements;
DROP POLICY IF EXISTS "Managers can edit movements" ON public.movements;
DROP POLICY IF EXISTS "Managers can insert movements" ON public.movements;
DROP POLICY IF EXISTS "Managers can delete movements" ON public.movements;

CREATE POLICY "Owners can manage all movements" ON public.movements FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage movements" ON public.movements FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view movements" ON public.movements FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'movements', 'view'));

CREATE POLICY "Managers can edit movements" ON public.movements FOR UPDATE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'movements', 'edit'));

CREATE POLICY "Managers can insert movements" ON public.movements FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'movements', 'edit'));

CREATE POLICY "Managers can delete movements" ON public.movements FOR DELETE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'movements', 'delete'));

-- ========== IMPORTS ==========
DROP POLICY IF EXISTS "Admins can manage imports" ON public.imports;
DROP POLICY IF EXISTS "Managers can view imports" ON public.imports;
DROP POLICY IF EXISTS "Managers can edit imports" ON public.imports;
DROP POLICY IF EXISTS "Managers can insert imports" ON public.imports;
DROP POLICY IF EXISTS "Managers can delete imports" ON public.imports;

CREATE POLICY "Owners can manage all imports" ON public.imports FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage imports" ON public.imports FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view imports" ON public.imports FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'view'));

CREATE POLICY "Managers can edit imports" ON public.imports FOR UPDATE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert imports" ON public.imports FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete imports" ON public.imports FOR DELETE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'delete'));

-- ========== PERIOD_BASE_PAY ==========
DROP POLICY IF EXISTS "Admins can manage base pay" ON public.period_base_pay;
DROP POLICY IF EXISTS "Managers can view base pay" ON public.period_base_pay;
DROP POLICY IF EXISTS "Managers can edit base pay" ON public.period_base_pay;
DROP POLICY IF EXISTS "Managers can insert base pay" ON public.period_base_pay;
DROP POLICY IF EXISTS "Managers can delete base pay" ON public.period_base_pay;

CREATE POLICY "Owners can manage all base pay" ON public.period_base_pay FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage base pay" ON public.period_base_pay FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view base pay" ON public.period_base_pay FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND (has_module_permission(auth.uid(), 'summary', 'view') OR has_module_permission(auth.uid(), 'import', 'view')));

CREATE POLICY "Managers can edit base pay" ON public.period_base_pay FOR UPDATE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert base pay" ON public.period_base_pay FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete base pay" ON public.period_base_pay FOR DELETE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'delete'));

-- ========== SHIFTS ==========
DROP POLICY IF EXISTS "Admins can manage shifts" ON public.shifts;
DROP POLICY IF EXISTS "Managers can view shifts" ON public.shifts;
DROP POLICY IF EXISTS "Managers can edit shifts" ON public.shifts;
DROP POLICY IF EXISTS "Managers can insert shifts" ON public.shifts;
DROP POLICY IF EXISTS "Managers can delete shifts" ON public.shifts;

CREATE POLICY "Owners can manage all shifts" ON public.shifts FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage shifts" ON public.shifts FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view shifts" ON public.shifts FOR SELECT TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'view'));

CREATE POLICY "Managers can edit shifts" ON public.shifts FOR UPDATE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert shifts" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete shifts" ON public.shifts FOR DELETE TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'import', 'delete'));

-- ========== SAVED_REPORTS ==========
DROP POLICY IF EXISTS "Admins can manage all reports" ON public.saved_reports;

CREATE POLICY "Owners can manage all reports" ON public.saved_reports FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage reports" ON public.saved_reports FOR ALL TO authenticated
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

-- ========== IMPORT_ROWS (scoped via import_id -> imports.company_id) ==========
DROP POLICY IF EXISTS "Admins can manage import rows" ON public.import_rows;
DROP POLICY IF EXISTS "Managers can view import rows" ON public.import_rows;
DROP POLICY IF EXISTS "Managers can edit import rows" ON public.import_rows;
DROP POLICY IF EXISTS "Managers can insert import rows" ON public.import_rows;
DROP POLICY IF EXISTS "Managers can delete import rows" ON public.import_rows;

CREATE POLICY "Owners can manage all import rows" ON public.import_rows FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage import rows" ON public.import_rows FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM imports i WHERE i.id = import_rows.import_id AND i.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view import rows" ON public.import_rows FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM imports i WHERE i.id = import_rows.import_id AND i.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'import', 'view'));

CREATE POLICY "Managers can edit import rows" ON public.import_rows FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM imports i WHERE i.id = import_rows.import_id AND i.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can insert import rows" ON public.import_rows FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM imports i WHERE i.id = import_rows.import_id AND i.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'import', 'edit'));

CREATE POLICY "Managers can delete import rows" ON public.import_rows FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM imports i WHERE i.id = import_rows.import_id AND i.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'import', 'delete'));

-- ========== CONCEPT_EMPLOYEE_RATES (scoped via concept_id -> concepts.company_id) ==========
DROP POLICY IF EXISTS "Admins can manage rates" ON public.concept_employee_rates;
DROP POLICY IF EXISTS "Managers can view rates" ON public.concept_employee_rates;
DROP POLICY IF EXISTS "Managers can edit rates" ON public.concept_employee_rates;
DROP POLICY IF EXISTS "Managers can insert rates" ON public.concept_employee_rates;
DROP POLICY IF EXISTS "Managers can delete rates" ON public.concept_employee_rates;

CREATE POLICY "Owners can manage all rates" ON public.concept_employee_rates FOR ALL TO authenticated
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Company admins can manage rates" ON public.concept_employee_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM concepts c WHERE c.id = concept_employee_rates.concept_id AND c.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view rates" ON public.concept_employee_rates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM concepts c WHERE c.id = concept_employee_rates.concept_id AND c.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'concepts', 'view'));

CREATE POLICY "Managers can edit rates" ON public.concept_employee_rates FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM concepts c WHERE c.id = concept_employee_rates.concept_id AND c.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can insert rates" ON public.concept_employee_rates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM concepts c WHERE c.id = concept_employee_rates.concept_id AND c.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'concepts', 'edit'));

CREATE POLICY "Managers can delete rates" ON public.concept_employee_rates FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM concepts c WHERE c.id = concept_employee_rates.concept_id AND c.company_id IN (SELECT user_company_ids(auth.uid()))) AND has_module_permission(auth.uid(), 'concepts', 'delete'));
