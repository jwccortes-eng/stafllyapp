
-- Table for shift claim/request by employees
CREATE TABLE public.shift_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  message text, -- employee message when applying
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shift_id, employee_id)
);

ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;

-- Employees can view their own requests
CREATE POLICY "Employees can view own requests"
ON public.shift_requests FOR SELECT
USING (EXISTS (
  SELECT 1 FROM employees e WHERE e.id = shift_requests.employee_id AND e.user_id = auth.uid()
));

-- Employees can insert requests for themselves
CREATE POLICY "Employees can insert own requests"
ON public.shift_requests FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM employees e WHERE e.id = shift_requests.employee_id AND e.user_id = auth.uid()
));

-- Admins can view company requests
CREATE POLICY "Admins can view company requests"
ON public.shift_requests FOR SELECT
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Admins can update company requests (approve/reject)
CREATE POLICY "Admins can update company requests"
ON public.shift_requests FOR UPDATE
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Admins can manage all
CREATE POLICY "Owners can manage all shift_requests"
ON public.shift_requests FOR ALL
USING (is_global_owner(auth.uid()));

-- Managers with shifts permission can view
CREATE POLICY "Managers can view shift_requests"
ON public.shift_requests FOR SELECT
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_module_permission(auth.uid(), 'shifts'::text, 'view'::text)
);

-- Managers with shifts edit can update
CREATE POLICY "Managers can update shift_requests"
ON public.shift_requests FOR UPDATE
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_module_permission(auth.uid(), 'shifts'::text, 'edit'::text)
);

-- Trigger for updated_at
CREATE TRIGGER update_shift_requests_updated_at
  BEFORE UPDATE ON public.shift_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
