-- Phase 2 — Shift Closeout Final Operational Approval

ALTER TABLE public.shift_closeout_reports
  ADD COLUMN IF NOT EXISTS final_approval_status text,
  ADD COLUMN IF NOT EXISTS final_approved_by uuid,
  ADD COLUMN IF NOT EXISTS final_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_approval_notes text;

DO $$ BEGIN
  ALTER TABLE public.shift_closeout_reports
    ADD CONSTRAINT shift_closeout_reports_final_approval_status_check
    CHECK (final_approval_status IS NULL OR final_approval_status = ANY (ARRAY['pending','approved','rejected','on_hold']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_shift_closeout_reports_final_pending
  ON public.shift_closeout_reports (company_id)
  WHERE status = 'reviewed' AND review_status = 'approved'
    AND (final_approval_status IS NULL OR final_approval_status = 'pending');

-- Helper: who can do operational final approval (Keury-level)
CREATE OR REPLACE FUNCTION public.shift_closeout_can_final_approve(_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(auth.uid(), 'developer'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'founder'::app_role)
    OR (
      _company IS NOT NULL AND (
        public.has_company_role(auth.uid(), _company, 'owner')
        OR public.has_company_role(auth.uid(), _company, 'admin')
      )
    );
$function$;

-- Updated guard trigger
CREATE OR REPLACE FUNCTION public.shift_closeout_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  is_final boolean;
BEGIN
  is_admin := public.shift_closeout_can_admin(NEW.company_id);
  is_final := public.shift_closeout_can_final_approve(NEW.company_id);

  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN
      IF NEW.status IN ('reviewed','rejected')
         OR NEW.reviewed_by IS NOT NULL
         OR NEW.reviewed_at IS NOT NULL
         OR NEW.review_status IS NOT NULL
         OR NEW.review_notes IS NOT NULL
      THEN
        RAISE EXCEPTION 'closeout_review_admin_only';
      END IF;
    END IF;

    -- Non final-approvers cannot pre-populate final_* on insert
    IF NOT is_final THEN
      IF NEW.final_approval_status IS NOT NULL
         OR NEW.final_approved_by IS NOT NULL
         OR NEW.final_approved_at IS NOT NULL
         OR NEW.final_approval_notes IS NOT NULL
      THEN
        RAISE EXCEPTION 'closeout_final_approver_only';
      END IF;
    END IF;

    IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
      NEW.submitted_at := now();
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT is_admin THEN
    IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by)
       OR (NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at)
       OR (NEW.review_status IS DISTINCT FROM OLD.review_status)
       OR (NEW.review_notes IS DISTINCT FROM OLD.review_notes)
    THEN
      RAISE EXCEPTION 'closeout_review_admin_only';
    END IF;
    IF NEW.status IN ('reviewed','rejected') AND OLD.status <> NEW.status THEN
      RAISE EXCEPTION 'closeout_review_admin_only';
    END IF;
    IF OLD.status IN ('reviewed','rejected') OR OLD.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'closeout_locked_for_review';
    END IF;
    IF NEW.company_id <> OLD.company_id
       OR NEW.shift_id <> OLD.shift_id
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.role IS DISTINCT FROM OLD.role
    THEN
      RAISE EXCEPTION 'closeout_immutable_field';
    END IF;
  END IF;

  -- Stamp review fields when admin sets review_status
  IF is_admin
     AND NEW.status = 'reviewed'
     AND (OLD.status IS DISTINCT FROM 'reviewed' OR OLD.review_status IS DISTINCT FROM NEW.review_status)
  THEN
    IF NEW.reviewed_by IS NULL THEN NEW.reviewed_by := auth.uid(); END IF;
    IF NEW.reviewed_at IS NULL THEN NEW.reviewed_at := now(); END IF;
  END IF;

  -- Final approval rules
  IF (NEW.final_approval_status IS DISTINCT FROM OLD.final_approval_status)
     OR (NEW.final_approval_notes IS DISTINCT FROM OLD.final_approval_notes)
     OR (NEW.final_approved_by IS DISTINCT FROM OLD.final_approved_by)
     OR (NEW.final_approved_at IS DISTINCT FROM OLD.final_approved_at)
  THEN
    IF NOT is_final THEN
      RAISE EXCEPTION 'closeout_final_approver_only';
    END IF;

    -- Cannot final-approve unless María already approved
    IF NEW.final_approval_status = 'approved' THEN
      IF NEW.status <> 'reviewed' OR NEW.review_status <> 'approved' THEN
        RAISE EXCEPTION 'closeout_final_requires_review_approved';
      END IF;
      IF NEW.final_approved_by IS NULL THEN NEW.final_approved_by := auth.uid(); END IF;
      IF NEW.final_approved_at IS NULL THEN NEW.final_approved_at := now(); END IF;
    END IF;

    -- For rejected / on_hold, stamp actor + time as well
    IF NEW.final_approval_status IN ('rejected','on_hold') THEN
      IF NEW.final_approved_by IS NULL THEN NEW.final_approved_by := auth.uid(); END IF;
      IF NEW.final_approved_at IS NULL THEN NEW.final_approved_at := now(); END IF;
    END IF;

    -- Audit log
    BEGIN
      INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, old_data, new_data, details)
      VALUES (
        COALESCE(auth.uid(), NEW.final_approved_by),
        NEW.company_id,
        'shift_closeout_final_approval',
        'shift_closeout_reports',
        NEW.id::text,
        jsonb_build_object(
          'final_approval_status', OLD.final_approval_status,
          'final_approval_notes',  OLD.final_approval_notes
        ),
        jsonb_build_object(
          'final_approval_status', NEW.final_approval_status,
          'final_approval_notes',  NEW.final_approval_notes,
          'final_approved_by',     NEW.final_approved_by,
          'final_approved_at',     NEW.final_approved_at
        ),
        jsonb_build_object('shift_id', NEW.shift_id)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never block the closeout update if audit insert fails
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
