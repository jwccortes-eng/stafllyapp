
-- Phase 17B Hardening: enforce review-field protection on shift_closeout_reports
-- Adds a guard trigger and audit hooks; tightens UPDATE policy so admin can review
-- while non-admin submitters cannot escalate status or set review fields.

-- 1) Replace UPDATE policy: admins get full update; submitter limited to draft/submitted
DROP POLICY IF EXISTS closeout_update_submitter_or_admin ON public.shift_closeout_reports;

CREATE POLICY closeout_update_admin
ON public.shift_closeout_reports
FOR UPDATE
TO authenticated
USING (public.shift_closeout_can_admin(company_id))
WITH CHECK (public.shift_closeout_can_admin(company_id));

CREATE POLICY closeout_update_submitter_operational
ON public.shift_closeout_reports
FOR UPDATE
TO authenticated
USING (
  submitted_by = auth.uid()
  AND status IN ('draft','submitted')
  AND reviewed_at IS NULL
  AND NOT public.shift_closeout_can_admin(company_id)
)
WITH CHECK (
  submitted_by = auth.uid()
  AND status IN ('draft','submitted')
  AND reviewed_at IS NULL
);

-- 2) Field-level guard trigger
CREATE OR REPLACE FUNCTION public.shift_closeout_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  is_admin := public.shift_closeout_can_admin(NEW.company_id);

  IF TG_OP = 'INSERT' THEN
    -- Non-admin cannot create rows already in review states
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

    IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
      NEW.submitted_at := now();
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT is_admin THEN
    -- Block any change to review fields
    IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by)
       OR (NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at)
       OR (NEW.review_status IS DISTINCT FROM OLD.review_status)
       OR (NEW.review_notes IS DISTINCT FROM OLD.review_notes)
    THEN
      RAISE EXCEPTION 'closeout_review_admin_only';
    END IF;
    -- Block escalation to reviewed/rejected
    IF NEW.status IN ('reviewed','rejected') AND OLD.status <> NEW.status THEN
      RAISE EXCEPTION 'closeout_review_admin_only';
    END IF;
    -- Block edits once reviewed
    IF OLD.status IN ('reviewed','rejected') OR OLD.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'closeout_locked_for_review';
    END IF;
    -- Lock immutable identifiers for non-admin
    IF NEW.company_id <> OLD.company_id
       OR NEW.shift_id <> OLD.shift_id
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.role IS DISTINCT FROM OLD.role
    THEN
      RAISE EXCEPTION 'closeout_immutable_field';
    END IF;
  END IF;

  -- Auto-stamp submitted_at on transition to submitted
  IF NEW.status = 'submitted' AND OLD.status <> 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  -- Auto-stamp reviewer fields when admin sets review_status or moves to reviewed/rejected
  IF is_admin THEN
    IF (NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status IS NOT NULL)
       OR (NEW.status IN ('reviewed','rejected') AND OLD.status <> NEW.status)
    THEN
      IF NEW.reviewed_by IS NULL THEN
        NEW.reviewed_by := auth.uid();
      END IF;
      IF NEW.reviewed_at IS NULL THEN
        NEW.reviewed_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_closeout_guard ON public.shift_closeout_reports;
CREATE TRIGGER trg_shift_closeout_guard
BEFORE INSERT OR UPDATE ON public.shift_closeout_reports
FOR EACH ROW
EXECUTE FUNCTION public.shift_closeout_guard();

-- 3) Audit hook (best-effort) into shift_audit_log
CREATE OR REPLACE FUNCTION public.shift_closeout_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN NEW.status = 'submitted' THEN 'closeout_submitted' ELSE 'closeout_updated' END;
  ELSIF (NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status IS NOT NULL)
        OR (NEW.status IN ('reviewed','rejected') AND OLD.status <> NEW.status) THEN
    v_action := 'closeout_reviewed';
  ELSIF NEW.status = 'submitted' AND OLD.status <> 'submitted' THEN
    v_action := 'closeout_submitted';
  ELSE
    v_action := 'closeout_updated';
  END IF;

  BEGIN
    INSERT INTO public.shift_audit_log (
      company_id, shift_id, actor_user_id, action,
      before_data, after_data, source
    ) VALUES (
      NEW.company_id, NEW.shift_id, v_actor, v_action,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      to_jsonb(NEW),
      'shift_closeout_reports'
    );
  EXCEPTION WHEN OTHERS THEN
    -- best-effort; never block primary write
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_closeout_audit ON public.shift_closeout_reports;
CREATE TRIGGER trg_shift_closeout_audit
AFTER INSERT OR UPDATE ON public.shift_closeout_reports
FOR EACH ROW
EXECUTE FUNCTION public.shift_closeout_audit();
