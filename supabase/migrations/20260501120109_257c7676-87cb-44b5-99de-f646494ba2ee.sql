-- =========================================================================
-- FOUNDER FINANCE + SMART IMPORT (Phase 1) — tables + RLS + storage
-- =========================================================================

-- 1. Helper to check founder role (security definer, bypasses RLS on user_roles)
CREATE OR REPLACE FUNCTION public.is_founder(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'founder'::public.app_role
  );
$$;

-- =========================================================================
-- 2. CORE FINANCE TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  institution text,
  account_type text NOT NULL DEFAULT 'checking',
  last4 text,
  currency text NOT NULL DEFAULT 'USD',
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  debt_type text NOT NULL DEFAULT 'credit_card',
  institution text,
  last4 text,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  credit_limit numeric(14,2),
  apr numeric(6,3),
  min_payment numeric(14,2),
  due_day int CHECK (due_day BETWEEN 1 AND 31),
  next_due_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income','transfer')),
  color text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, name)
);

CREATE TABLE IF NOT EXISTS public.finance_transactions_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  debt_id uuid REFERENCES public.finance_debts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  transaction_date date NOT NULL,
  description text,
  merchant text,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  direction text NOT NULL DEFAULT 'expense' CHECK (direction IN ('expense','income','transfer','payment','refund')),
  is_recurring boolean NOT NULL DEFAULT false,
  source_batch_id uuid,
  source_item_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  merchant text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly')),
  next_charge_date date,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  debt_id uuid REFERENCES public.finance_debts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_income_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  expected_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'USD',
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly','one_time')),
  next_payment_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  goal_type text NOT NULL DEFAULT 'savings' CHECK (goal_type IN ('savings','debt_payoff','emergency_fund','investment','other')),
  target_amount numeric(14,2) NOT NULL,
  current_amount numeric(14,2) NOT NULL DEFAULT 0,
  target_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- 3. SMART IMPORT TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.finance_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text,
  source_type text NOT NULL DEFAULT 'unknown'
    CHECK (source_type IN ('csv','pdf_statement','invoice','receipt','screenshot','unknown')),
  source_institution text,
  statement_period_start date,
  statement_period_end date,
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','parsing','parsed','needs_review','approved','rejected','failed')),
  raw_file_path text,
  parser_version text,
  confidence_score numeric(5,2),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.finance_import_extracted_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES public.finance_import_batches(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  item_type text NOT NULL DEFAULT 'transaction'
    CHECK (item_type IN ('transaction','account_summary','recurring_expense_candidate','debt_update','income_candidate')),
  transaction_date date,
  description_raw text,
  merchant_guess text,
  amount numeric(14,2),
  currency text DEFAULT 'USD',
  category_guess text,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  account_guess text,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  debt_id uuid REFERENCES public.finance_debts(id) ON DELETE SET NULL,
  is_recurring_guess boolean NOT NULL DEFAULT false,
  confidence_score numeric(5,2),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','approved','edited','rejected')),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fin_accounts_owner ON public.finance_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fin_debts_owner ON public.finance_debts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fin_cat_owner ON public.finance_categories(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_owner_date ON public.finance_transactions_manual(owner_user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_rec_owner ON public.finance_recurring_expenses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fin_inc_owner ON public.finance_income_sources(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fin_goals_owner ON public.finance_goals(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fin_batches_owner ON public.finance_import_batches(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_items_batch ON public.finance_import_extracted_items(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_fin_items_owner ON public.finance_import_extracted_items(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_owner ON public.finance_audit_log(owner_user_id, created_at DESC);

-- =========================================================================
-- 4. UPDATED_AT TRIGGERS
-- =========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'finance_accounts','finance_debts','finance_categories',
      'finance_transactions_manual','finance_recurring_expenses',
      'finance_income_sources','finance_goals',
      'finance_import_batches','finance_import_extracted_items'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();',
      t, t
    );
  END LOOP;
END$$;

-- =========================================================================
-- 5. RLS — owner-only + must have founder role
-- =========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'finance_accounts','finance_debts','finance_categories',
      'finance_transactions_manual','finance_recurring_expenses',
      'finance_income_sources','finance_goals',
      'finance_import_batches','finance_import_extracted_items',
      'finance_audit_log'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "founder_owner_select" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "founder_owner_insert" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "founder_owner_update" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "founder_owner_delete" ON public.%I;', t);

    EXECUTE format(
      'CREATE POLICY "founder_owner_select" ON public.%I
         FOR SELECT TO authenticated
         USING (owner_user_id = auth.uid() AND public.is_founder(auth.uid()));', t);
    EXECUTE format(
      'CREATE POLICY "founder_owner_insert" ON public.%I
         FOR INSERT TO authenticated
         WITH CHECK (owner_user_id = auth.uid() AND public.is_founder(auth.uid()));', t);
    EXECUTE format(
      'CREATE POLICY "founder_owner_update" ON public.%I
         FOR UPDATE TO authenticated
         USING (owner_user_id = auth.uid() AND public.is_founder(auth.uid()))
         WITH CHECK (owner_user_id = auth.uid() AND public.is_founder(auth.uid()));', t);
    EXECUTE format(
      'CREATE POLICY "founder_owner_delete" ON public.%I
         FOR DELETE TO authenticated
         USING (owner_user_id = auth.uid() AND public.is_founder(auth.uid()));', t);
  END LOOP;
END$$;

-- =========================================================================
-- 6. STORAGE BUCKET (private) + RLS
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('founder-finance', 'founder-finance', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "founder_finance_select" ON storage.objects;
DROP POLICY IF EXISTS "founder_finance_insert" ON storage.objects;
DROP POLICY IF EXISTS "founder_finance_update" ON storage.objects;
DROP POLICY IF EXISTS "founder_finance_delete" ON storage.objects;

CREATE POLICY "founder_finance_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'founder-finance'
    AND public.is_founder(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "founder_finance_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'founder-finance'
    AND public.is_founder(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "founder_finance_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'founder-finance'
    AND public.is_founder(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "founder_finance_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'founder-finance'
    AND public.is_founder(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );