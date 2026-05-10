-- Phase 17B — Daily Close / Captain Verification v1 (additive only)

-- Tenant-scoped admin helper used by shift_closeout_reports RLS
CREATE OR REPLACE FUNCTION public.shift_closeout_can_admin(_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'founder'::app_role)
    OR (
      _company IS NOT NULL AND (
        public.has_company_role(auth.uid(), _company, 'admin')
        OR public.has_company_role(auth.uid(), _company, 'manager')
        OR public.has_company_role(auth.uid(), _company, 'owner')
        OR public.has_company_role(auth.uid(), _company, 'supervisor')
      )
    );
$$;

CREATE TABLE public.shift_closeout_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,

  submitted_by uuid NOT NULL,
  submitted_employee_id uuid,
  role text NOT NULL CHECK (role IN ('captain','shift_admin','manager','admin')),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','reviewed','rejected')),

  staff_count_reported integer CHECK (staff_count_reported IS NULL OR staff_count_reported >= 0),
  no_show_count        integer NOT NULL DEFAULT 0 CHECK (no_show_count >= 0),
  late_count           integer NOT NULL DEFAULT 0 CHECK (late_count >= 0),
  incident_count       integer NOT NULL DEFAULT 0 CHECK (incident_count >= 0),

  notes text,
  uniform_ok boolean,
  client_feedback text,

  ready_for_admin_review boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,

  reviewed_by uuid,
  reviewed_at timestamptz,
  review_status text
    CHECK (review_status IS NULL OR review_status IN ('approved','needs_followup','escalated','rejected')),
  review_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shift_closeout_reports_unique_shift UNIQUE (shift_id)
);

CREATE INDEX idx_shift_closeout_reports_company_status
  ON public.shift_closeout_reports (company_id, status);

CREATE INDEX idx_shift_closeout_reports_pending_review
  ON public.shift_closeout_reports (company_id)
  WHERE status = 'submitted' AND reviewed_at IS NULL;

CREATE OR REPLACE FUNCTION public.shift_closeout_reports_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shift_closeout_reports_updated_at
BEFORE UPDATE ON public.shift_closeout_reports
FOR EACH ROW
EXECUTE FUNCTION public.shift_closeout_reports_set_updated_at();

ALTER TABLE public.shift_closeout_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closeout_select_admin_or_submitter"
ON public.shift_closeout_reports
FOR SELECT
TO authenticated
USING (
  public.shift_closeout_can_admin(company_id)
  OR submitted_by = auth.uid()
);

CREATE POLICY "closeout_insert_authorized"
ON public.shift_closeout_reports
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND (
    public.shift_closeout_can_admin(company_id)
    OR EXISTS (
      SELECT 1
      FROM public.scheduled_shifts s
      JOIN public.employees e ON e.id = s.shift_admin_id
      WHERE s.id = shift_closeout_reports.shift_id
        AND s.company_id = shift_closeout_reports.company_id
        AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.shift_assignments sa
      JOIN public.employees e ON e.id = sa.employee_id
      WHERE sa.shift_id = shift_closeout_reports.shift_id
        AND e.user_id = auth.uid()
        AND sa.assignment_role IN ('captain','shift_admin')
    )
  )
);

CREATE POLICY "closeout_update_submitter_or_admin"
ON public.shift_closeout_reports
FOR UPDATE
TO authenticated
USING (
  status IN ('draft','submitted')
  AND reviewed_at IS NULL
  AND (
    public.shift_closeout_can_admin(company_id)
    OR submitted_by = auth.uid()
  )
)
WITH CHECK (
  public.shift_closeout_can_admin(company_id)
  OR submitted_by = auth.uid()
);
-- No DELETE policy → deletes are forbidden under RLS.
