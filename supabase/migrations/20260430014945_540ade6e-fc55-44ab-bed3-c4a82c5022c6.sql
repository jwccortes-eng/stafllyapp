-- Historical payroll entries: separate table for unmatched Connecteam payroll rows
-- Does NOT contaminate employees table. Used only for admin historical totals.

CREATE TABLE public.historical_payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.pay_periods(id) ON DELETE RESTRICT,
  import_id uuid NULL REFERENCES public.imports(id) ON DELETE SET NULL,
  source_system text NOT NULL DEFAULT 'Connecteam',
  source_file text NOT NULL,
  historical_status text NOT NULL DEFAULT 'final_paid',
  worker_record_type text NOT NULL DEFAULT 'historical_payroll_only',
  worker_name_raw text NOT NULL,
  employer_identification_raw text NULL,
  employer_identification_hash text NULL,
  ssn_last4 text NULL,
  base_total_pay numeric NOT NULL DEFAULT 0,
  concept_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_identity_review boolean NOT NULL DEFAULT true,
  matched_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hpe_base_total_pay_nonneg CHECK (base_total_pay >= 0),
  CONSTRAINT hpe_worker_record_type_chk CHECK (worker_record_type = 'historical_payroll_only'),
  CONSTRAINT hpe_historical_status_chk CHECK (historical_status IN ('final_paid','voided','resolved')),
  CONSTRAINT hpe_source_system_chk CHECK (source_system = 'Connecteam'),
  CONSTRAINT hpe_ssn_last4_chk CHECK (ssn_last4 IS NULL OR (ssn_last4 ~ '^[0-9]{4}$'))
);

CREATE INDEX idx_hpe_company_period ON public.historical_payroll_entries (company_id, period_id);
CREATE INDEX idx_hpe_import ON public.historical_payroll_entries (import_id);
CREATE INDEX idx_hpe_matched_employee ON public.historical_payroll_entries (matched_employee_id);
CREATE INDEX idx_hpe_emp_id_hash ON public.historical_payroll_entries (employer_identification_hash);
CREATE INDEX idx_hpe_needs_review ON public.historical_payroll_entries (needs_identity_review) WHERE needs_identity_review = true;

CREATE TRIGGER trg_hpe_updated_at
  BEFORE UPDATE ON public.historical_payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.historical_payroll_entries ENABLE ROW LEVEL SECURITY;

-- Global owners: full access
CREATE POLICY "Owners can manage all historical payroll entries"
  ON public.historical_payroll_entries
  FOR ALL
  USING (is_global_owner(auth.uid()))
  WITH CHECK (is_global_owner(auth.uid()));

-- Company admins: full access within their company
CREATE POLICY "Company admins can manage historical payroll entries"
  ON public.historical_payroll_entries
  FOR ALL
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Managers with import view permission can view
CREATE POLICY "Managers can view historical payroll entries"
  ON public.historical_payroll_entries
  FOR SELECT
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND (
      has_module_permission(auth.uid(), 'summary', 'view')
      OR has_module_permission(auth.uid(), 'import', 'view')
    )
  );

-- Managers with import edit permission can insert
CREATE POLICY "Managers can insert historical payroll entries"
  ON public.historical_payroll_entries
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'import', 'edit')
  );

-- Managers with import edit permission can update
CREATE POLICY "Managers can edit historical payroll entries"
  ON public.historical_payroll_entries
  FOR UPDATE
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'import', 'edit')
  );

-- Managers with import delete permission can delete
CREATE POLICY "Managers can delete historical payroll entries"
  ON public.historical_payroll_entries
  FOR DELETE
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'import', 'delete')
  );

-- IMPORTANT: NO worker/portal SELECT policy.
-- Workers MUST NOT read historical_payroll_entries directly.
-- Worker portal pay reports read only period_base_pay scoped to their own employee_id.
-- If a historical row is later resolved into an employee, it should be migrated/inserted
-- into period_base_pay for that employee.

COMMENT ON TABLE public.historical_payroll_entries IS
  'Final Connecteam payroll rows that cannot safely reference employees.id. Admin-only. Contributes to historical closeout totals only. Never read by worker portal.';