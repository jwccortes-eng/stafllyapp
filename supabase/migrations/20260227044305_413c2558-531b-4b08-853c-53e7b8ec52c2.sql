
-- ========================================
-- 1. Employee Tickets (unified requests/CRM)
-- ========================================
CREATE TABLE public.employee_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  type text NOT NULL DEFAULT 'general',
  subject text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid,
  source text NOT NULL DEFAULT 'manual',
  source_entity_type text,
  source_entity_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_tickets_company ON public.employee_tickets(company_id);
CREATE INDEX idx_employee_tickets_employee ON public.employee_tickets(employee_id);
CREATE INDEX idx_employee_tickets_status ON public.employee_tickets(status);
CREATE INDEX idx_employee_tickets_assigned ON public.employee_tickets(assigned_to);

ALTER TABLE public.employee_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company tickets"
  ON public.employee_tickets FOR ALL
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can manage all tickets"
  ON public.employee_tickets FOR ALL
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Managers can view company tickets"
  ON public.employee_tickets FOR SELECT
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update assigned tickets"
  ON public.employee_tickets FOR UPDATE
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND assigned_to = auth.uid());

CREATE POLICY "Employees can view own tickets"
  ON public.employee_tickets FOR SELECT
  USING (EXISTS (SELECT 1 FROM employees WHERE employees.id = employee_tickets.employee_id AND employees.user_id = auth.uid()));

CREATE POLICY "Employees can create own tickets"
  ON public.employee_tickets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE employees.id = employee_tickets.employee_id AND employees.user_id = auth.uid()));

-- ========================================
-- 2. Ticket Notes (CRM timeline)
-- ========================================
CREATE TABLE public.ticket_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.employee_tickets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  author_id uuid NOT NULL,
  author_type text NOT NULL DEFAULT 'admin',
  content text NOT NULL DEFAULT '',
  note_type text NOT NULL DEFAULT 'comment',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_notes_ticket ON public.ticket_notes(ticket_id);

ALTER TABLE public.ticket_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company ticket notes"
  ON public.ticket_notes FOR ALL
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can manage all ticket notes"
  ON public.ticket_notes FOR ALL
  USING (is_global_owner(auth.uid()));

CREATE POLICY "Managers can view company ticket notes"
  ON public.ticket_notes FOR SELECT
  USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can insert notes on assigned tickets"
  ON public.ticket_notes FOR INSERT
  WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND EXISTS (
    SELECT 1 FROM employee_tickets WHERE employee_tickets.id = ticket_notes.ticket_id AND employee_tickets.assigned_to = auth.uid()
  ));

CREATE POLICY "Employees can view own ticket notes"
  ON public.ticket_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM employee_tickets et JOIN employees e ON e.id = et.employee_id
    WHERE et.id = ticket_notes.ticket_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Employees can add notes to own tickets"
  ON public.ticket_notes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM employee_tickets et JOIN employees e ON e.id = et.employee_id
    WHERE et.id = ticket_notes.ticket_id AND e.user_id = auth.uid()
  ));

-- Updated_at trigger
CREATE TRIGGER update_employee_tickets_updated_at
  BEFORE UPDATE ON public.employee_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_tickets;
