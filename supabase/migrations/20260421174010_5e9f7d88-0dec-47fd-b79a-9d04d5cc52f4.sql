-- ============================================================================
-- Reviews module — Phase 1
-- Extend shift_reviews with structured fields, add tags table, eligibility
-- guardrails, aggregate view, and supporting indexes.
-- ============================================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.review_type AS ENUM ('post_shift', 'incident', 'periodic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_status AS ENUM ('draft', 'submitted', 'hidden', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_reviewer_role AS ENUM (
    'admin', 'owner', 'captain', 'manager', 'supervisor', 'client', 'peer', 'system', 'employee'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend shift_reviews
ALTER TABLE public.shift_reviews
  ADD COLUMN IF NOT EXISTS reviewer_user_id      UUID,
  ADD COLUMN IF NOT EXISTS reviewer_employee_id  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_role         public.review_reviewer_role,
  ADD COLUMN IF NOT EXISTS review_type           public.review_type NOT NULL DEFAULT 'post_shift',
  ADD COLUMN IF NOT EXISTS status                public.review_status NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS submitted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS private_notes         TEXT,
  ADD COLUMN IF NOT EXISTS is_anonymous          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill reviewer_role from legacy reviewer_type where possible
UPDATE public.shift_reviews
SET reviewer_role = CASE
  WHEN reviewer_type = 'manager'  THEN 'manager'::public.review_reviewer_role
  WHEN reviewer_type = 'admin'    THEN 'admin'::public.review_reviewer_role
  WHEN reviewer_type = 'owner'    THEN 'owner'::public.review_reviewer_role
  WHEN reviewer_type = 'captain'  THEN 'captain'::public.review_reviewer_role
  WHEN reviewer_type = 'employee' THEN 'employee'::public.review_reviewer_role
  WHEN reviewer_type = 'client'   THEN 'client'::public.review_reviewer_role
  WHEN reviewer_type = 'peer'     THEN 'peer'::public.review_reviewer_role
  WHEN reviewer_type = 'system'   THEN 'system'::public.review_reviewer_role
  ELSE 'admin'::public.review_reviewer_role
END
WHERE reviewer_role IS NULL;

-- Backfill submitted_at for existing rows
UPDATE public.shift_reviews
SET submitted_at = created_at
WHERE submitted_at IS NULL;

-- 3) Tags table (normalized)
CREATE TABLE IF NOT EXISTS public.shift_review_tags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    UUID NOT NULL REFERENCES public.shift_reviews(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL,
  tag          TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(review_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_shift_review_tags_review_id ON public.shift_review_tags(review_id);
CREATE INDEX IF NOT EXISTS idx_shift_review_tags_company_tag ON public.shift_review_tags(company_id, tag);

ALTER TABLE public.shift_review_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_select_company" ON public.shift_review_tags;
CREATE POLICY "tags_select_company" ON public.shift_review_tags FOR SELECT
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "tags_insert_company" ON public.shift_review_tags;
CREATE POLICY "tags_insert_company" ON public.shift_review_tags FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.shift_reviews r
      WHERE r.id = review_id AND r.company_id = shift_review_tags.company_id
    )
  );

DROP POLICY IF EXISTS "tags_delete_company" ON public.shift_review_tags;
CREATE POLICY "tags_delete_company" ON public.shift_review_tags FOR DELETE
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- 4) Eligibility unique constraint: one review per (shift, reviewer_user, subject)
-- Uses partial unique index to allow multiple NULL reviewed_employee_id rows (client reviews)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shift_reviews_per_user_subject
  ON public.shift_reviews(shift_id, reviewer_user_id, reviewed_employee_id)
  WHERE reviewer_user_id IS NOT NULL AND reviewed_employee_id IS NOT NULL;

