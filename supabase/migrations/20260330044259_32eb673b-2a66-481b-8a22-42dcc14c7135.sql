
-- Invitation tracking table
CREATE TABLE public.employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms', 'email', 'copy', 'other')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'activated', 'failed')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid NOT NULL,
  activated_at timestamptz,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_employee_invitations_employee ON public.employee_invitations(employee_id);
CREATE INDEX idx_employee_invitations_company ON public.employee_invitations(company_id);
CREATE INDEX idx_employee_invitations_status ON public.employee_invitations(status);

-- RLS
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;

-- Admins/managers can view invitations for their companies
CREATE POLICY "Users can view invitations for their companies"
  ON public.employee_invitations FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Admins/managers can insert invitations for their companies
CREATE POLICY "Users can insert invitations for their companies"
  ON public.employee_invitations FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Admins can update invitation status
CREATE POLICY "Users can update invitations for their companies"
  ON public.employee_invitations FOR UPDATE TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
