-- =========================================================
-- Sprint: Real role-level fulfillment + audit + hardening
-- =========================================================

-- 1) shift_role_slots: typed vacancies per shift, optionally linked to a service_request_item
CREATE TABLE IF NOT EXISTS public.shift_role_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  role_type public.service_request_role_type NOT NULL,
  role_label TEXT,
  quantity INT NOT NULL CHECK (quantity > 0),
  service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  service_request_item_id UUID REFERENCES public.service_request_items(id) ON DELETE SET NULL,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_role_slots_shift ON public.shift_role_slots(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_role_slots_company ON public.shift_role_slots(company_id);
CREATE INDEX IF NOT EXISTS idx_shift_role_slots_request ON public.shift_role_slots(service_request_id);
CREATE INDEX IF NOT EXISTS idx_shift_role_slots_item ON public.shift_role_slots(service_request_item_id);

ALTER TABLE public.shift_role_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read role slots"
  ON public.shift_role_slots FOR SELECT
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "admins manage role slots"
  ON public.shift_role_slots FOR ALL
  USING (
    public.has_company_role(auth.uid(), company_id, 'admin')
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.is_global_owner(auth.uid())
  )
  WITH CHECK (
    public.has_company_role(auth.uid(), company_id, 'admin')
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.is_global_owner(auth.uid())
  );

CREATE TRIGGER trg_shift_role_slots_updated_at
  BEFORE UPDATE ON public.shift_role_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add role_slot_id to shift_assignments (nullable for backwards compatibility)
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS role_slot_id UUID REFERENCES public.shift_role_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_role_slot ON public.shift_assignments(role_slot_id);

-- 3) Harden assign_service_request_code with advisory lock per company
CREATE OR REPLACE FUNCTION public.assign_service_request_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _next INT;
  _lock_key BIGINT;
BEGIN
  IF NEW.request_code IS NULL OR NEW.request_code = '' THEN
    -- Per-company advisory lock to serialize concurrent inserts
    _lock_key := ('x' || substr(md5('svc_req_code:' || NEW.company_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(_lock_key);

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
$function$;

-- 4) Audit trail trigger for service_requests
CREATE OR REPLACE FUNCTION public.audit_service_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _action TEXT;
  _details JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'service_request_created';
    _details := jsonb_build_object(
      'request_code', NEW.request_code,
      'service_date', NEW.service_date,
      'client_id', NEW.client_id,
      'channel', NEW.request_channel,
      'status', NEW.status
    );
    INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details, new_data)
    VALUES (COALESCE(NEW.created_by, auth.uid()), NEW.company_id, _action, 'service_request', NEW.id::text, _details, to_jsonb(NEW));

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _action := 'service_request_status_changed';
      _details := jsonb_build_object(
        'request_code', NEW.request_code,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'reason', NEW.cancellation_reason
      );
      INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details, old_data, new_data)
      VALUES (COALESCE(NEW.updated_by, auth.uid()), NEW.company_id, _action, 'service_request', NEW.id::text, _details,
              jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    ELSE
      _action := 'service_request_updated';
      _details := jsonb_build_object('request_code', NEW.request_code);
      INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details, old_data, new_data)
      VALUES (COALESCE(NEW.updated_by, auth.uid()), NEW.company_id, _action, 'service_request', NEW.id::text, _details, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_service_requests ON public.service_requests;
CREATE TRIGGER trg_audit_service_requests
  AFTER INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_service_requests();

-- 5) Audit trigger when a shift is linked to a request (= conversion)
CREATE OR REPLACE FUNCTION public.audit_service_request_shift_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _request_code TEXT;
BEGIN
  SELECT request_code INTO _request_code FROM public.service_requests WHERE id = NEW.service_request_id;
  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (
    COALESCE(NEW.linked_by, auth.uid()),
    NEW.company_id,
    'service_request_converted_to_shift',
    'service_request',
    NEW.service_request_id::text,
    jsonb_build_object(
      'request_code', _request_code,
      'shift_id', NEW.shift_id,
      'service_request_item_id', NEW.service_request_item_id
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_service_request_shift_link ON public.service_request_shift_links;
CREATE TRIGGER trg_audit_service_request_shift_link
  AFTER INSERT ON public.service_request_shift_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_service_request_shift_link();