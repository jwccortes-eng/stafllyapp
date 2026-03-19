
-- Enums
CREATE TYPE public.financial_record_type AS ENUM ('advance', 'loan');
CREATE TYPE public.financial_record_status AS ENUM ('draft', 'pending_approval', 'approved', 'active', 'paused', 'paid', 'cancelled', 'closed_manually', 'written_off');
CREATE TYPE public.repayment_mode AS ENUM ('fixed_amount', 'percentage_net', 'percentage_gross', 'one_time_next', 'manual', 'hybrid');
CREATE TYPE public.financial_transaction_type AS ENUM ('disbursement', 'payroll_deduction', 'manual_adjustment_add', 'manual_adjustment_reduce', 'pause', 'resume', 'approval', 'cancellation', 'manual_close', 'reversal', 'refund', 'writeoff', 'repayment_outside_payroll');
CREATE TYPE public.financial_category AS ENUM ('payroll_advance', 'employee_loan', 'transport_support', 'emergency_support', 'payroll_correction', 'equipment_deduction', 'uniform_related', 'other');
CREATE TYPE public.deduction_priority_mode AS ENUM ('oldest_first', 'newest_first', 'highest_balance_first', 'manual_priority');
CREATE TYPE public.payment_source_method AS ENUM ('cash', 'zelle', 'transfer', 'check', 'payroll_offset', 'other');

-- Sequence for reference codes
CREATE SEQUENCE public.financial_advance_seq START 1;
CREATE SEQUENCE public.financial_loan_seq START 1;

-- TABLE 1: Main advances/loans records
CREATE TABLE public.employee_financial_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  record_type public.financial_record_type NOT NULL,
  category public.financial_category NOT NULL DEFAULT 'payroll_advance',
  reference_code TEXT NOT NULL DEFAULT '',
  status public.financial_record_status NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  original_amount NUMERIC(12,2) NOT NULL CHECK (original_amount > 0),
  balance_remaining NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  repayment_mode public.repayment_mode NOT NULL DEFAULT 'fixed_amount',
  fixed_amount_per_cut NUMERIC(12,2),
  percentage_per_cut NUMERIC(5,2),
  minimum_payment NUMERIC(12,2),
  maximum_payment_per_cut NUMERIC(12,2),
  protect_minimum_net_pay BOOLEAN NOT NULL DEFAULT true,
  protect_negative_payroll BOOLEAN NOT NULL DEFAULT true,
  priority_order INTEGER,
  auto_deduct_enabled BOOLEAN NOT NULL DEFAULT true,
  payment_source public.payment_source_method DEFAULT 'cash',
  repayment_start_date DATE,
  expected_end_date DATE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  approval_note TEXT,
  created_by UUID NOT NULL,
  updated_by UUID,
  notes_internal TEXT,
  employee_visible_notes TEXT,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  is_transport_related BOOLEAN NOT NULL DEFAULT false,
  linked_shift_id UUID,
  linked_period_id UUID REFERENCES public.pay_periods(id),
  company_policy_snapshot JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Auto-generate reference codes
CREATE OR REPLACE FUNCTION public.auto_generate_financial_ref_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _prefix TEXT;
  _seq BIGINT;
  _company_code TEXT;
BEGIN
  IF NEW.reference_code IS NOT NULL AND NEW.reference_code != '' THEN
    RETURN NEW;
  END IF;
  
  SELECT UPPER(LEFT(REPLACE(slug, '-', ''), 4)) INTO _company_code
  FROM companies WHERE id = NEW.company_id;
  
  IF NEW.record_type = 'advance' THEN
    _prefix := 'ADV';
    _seq := nextval('public.financial_advance_seq');
  ELSE
    _prefix := 'LOAN';
    _seq := nextval('public.financial_loan_seq');
  END IF;
  
  NEW.reference_code := _prefix || '-' || COALESCE(_company_code, 'XXXX') || '-' || LPAD(_seq::text, 6, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_financial_ref_code
  BEFORE INSERT ON public.employee_financial_records
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_financial_ref_code();

-- Auto update updated_at
CREATE TRIGGER trg_financial_records_updated_at
  BEFORE UPDATE ON public.employee_financial_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 2: Ledger transactions
CREATE TABLE public.employee_financial_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES public.employee_financial_records(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.pay_periods(id),
  transaction_type public.financial_transaction_type NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_before NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- TABLE 3: Attachments
CREATE TABLE public.employee_financial_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES public.employee_financial_records(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE 4: Company financial policies
CREATE TABLE public.company_financial_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  advances_enabled BOOLEAN NOT NULL DEFAULT true,
  loans_enabled BOOLEAN NOT NULL DEFAULT true,
  require_approval BOOLEAN NOT NULL DEFAULT true,
  max_advance_amount NUMERIC(12,2),
  max_loan_amount NUMERIC(12,2),
  default_repayment_mode public.repayment_mode DEFAULT 'fixed_amount',
  max_deduction_percent_of_net NUMERIC(5,2),
  protect_minimum_net_pay_amount NUMERIC(12,2),
  allow_multiple_active BOOLEAN NOT NULL DEFAULT true,
  deduction_priority public.deduction_priority_mode DEFAULT 'oldest_first',
  default_fixed_amount NUMERIC(12,2),
  default_percentage NUMERIC(5,2),
  allow_transport_advances BOOLEAN NOT NULL DEFAULT true,
  allow_outside_payroll_repayments BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_financial_policies_updated_at
  BEFORE UPDATE ON public.company_financial_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_financial_records_company ON public.employee_financial_records(company_id);
CREATE INDEX idx_financial_records_employee ON public.employee_financial_records(employee_id);
CREATE INDEX idx_financial_records_status ON public.employee_financial_records(status);
CREATE INDEX idx_financial_records_type ON public.employee_financial_records(record_type);
CREATE INDEX idx_financial_records_issue_date ON public.employee_financial_records(issue_date);
CREATE INDEX idx_financial_records_ref_code ON public.employee_financial_records(reference_code);
CREATE INDEX idx_financial_records_active ON public.employee_financial_records(company_id, employee_id, status) WHERE deleted_at IS NULL;

CREATE INDEX idx_financial_ledger_record ON public.employee_financial_ledger(record_id);
CREATE INDEX idx_financial_ledger_company ON public.employee_financial_ledger(company_id);
CREATE INDEX idx_financial_ledger_employee ON public.employee_financial_ledger(employee_id);
CREATE INDEX idx_financial_ledger_date ON public.employee_financial_ledger(transaction_date);

CREATE INDEX idx_financial_attachments_record ON public.employee_financial_attachments(record_id);

-- RLS
ALTER TABLE public.employee_financial_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_financial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_financial_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_financial_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies: company-scoped access for authenticated users with admin roles or global owners
CREATE POLICY "financial_records_select" ON public.employee_financial_records
  FOR SELECT TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_records_insert" ON public.employee_financial_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_records_update" ON public.employee_financial_records
  FOR UPDATE TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_ledger_select" ON public.employee_financial_ledger
  FOR SELECT TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_ledger_insert" ON public.employee_financial_ledger
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_attachments_select" ON public.employee_financial_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_attachments_insert" ON public.employee_financial_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_policies_select" ON public.company_financial_policies
  FOR SELECT TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "financial_policies_upsert" ON public.company_financial_policies
  FOR ALL TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );
