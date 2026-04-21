-- ============================================================================
-- TENANT INVOICING — PHASE 1: PASSIVE SCHEMA
-- ============================================================================

-- ---------- STEP 0: Rename legacy prototype tables ----------
DO $$ BEGIN
  -- Drop legacy triggers/policies first to avoid identifier conflicts after rename
  DROP TRIGGER IF EXISTS trg_generate_invoice_number ON public.invoices;
  DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.invoices RENAME TO legacy_invoices;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.invoice_line_items RENAME TO legacy_invoice_line_items;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Re-attach safe updated_at trigger to legacy_invoices (column exists there)
DO $$ BEGIN
  CREATE TRIGGER trg_legacy_invoices_updated_at
    BEFORE UPDATE ON public.legacy_invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Rename existing policies on legacy tables (idempotent)
DO $$ BEGIN
  ALTER POLICY "Admins can manage invoices" ON public.legacy_invoices RENAME TO "Admins can manage legacy_invoices";
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER POLICY "Users can view invoices of their company" ON public.legacy_invoices RENAME TO "Users can view legacy_invoices of their company";
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER POLICY "Admins can manage invoice_line_items" ON public.legacy_invoice_line_items RENAME TO "Admins can manage legacy_invoice_line_items";
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER POLICY "Users can view invoice_line_items of their company" ON public.legacy_invoice_line_items RENAME TO "Users can view legacy_invoice_line_items of their company";
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ============================================================================
-- ENUMS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.billable_unit AS ENUM ('hour', 'day', 'flat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_block_source_type AS ENUM ('attendance', 'approval', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_block_source_status AS ENUM ('pending', 'approved', 'adjusted', 'invoiced', 'discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'finalized', 'sent', 'partially_paid', 'paid', 'overdue', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_line_type AS ENUM ('service', 'fee', 'discount', 'tax', 'adjustment', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_payment_method AS ENUM ('zelle', 'check', 'ach', 'cash', 'card', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_activity_action AS ENUM ('created', 'edited', 'finalized', 'sent', 'payment_recorded', 'paid', 'voided', 'reopened');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 1. billing_clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operational_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  email TEXT,
  phone TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  billing_country TEXT DEFAULT 'US',
  tax_id TEXT,
  payment_terms TEXT DEFAULT 'net_30',
  default_currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_clients_company ON public.billing_clients(company_id);
CREATE INDEX IF NOT EXISTS idx_billing_clients_operational ON public.billing_clients(operational_client_id) WHERE operational_client_id IS NOT NULL;

ALTER TABLE public.billing_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_clients_select_company_members"
  ON public.billing_clients FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "billing_clients_insert_admins"
  ON public.billing_clients FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "billing_clients_update_admins"
  ON public.billing_clients FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "billing_clients_delete_admins"
  ON public.billing_clients FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

CREATE TRIGGER trg_billing_clients_updated_at
  BEFORE UPDATE ON public.billing_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. billing_client_locations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_client_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.billing_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_client_locations_company ON public.billing_client_locations(company_id);
CREATE INDEX IF NOT EXISTS idx_billing_client_locations_client ON public.billing_client_locations(client_id);

ALTER TABLE public.billing_client_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_client_locations_select_company_members"
  ON public.billing_client_locations FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "billing_client_locations_insert_admins"
  ON public.billing_client_locations FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "billing_client_locations_update_admins"
  ON public.billing_client_locations FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "billing_client_locations_delete_admins"
  ON public.billing_client_locations FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

CREATE TRIGGER trg_billing_client_locations_updated_at
  BEFORE UPDATE ON public.billing_client_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. billable_service_blocks (CORE) — passive
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billable_service_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.billing_clients(id) ON DELETE RESTRICT,
  client_location_id UUID REFERENCES public.billing_client_locations(id) ON DELETE SET NULL,
  shift_group_id UUID,
  service_date DATE NOT NULL,
  service_type TEXT,
  billable_unit public.billable_unit NOT NULL DEFAULT 'hour',
  workers_count INTEGER NOT NULL DEFAULT 0,
  qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  description_rendered TEXT,
  source_type public.service_block_source_type NOT NULL DEFAULT 'manual',
  source_status public.service_block_source_status NOT NULL DEFAULT 'pending',
  approval_status TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  invoice_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bsb_company ON public.billable_service_blocks(company_id);
CREATE INDEX IF NOT EXISTS idx_bsb_client ON public.billable_service_blocks(client_id);
CREATE INDEX IF NOT EXISTS idx_bsb_status ON public.billable_service_blocks(company_id, source_status);
CREATE INDEX IF NOT EXISTS idx_bsb_invoice ON public.billable_service_blocks(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsb_shift_group ON public.billable_service_blocks(shift_group_id) WHERE shift_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bsb_service_date ON public.billable_service_blocks(company_id, service_date);

ALTER TABLE public.billable_service_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bsb_select_company_members"
  ON public.billable_service_blocks FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "bsb_insert_admins"
  ON public.billable_service_blocks FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "bsb_update_admins"
  ON public.billable_service_blocks FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "bsb_delete_admins"
  ON public.billable_service_blocks FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

CREATE TRIGGER trg_bsb_updated_at
  BEFORE UPDATE ON public.billable_service_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. billable_service_block_entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billable_service_block_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_block_id UUID NOT NULL REFERENCES public.billable_service_blocks(id) ON DELETE CASCADE,
  workers INTEGER NOT NULL DEFAULT 1,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  hours NUMERIC(8,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bsbe_block ON public.billable_service_block_entries(service_block_id);

ALTER TABLE public.billable_service_block_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bsbe_select_via_parent"
  ON public.billable_service_block_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.billable_service_blocks b
    WHERE b.id = billable_service_block_entries.service_block_id
      AND b.company_id IN (SELECT public.user_company_ids(auth.uid()))
  ));
CREATE POLICY "bsbe_insert_via_parent_admin"
  ON public.billable_service_block_entries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.billable_service_blocks b
    WHERE b.id = billable_service_block_entries.service_block_id
      AND public.user_is_company_admin(auth.uid(), b.company_id)
  ));
CREATE POLICY "bsbe_update_via_parent_admin"
  ON public.billable_service_block_entries FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.billable_service_blocks b
    WHERE b.id = billable_service_block_entries.service_block_id
      AND public.user_is_company_admin(auth.uid(), b.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.billable_service_blocks b
    WHERE b.id = billable_service_block_entries.service_block_id
      AND public.user_is_company_admin(auth.uid(), b.company_id)
  ));
