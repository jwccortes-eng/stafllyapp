-- Photo Review Status v2 — StaflyCore only.
-- Adds 4 persistent review fields to public.employees.
-- No payroll/time_entries/shifts/auth/notifications/SSN-EIN touched.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS photo_review_status   text,
  ADD COLUMN IF NOT EXISTS photo_reviewed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS photo_reviewed_by     uuid,
  ADD COLUMN IF NOT EXISTS photo_rejection_reason text;

-- Validate allowed values (text + CHECK, no enum — easier to evolve).
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_photo_review_status_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_photo_review_status_check
  CHECK (photo_review_status IS NULL
         OR photo_review_status IN ('pending','approved','rejected'));

-- Index for the admin photo review queue.
CREATE INDEX IF NOT EXISTS idx_employees_photo_review_status
  ON public.employees (company_id, photo_review_status)
  WHERE photo_review_status IS NOT NULL;

-- Backfill: active workers who already have a photo become 'pending' review.
-- Workers without avatar_url stay NULL (derived "Foto requerida" in UI).
-- Inactive workers stay NULL to keep queues quiet.
UPDATE public.employees
   SET photo_review_status = 'pending'
 WHERE is_active = true
   AND avatar_url IS NOT NULL
   AND length(btrim(avatar_url)) > 0
   AND photo_review_status IS NULL;

-- Safety trigger: workers cannot self-approve/reject their own photo
-- and cannot directly write reviewed_at / reviewed_by / rejection_reason.
-- Managers/admins (acting via service role or via the Managers RLS policy)
-- bypass these constraints. The check fires only when the row's user_id
-- equals auth.uid() (i.e. the worker editing their own record).
CREATE OR REPLACE FUNCTION public.enforce_employee_photo_review_self_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only constrain when the actor is the worker themselves.
  IF NEW.user_id IS NULL OR auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Worker may only set/keep photo_review_status as 'pending' or NULL.
  -- Replacing an existing approved/rejected status with anything other
  -- than 'pending' is rejected; admin must approve/reject.
  IF NEW.photo_review_status IS DISTINCT FROM OLD.photo_review_status THEN
    IF NEW.photo_review_status IS NOT NULL
       AND NEW.photo_review_status <> 'pending' THEN
      RAISE EXCEPTION 'Workers cannot approve or reject their own photo'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Workers may never write reviewer metadata directly.
  IF NEW.photo_reviewed_at IS DISTINCT FROM OLD.photo_reviewed_at
     AND NEW.photo_reviewed_at IS NOT NULL THEN
    NEW.photo_reviewed_at := OLD.photo_reviewed_at;
  END IF;
  IF NEW.photo_reviewed_by IS DISTINCT FROM OLD.photo_reviewed_by
     AND NEW.photo_reviewed_by IS NOT NULL THEN
    NEW.photo_reviewed_by := OLD.photo_reviewed_by;
  END IF;
  IF NEW.photo_rejection_reason IS DISTINCT FROM OLD.photo_rejection_reason
     AND NEW.photo_rejection_reason IS NOT NULL THEN
    NEW.photo_rejection_reason := OLD.photo_rejection_reason;
  END IF;

  -- When the worker replaces their avatar, reset review to 'pending'
  -- and clear stale reviewer metadata + rejection reason.
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     AND NEW.avatar_url IS NOT NULL
     AND length(btrim(NEW.avatar_url)) > 0 THEN
    NEW.photo_review_status     := 'pending';
    NEW.photo_reviewed_at       := NULL;
    NEW.photo_reviewed_by       := NULL;
    NEW.photo_rejection_reason  := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_photo_review_self_edit ON public.employees;
CREATE TRIGGER trg_employees_photo_review_self_edit
BEFORE UPDATE OF photo_review_status, photo_reviewed_at, photo_reviewed_by,
                 photo_rejection_reason, avatar_url
ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.enforce_employee_photo_review_self_edit();