CREATE TABLE public.payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'manual_adjustment' CHECK (type IN ('bonus', 'transport', 'deduction', 'manual_adjustment')),
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  period_id uuid REFERENCES public.pay_periods(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage payroll_adjustments"
  ON public.payroll_adjustments
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE INDEX idx_payroll_adjustments_company ON public.payroll_adjustments(company_id);
CREATE INDEX idx_payroll_adjustments_employee ON public.payroll_adjustments(employee_id);
CREATE INDEX idx_payroll_adjustments_shift ON public.payroll_adjustments(shift_id);
CREATE INDEX idx_payroll_adjustments_period ON public.payroll_adjustments(period_id);