CREATE POLICY "bsbe_delete_via_parent_admin"
  ON public.billable_service_block_entries FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.billable_service_blocks b
    WHERE b.id = billable_service_block_entries.service_block_id
      AND public.user_is_company_admin(auth.uid(), b.company_id)
  ));

-- ============================================================================
-- 5. invoices  (per-company auto invoice_number)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.billing_clients(id) ON DELETE RESTRICT,
  invoice_number INTEGER NOT NULL DEFAULT 0,
  subject TEXT,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  terms TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustment_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  payment_instructions TEXT,
  footer_message TEXT,
  finalized_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_invoice_number_per_company UNIQUE (company_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON public.invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON public.invoices(company_id, invoice_date);

DO $$ BEGIN
  ALTER TABLE public.billable_service_blocks
    ADD CONSTRAINT fk_bsb_invoice
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_company_members"
  ON public.invoices FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "invoices_insert_admins"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "invoices_update_admins"
  ON public.invoices FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "invoices_delete_admins"
  ON public.invoices FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-company invoice_number auto-assignment using advisory locks
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next INT;
  _lock_key BIGINT;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = 0 THEN
    _lock_key := ('x' || substr(md5('invoice_number:' || NEW.company_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(_lock_key);

    SELECT COALESCE(MAX(invoice_number), 0) + 1
      INTO _next
      FROM public.invoices
     WHERE company_id = NEW.company_id;

    NEW.invoice_number := _next;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- ============================================================================
-- 6. invoice_lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  source_service_block_id UUID REFERENCES public.billable_service_blocks(id) ON DELETE SET NULL,
  line_order INTEGER NOT NULL DEFAULT 0,
  line_type public.invoice_line_type NOT NULL DEFAULT 'service',
  description TEXT NOT NULL DEFAULT '',
  qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_lines_block
  ON public.invoice_lines(source_service_block_id)
  WHERE source_service_block_id IS NOT NULL;

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_lines_select_via_parent"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.company_id IN (SELECT public.user_company_ids(auth.uid()))
  ));
CREATE POLICY "invoice_lines_insert_via_parent_admin"
  ON public.invoice_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_is_company_admin(auth.uid(), i.company_id)
  ));
CREATE POLICY "invoice_lines_update_via_parent_admin"
  ON public.invoice_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_is_company_admin(auth.uid(), i.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_is_company_admin(auth.uid(), i.company_id)
  ));
CREATE POLICY "invoice_lines_delete_via_parent_admin"
  ON public.invoice_lines FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_is_company_admin(auth.uid(), i.company_id)
  ));

CREATE TRIGGER trg_invoice_lines_updated_at
  BEFORE UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 7. invoice_payments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  method public.invoice_payment_method NOT NULL DEFAULT 'other',
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_company ON public.invoice_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_payments_select_company_members"
  ON public.invoice_payments FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "invoice_payments_insert_admins"
  ON public.invoice_payments FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "invoice_payments_update_admins"
  ON public.invoice_payments FOR UPDATE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));
CREATE POLICY "invoice_payments_delete_admins"
  ON public.invoice_payments FOR DELETE TO authenticated
  USING (public.user_is_company_admin(auth.uid(), company_id));

-- ============================================================================
-- 8. invoice_activity_log (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoice_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action public.invoice_activity_action NOT NULL,
  actor_user_id UUID,
  old_values_json JSONB,
  new_values_json JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_log_invoice ON public.invoice_activity_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_log_company ON public.invoice_activity_log(company_id);

ALTER TABLE public.invoice_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_activity_log_select_company_members"
  ON public.invoice_activity_log FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "invoice_activity_log_insert_admins"
  ON public.invoice_activity_log FOR INSERT TO authenticated
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

-- Append-only: no UPDATE/DELETE policies.

-- ============================================================================
-- Activity log automation (safe, append-only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_invoice_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action public.invoice_activity_action;
  _actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    INSERT INTO public.invoice_activity_log (company_id, invoice_id, action, actor_user_id, new_values_json)
    VALUES (NEW.company_id, NEW.id, _action, _actor, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _action := CASE NEW.status
        WHEN 'finalized' THEN 'finalized'::public.invoice_activity_action
        WHEN 'sent' THEN 'sent'::public.invoice_activity_action
        WHEN 'paid' THEN 'paid'::public.invoice_activity_action
        WHEN 'void' THEN 'voided'::public.invoice_activity_action
        WHEN 'draft' THEN 'reopened'::public.invoice_activity_action
        ELSE 'edited'::public.invoice_activity_action
      END;
    ELSE
      _action := 'edited';
    END IF;

    INSERT INTO public.invoice_activity_log (
      company_id, invoice_id, action, actor_user_id,
      old_values_json, new_values_json
    ) VALUES (
      NEW.company_id, NEW.id, _action, _actor,
      to_jsonb(OLD), to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_invoice_activity ON public.invoices;
CREATE TRIGGER trg_log_invoice_activity
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_activity();