-- Useful indexes for stats and lookups
CREATE INDEX IF NOT EXISTS idx_shift_reviews_subject_emp
  ON public.shift_reviews(company_id, reviewed_employee_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_shift_reviews_shift
  ON public.shift_reviews(shift_id, status);

-- 5) Eligibility trigger: enforce on inserts of internal/manager reviews
CREATE OR REPLACE FUNCTION public.assert_shift_review_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _shift RECORD;
  _shift_end TIMESTAMPTZ;
  _has_assignment BOOLEAN;
BEGIN
  -- Only enforce for internal manager-side reviews about an employee
  IF NEW.reviewed_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewer_role IS NOT NULL
     AND NEW.reviewer_role NOT IN ('admin', 'owner', 'manager', 'supervisor', 'captain') THEN
    RETURN NEW;
  END IF;

  SELECT id, company_id, date, end_time, deleted_at
    INTO _shift
    FROM public.scheduled_shifts
   WHERE id = NEW.shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review eligibility: shift % not found', NEW.shift_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF _shift.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Review eligibility: shift was deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _shift.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Review eligibility: company mismatch between shift and review'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify the employee was actually assigned (not rejected/removed)
  SELECT EXISTS (
    SELECT 1 FROM public.shift_assignments sa
    WHERE sa.shift_id = NEW.shift_id
      AND sa.employee_id = NEW.reviewed_employee_id
      AND sa.status NOT IN ('rejected', 'removed')
  ) INTO _has_assignment;

  IF NOT _has_assignment THEN
    RAISE EXCEPTION 'Review eligibility: employee % was not assigned to shift %',
      NEW.reviewed_employee_id, NEW.shift_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify shift has ended (date + end_time in the past)
  _shift_end := (_shift.date::timestamp + _shift.end_time::time) AT TIME ZONE 'UTC';
  IF _shift_end > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Review eligibility: shift has not ended yet (ends at %)', _shift_end
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_shift_review_eligibility ON public.shift_reviews;
CREATE TRIGGER trg_assert_shift_review_eligibility
  BEFORE INSERT ON public.shift_reviews
  FOR EACH ROW EXECUTE FUNCTION public.assert_shift_review_eligibility();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_shift_review_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_shift_reviews_updated_at ON public.shift_reviews;
CREATE TRIGGER trg_shift_reviews_updated_at
  BEFORE UPDATE ON public.shift_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_shift_review_updated_at();

-- 6) Aggregate view — employee_review_stats
CREATE OR REPLACE VIEW public.employee_review_stats
WITH (security_invoker = true) AS
SELECT
  r.company_id,
  r.reviewed_employee_id                                     AS employee_id,
  COUNT(*)::int                                              AS total_reviews,
  ROUND(AVG(r.overall_rating)::numeric, 2)                   AS avg_overall_score,
  ROUND(AVG(r.rating_punctuality)::numeric, 2)               AS avg_punctuality_score,
  ROUND(AVG(r.rating_presentation)::numeric, 2)              AS avg_presentation_score,
  ROUND(AVG(r.rating_service)::numeric, 2)                   AS avg_attitude_score,
  ROUND(AVG(r.rating_quality)::numeric, 2)                   AS avg_work_quality_score,
  ROUND(AVG(r.rating_professionalism)::numeric, 2)           AS avg_communication_score,
  MAX(r.submitted_at)                                        AS last_review_at,
  COUNT(*) FILTER (
    WHERE r.overall_rating <= 2
      AND r.submitted_at >= now() - interval '30 days'
  )::int                                                     AS low_score_count_30d,
  COUNT(*) FILTER (
    WHERE r.rating_punctuality IS NOT NULL
      AND r.rating_punctuality <= 2
      AND r.submitted_at >= now() - interval '90 days'
  )::int                                                     AS no_show_flags_90d
FROM public.shift_reviews r
WHERE r.status = 'submitted'
  AND r.reviewed_employee_id IS NOT NULL
GROUP BY r.company_id, r.reviewed_employee_id;

GRANT SELECT ON public.employee_review_stats TO authenticated;