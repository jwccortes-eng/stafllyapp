
-- Sprint 29 · Payroll Review Notes Archive MVP
-- Add archive-only UPDATE policy + defensive trigger enforcing immutability
-- of context/content fields. No DELETE policy (physical delete forbidden).

CREATE OR REPLACE FUNCTION public.prevent_payroll_review_notes_unsafe_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Immutable context / content / audit-source fields.
  IF NEW.company_id     IS DISTINCT FROM OLD.company_id     THEN RAISE EXCEPTION 'payroll_review_notes: company_id is immutable'; END IF;
  IF NEW.period_id      IS DISTINCT FROM OLD.period_id      THEN RAISE EXCEPTION 'payroll_review_notes: period_id is immutable'; END IF;
  IF NEW.worker_id      IS DISTINCT FROM OLD.worker_id      THEN RAISE EXCEPTION 'payroll_review_notes: worker_id is immutable'; END IF;
  IF NEW.reason         IS DISTINCT FROM OLD.reason         THEN RAISE EXCEPTION 'payroll_review_notes: reason is immutable'; END IF;
  IF NEW.time_entry_id  IS DISTINCT FROM OLD.time_entry_id  THEN RAISE EXCEPTION 'payroll_review_notes: time_entry_id is immutable'; END IF;
  IF NEW.shift_id       IS DISTINCT FROM OLD.shift_id       THEN RAISE EXCEPTION 'payroll_review_notes: shift_id is immutable'; END IF;
  IF NEW.source_module  IS DISTINCT FROM OLD.source_module  THEN RAISE EXCEPTION 'payroll_review_notes: source_module is immutable'; END IF;
  IF NEW.note           IS DISTINCT FROM OLD.note           THEN RAISE EXCEPTION 'payroll_review_notes: note content is immutable in MVP'; END IF;
  IF NEW.status         IS DISTINCT FROM OLD.status         THEN RAISE EXCEPTION 'payroll_review_notes: status is immutable in MVP'; END IF;
  IF NEW.created_by     IS DISTINCT FROM OLD.created_by     THEN RAISE EXCEPTION 'payroll_review_notes: created_by is immutable'; END IF;
  IF NEW.created_at     IS DISTINCT FROM OLD.created_at     THEN RAISE EXCEPTION 'payroll_review_notes: created_at is immutable'; END IF;

  -- Un-archive is forbidden.
  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'payroll_review_notes: cannot un-archive a note';
  END IF;

  -- Only allowed transition: null -> archived (archived_at, archived_by must be set together).
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    IF NEW.archived_by IS NULL OR NEW.archived_by <> auth.uid() THEN
      RAISE EXCEPTION 'payroll_review_notes: archived_by must equal auth.uid()';
    END IF;
    -- Force audit fields.
    NEW.archived_at := now();
    NEW.updated_at  := now();
    NEW.updated_by  := auth.uid();
    RETURN NEW;
  END IF;

  -- Already archived: nothing else may change.
  IF OLD.archived_at IS NOT NULL THEN
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.archived_by IS DISTINCT FROM OLD.archived_by THEN
      RAISE EXCEPTION 'payroll_review_notes: archived notes are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payroll_review_notes_unsafe_update ON public.payroll_review_notes;
CREATE TRIGGER trg_prevent_payroll_review_notes_unsafe_update
BEFORE UPDATE ON public.payroll_review_notes
FOR EACH ROW EXECUTE FUNCTION public.prevent_payroll_review_notes_unsafe_update();

-- Archive-only UPDATE policy.
DROP POLICY IF EXISTS "Users can archive review notes in their company" ON public.payroll_review_notes;
CREATE POLICY "Users can archive review notes in their company"
ON public.payroll_review_notes
FOR UPDATE
TO authenticated
USING (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_module_permission(auth.uid(), 'payroll', 'edit')
  AND archived_at IS NULL
)
WITH CHECK (
  company_id IN (SELECT user_company_ids(auth.uid()))
  AND has_module_permission(auth.uid(), 'payroll', 'edit')
  AND archived_at IS NOT NULL
  AND archived_by = auth.uid()
);
