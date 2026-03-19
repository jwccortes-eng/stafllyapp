
-- Fix overly permissive ALL policy by splitting into specific operations
DROP POLICY "Company users can upsert employee status" ON public.employee_status;

CREATE POLICY "Company users can insert employee status"
  ON public.employee_status FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company users can update employee status"
  ON public.employee_status FOR UPDATE TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));
