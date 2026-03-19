
CREATE TABLE public.reconciliation_period_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_status_id uuid NOT NULL,
  event_type text NOT NULL,
  event_label text NOT NULL,
  detail text,
  performed_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_period_journal_period ON reconciliation_period_journal(period_status_id);
CREATE INDEX idx_period_journal_company ON reconciliation_period_journal(company_id);

ALTER TABLE reconciliation_period_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view journal" ON reconciliation_period_journal
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company members can insert journal" ON reconciliation_period_journal
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));
