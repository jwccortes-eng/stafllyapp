
-- Employee online/activity status tracking
CREATE TABLE public.employee_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'on_shift', 'recently_active', 'not_available')),
  last_seen_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id)
);

ALTER TABLE public.employee_status ENABLE ROW LEVEL SECURITY;

-- Company users can view status of employees in their companies
CREATE POLICY "Company users can view employee status"
  ON public.employee_status FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Allow inserts/updates for company members
CREATE POLICY "Company users can upsert employee status"
  ON public.employee_status FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Enable realtime for live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_status;
