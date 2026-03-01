
-- 1. Add day_type and shift_admin_id to scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS day_type text NOT NULL DEFAULT 'full_day',
  ADD COLUMN IF NOT EXISTS shift_admin_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_admin ON public.scheduled_shifts(shift_admin_id) WHERE shift_admin_id IS NOT NULL;

-- 2. Create shift_attendance_confirmations table
CREATE TABLE IF NOT EXISTS public.shift_attendance_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  status text NOT NULL DEFAULT 'present',
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id)
);

ALTER TABLE public.shift_attendance_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage all attendance confirmations"
  ON public.shift_attendance_confirmations FOR ALL
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Admins can manage company attendance confirmations"
  ON public.shift_attendance_confirmations FOR ALL
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers with shifts edit can manage attendance"
  ON public.shift_attendance_confirmations FOR ALL
  USING (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND has_module_permission(auth.uid(), 'shifts', 'edit')
  );

CREATE POLICY "Shift admin can manage attendance for their shifts"
  ON public.shift_attendance_confirmations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM scheduled_shifts ss
      JOIN employees e ON e.id = ss.shift_admin_id
      WHERE ss.id = shift_attendance_confirmations.shift_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can view own attendance"
  ON public.shift_attendance_confirmations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = shift_attendance_confirmations.employee_id
        AND e.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_attendance_shift ON public.shift_attendance_confirmations(shift_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON public.shift_attendance_confirmations(employee_id);

-- 3. Create "Daily Pay" concept for each active company
INSERT INTO public.concepts (company_id, name, category, calc_mode, rate_source, unit_label, is_active, default_rate)
SELECT 
  c.id,
  'Daily Pay',
  'extra'::concept_category,
  'quantity_x_rate'::calc_mode,
  'per_employee'::rate_source,
  'días',
  true,
  200
FROM public.companies c
WHERE c.is_active = true
ON CONFLICT DO NOTHING;

-- 4. Insert default rates ($200) for all active employees
INSERT INTO public.concept_employee_rates (concept_id, employee_id, rate)
SELECT co.id, e.id, 200
FROM public.employees e
JOIN public.concepts co ON co.company_id = e.company_id AND co.name = 'Daily Pay'
WHERE e.is_active = true
ON CONFLICT DO NOTHING;
