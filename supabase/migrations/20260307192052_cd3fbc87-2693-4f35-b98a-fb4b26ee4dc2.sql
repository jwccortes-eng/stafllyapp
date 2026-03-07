
-- ============================================================
-- Phase 1: Service categories + Staffing requests
-- Phase 2: Invoicing
-- Immediate: Transportation fields on scheduled_shifts
-- ============================================================

-- Service categories (configurable, not hardcoded)
CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view service_categories of their company"
  ON public.service_categories FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins can manage service_categories"
  ON public.service_categories FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Staffing requests
CREATE TYPE public.staffing_request_status AS ENUM (
  'draft','submitted','under_review','approved','rejected',
  'sourcing','partially_assigned','fully_assigned','scheduled',
  'in_progress','completed','cancelled'
);

CREATE TABLE public.staffing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id),
  location_id uuid REFERENCES public.locations(id),
  category_id uuid REFERENCES public.service_categories(id),
  title text NOT NULL,
  requested_role text,
  workers_needed int NOT NULL DEFAULT 1,
  requested_date date NOT NULL,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '17:00',
  estimated_duration_hours numeric(6,2),
  required_language text,
  required_experience text,
  required_tags text[],
  gender_preference text,
  priority text NOT NULL DEFAULT 'normal',
  notes text,
  internal_notes text,
  estimated_bill_rate numeric(10,2),
  estimated_pay_rate numeric(10,2),
  assigned_manager_id uuid,
  status public.staffing_request_status NOT NULL DEFAULT 'draft',
  creation_source text NOT NULL DEFAULT 'admin',
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staffing_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view staffing_requests of their company"
  ON public.staffing_requests FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins can manage staffing_requests"
  ON public.staffing_requests FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Request candidates (assignment tracking)
CREATE TABLE public.request_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.staffing_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'proposed',
  proposed_by uuid,
  accepted_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, employee_id)
);

ALTER TABLE public.request_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view request_candidates of their company"
  ON public.request_candidates FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins can manage request_candidates"
  ON public.request_candidates FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- ============================================================
-- Phase 2: Invoicing
-- ============================================================

CREATE TYPE public.invoice_status AS ENUM (
  'draft','approved','issued','sent','viewed',
  'partially_paid','paid','overdue','voided'
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  invoice_number text NOT NULL,
  billing_address text,
  service_period_start date,
  service_period_end date,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  internal_notes text,
  external_notes text,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  viewed_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  voided_by uuid,
  voided_at timestamptz,
  request_id uuid REFERENCES public.staffing_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, invoice_number)
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoices of their company"
  ON public.invoices FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins can manage invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  shift_id uuid REFERENCES public.scheduled_shifts(id),
  category_id uuid REFERENCES public.service_categories(id),
  employee_id uuid REFERENCES public.employees(id),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice_line_items of their company"
  ON public.invoice_line_items FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins can manage invoice_line_items"
  ON public.invoice_line_items FOR ALL TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Invoice sequence per company
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  _next int;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1
  INTO _next
  FROM invoices
  WHERE company_id = NEW.company_id;

  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || LPAD(_next::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

-- ============================================================
-- Transportation fields on scheduled_shifts
-- ============================================================

ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS transportation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS car_capacity int NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS transportation_notes text,
  ADD COLUMN IF NOT EXISTS driver_employee_id uuid REFERENCES public.employees(id);

-- Add employee skills/tags and service category link
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS skills text[],
  ADD COLUMN IF NOT EXISTS service_category_ids uuid[],
  ADD COLUMN IF NOT EXISTS professional_summary text,
  ADD COLUMN IF NOT EXISTS years_experience int,
  ADD COLUMN IF NOT EXISTS certifications text[];

-- Add category to scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.service_categories(id);

-- Trigger: updated_at on new tables
CREATE TRIGGER update_service_categories_updated_at BEFORE UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_staffing_requests_updated_at BEFORE UPDATE ON public.staffing_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_request_candidates_updated_at BEFORE UPDATE ON public.request_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for staffing_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.staffing_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
