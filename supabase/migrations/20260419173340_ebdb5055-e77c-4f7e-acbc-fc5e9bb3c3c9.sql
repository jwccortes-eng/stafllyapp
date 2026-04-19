-- ============================================================
-- SERVICE REQUESTS MODULE — MVP1 + Fulfillment
-- ============================================================

-- Enums
CREATE TYPE public.service_request_status AS ENUM (
  'new',
  'reviewing',
  'approved_for_scheduling',
  'converted_to_shift',
  'in_progress',
  'pending_closure_review',
  'ready_for_billing',
  'invoiced',
  'cancelled'
);

CREATE TYPE public.service_request_channel AS ENUM (
  'whatsapp',
  'phone',
  'manual',
  'client_link',
  'email'
);

CREATE TYPE public.service_request_gender_req AS ENUM (
  'none',
  'men_only',
  'women_only'
);

CREATE TYPE public.service_request_role_type AS ENUM (
  'waiter',
  'captain',
  'kitchen_staff',
  'cleaner',
  'bartender',
  'other'
);

CREATE TYPE public.service_request_billing_unit AS ENUM (
  'hourly',
  'daily',
  'flat'
);

-- ============================================================
-- service_requests
-- ============================================================
CREATE TABLE public.service_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name_snapshot TEXT,
  request_code TEXT NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location_name TEXT,
  service_address TEXT,
  onsite_contact_name TEXT,
  onsite_contact_phone TEXT,
  request_channel public.service_request_channel NOT NULL DEFAULT 'manual',
  gender_requirement public.service_request_gender_req NOT NULL DEFAULT 'none',
  notes TEXT,
  status public.service_request_status NOT NULL DEFAULT 'new',
  created_by UUID,
  updated_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_requests_company_code_unique UNIQUE (company_id, request_code)
);

CREATE INDEX idx_service_requests_company ON public.service_requests(company_id);
CREATE INDEX idx_service_requests_client ON public.service_requests(client_id);
CREATE INDEX idx_service_requests_service_date ON public.service_requests(company_id, service_date DESC);
CREATE INDEX idx_service_requests_status ON public.service_requests(company_id, status);

-- ============================================================
-- service_request_items
-- ============================================================
CREATE TABLE public.service_request_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  role_type public.service_request_role_type NOT NULL DEFAULT 'other',
  role_label TEXT,
  quantity_requested INTEGER NOT NULL DEFAULT 1 CHECK (quantity_requested >= 0),
  billing_unit public.service_request_billing_unit,
  requested_bill_rate NUMERIC(12,2),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_request_items_request ON public.service_request_items(service_request_id);
CREATE INDEX idx_service_request_items_company ON public.service_request_items(company_id);

-- ============================================================
-- service_request_shift_links
-- ============================================================
CREATE TABLE public.service_request_shift_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  service_request_item_id UUID REFERENCES public.service_request_items(id) ON DELETE SET NULL,
  linked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT srsl_unique UNIQUE (service_request_id, shift_id)
);

CREATE INDEX idx_srsl_request ON public.service_request_shift_links(service_request_id);
CREATE INDEX idx_srsl_shift ON public.service_request_shift_links(shift_id);
CREATE INDEX idx_srsl_company ON public.service_request_shift_links(company_id);

-- ============================================================
-- Auto request_code per company: REQ-XXXX
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_service_request_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next INT;
BEGIN
  IF NEW.request_code IS NULL OR NEW.request_code = '' THEN
    SELECT COALESCE(MAX(
      NULLIF(regexp_replace(request_code, '[^0-9]', '', 'g'), '')::INT
    ), 0) + 1
    INTO _next
    FROM public.service_requests
    WHERE company_id = NEW.company_id;

    NEW.request_code := 'REQ-' || LPAD(_next::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_service_request_code
BEFORE INSERT ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.assign_service_request_code();

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_service_requests_updated_at
BEFORE UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_service_request_items_updated_at
BEFORE UPDATE ON public.service_request_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_shift_links ENABLE ROW LEVEL SECURITY;

-- service_requests policies
CREATE POLICY "Members can view requests in their companies"
ON public.service_requests FOR SELECT
USING (
  public.is_global_owner(auth.uid())
  OR company_id IN (SELECT public.user_company_ids(auth.uid()))
);

CREATE POLICY "Admins/owners can insert requests"
ON public.service_requests FOR INSERT
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);

CREATE POLICY "Admins/owners can update requests"
ON public.service_requests FOR UPDATE
USING (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);

CREATE POLICY "Admins/owners can delete requests"
ON public.service_requests FOR DELETE
USING (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
);

-- service_request_items policies (mirror parent)
CREATE POLICY "Members can view request items"
ON public.service_request_items FOR SELECT
USING (
  public.is_global_owner(auth.uid())
  OR company_id IN (SELECT public.user_company_ids(auth.uid()))
);

CREATE POLICY "Admins/owners can insert request items"
ON public.service_request_items FOR INSERT
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);

CREATE POLICY "Admins/owners can update request items"
ON public.service_request_items FOR UPDATE
USING (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);

CREATE POLICY "Admins/owners can delete request items"
ON public.service_request_items FOR DELETE
USING (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);

-- service_request_shift_links policies
CREATE POLICY "Members can view request-shift links"
ON public.service_request_shift_links FOR SELECT
USING (
  public.is_global_owner(auth.uid())
  OR company_id IN (SELECT public.user_company_ids(auth.uid()))
);

CREATE POLICY "Admins/owners can manage request-shift links insert"
ON public.service_request_shift_links FOR INSERT
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);

CREATE POLICY "Admins/owners can manage request-shift links delete"
ON public.service_request_shift_links FOR DELETE
USING (
  public.is_global_owner(auth.uid())
  OR public.is_company_owner(auth.uid(), company_id)
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);