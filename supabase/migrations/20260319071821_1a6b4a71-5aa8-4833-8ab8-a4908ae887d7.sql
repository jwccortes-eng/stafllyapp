
-- ============================================================
-- Phase 3: Hardening — Idempotent posting, locking, traceability
-- ============================================================

-- 1. Expand reconciliation_period_status with new statuses and reopen tracking
ALTER TABLE public.reconciliation_period_status 
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS reopen_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS publish_idempotency_key text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Unique constraint to prevent duplicate posting
CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_period_idempotency 
  ON reconciliation_period_status (publish_idempotency_key) 
  WHERE publish_idempotency_key IS NOT NULL;

-- 2. Expand reconciliation_final_records with full payment breakdown + traceability
ALTER TABLE public.reconciliation_final_records
  ADD COLUMN IF NOT EXISTS daily_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS regular_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_pay_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_pay_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ride_pay_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekend_pay_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_adjustment_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schedule_batch_id text,
  ADD COLUMN IF NOT EXISTS clock_batch_id text,
  ADD COLUMN IF NOT EXISTS payroll_batch_id text,
  ADD COLUMN IF NOT EXISTS match_ids jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS publishing_user uuid,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS warnings jsonb DEFAULT '[]';

-- 3. Period closing receipts
CREATE TABLE IF NOT EXISTS public.reconciliation_closing_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  period_status_id uuid NOT NULL,
  period_label text NOT NULL,
  period_start text NOT NULL,
  period_end text NOT NULL,
  total_employees int DEFAULT 0,
  total_scheduled_shifts int DEFAULT 0,
  total_worked_shifts int DEFAULT 0,
  total_payroll_rows int DEFAULT 0,
  total_regular_hours numeric DEFAULT 0,
  total_overtime_hours numeric DEFAULT 0,
  total_hourly_pay numeric DEFAULT 0,
  total_daily_pay numeric DEFAULT 0,
  total_ride_pay numeric DEFAULT 0,
  total_manual_adjustments numeric DEFAULT 0,
  grand_total_posted numeric DEFAULT 0,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  receipt_data jsonb DEFAULT '{}'
);

ALTER TABLE public.reconciliation_closing_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view closing receipts for their companies"
  ON public.reconciliation_closing_receipts
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Authenticated users can insert closing receipts for their companies"
  ON public.reconciliation_closing_receipts
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 4. Reconciliation permissions
INSERT INTO public.action_permissions (user_id, company_id, action, granted)
SELECT cu.user_id, cu.company_id, perm.action, true
FROM company_users cu
CROSS JOIN (VALUES 
  ('approve_reconciliation_period'),
  ('publish_reconciliation_period'),
  ('reopen_reconciliation_period'),
  ('edit_closed_period'),
  ('view_period_audit')
) AS perm(action)
WHERE cu.role = 'company_owner'
ON CONFLICT DO NOTHING;
