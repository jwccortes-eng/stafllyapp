-- Sprint 27: payroll_review_notes MVP
-- Operational review notes for the Root-Cause Review flow.
-- Notes are context only: they never approve, modify, recalculate or export payroll.

CREATE TABLE IF NOT EXISTS public.payroll_review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period_id uuid NULL,
  worker_id uuid NULL,
  reason text NULL,
  time_entry_id uuid NULL,
  shift_id uuid NULL,
  source_module text NOT NULL DEFAULT 'root_cause_explorer',
  note text NOT NULL,
  status text NULL,
  created_by uuid NOT NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NULL,
  archived_at timestamptz NULL,
  archived_by uuid NULL,
  CONSTRAINT payroll_review_notes_note_len
    CHECK (char_length(note) BETWEEN 1 AND 2000),
  CONSTRAINT payroll_review_notes_status_allowed
    CHECK (status IS NULL OR status IN (
      'verified','needs_correction','pending_supervisor','review_time_entry'
    )),
  CONSTRAINT payroll_review_notes_source_module_allowed
    CHECK (source_module IN ('root_cause_explorer'))
);

-- MANDATORY grants (Data API access) — no anon; auth-only.
GRANT SELECT, INSERT ON public.payroll_review_notes TO authenticated;
GRANT ALL ON public.payroll_review_notes TO service_role;

ALTER TABLE public.payroll_review_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant-scoped + payroll module view permission
CREATE POLICY "Users can view review notes in their company"
  ON public.payroll_review_notes
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_module_permission(auth.uid(), 'payroll', 'view')
  );

-- INSERT: tenant-scoped + payroll module edit permission + author must be auth.uid()
CREATE POLICY "Users can insert review notes in their company"
  ON public.payroll_review_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_module_permission(auth.uid(), 'payroll', 'edit')
    AND created_by = auth.uid()
    AND archived_at IS NULL
    AND archived_by IS NULL
    AND updated_at IS NULL
    AND updated_by IS NULL
  );

-- No UPDATE policy in MVP → all updates blocked by RLS.
-- No DELETE policy → all deletes blocked by RLS. Physical delete is forbidden.

-- Helpful indexes for the RootCauseExplorer listing query.
CREATE INDEX IF NOT EXISTS payroll_review_notes_ctx_idx
  ON public.payroll_review_notes (company_id, period_id, worker_id, reason)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS payroll_review_notes_worker_recent_idx
  ON public.payroll_review_notes (company_id, worker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payroll_review_notes_created_by_idx
  ON public.payroll_review_notes (created_by, created_at DESC);

COMMENT ON TABLE public.payroll_review_notes IS
  'Sprint 27 MVP. Operational review notes for Root-Cause Review. Context only: never approves, modifies, recalculates or exports payroll. Never edited or deleted in MVP.';
