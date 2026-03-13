
-- Shift Reviews table for bidirectional reviews
CREATE TABLE public.shift_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reviewer_type text NOT NULL CHECK (reviewer_type IN ('manager', 'employee')),
  reviewer_id text NOT NULL,
  reviewed_employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewed_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  -- Manager evaluates employee (8 categories)
  rating_presentation smallint CHECK (rating_presentation BETWEEN 1 AND 5),
  rating_punctuality smallint CHECK (rating_punctuality BETWEEN 1 AND 5),
  rating_service smallint CHECK (rating_service BETWEEN 1 AND 5),
  rating_quality smallint CHECK (rating_quality BETWEEN 1 AND 5),
  rating_professionalism smallint CHECK (rating_professionalism BETWEEN 1 AND 5),
  rating_teamwork smallint CHECK (rating_teamwork BETWEEN 1 AND 5),
  rating_instructions smallint CHECK (rating_instructions BETWEEN 1 AND 5),
  rating_productivity smallint CHECK (rating_productivity BETWEEN 1 AND 5),
  -- Employee evaluates client/job (5 categories)
  rating_organization smallint CHECK (rating_organization BETWEEN 1 AND 5),
  rating_clarity smallint CHECK (rating_clarity BETWEEN 1 AND 5),
  rating_supervisor_treatment smallint CHECK (rating_supervisor_treatment BETWEEN 1 AND 5),
  rating_conditions smallint CHECK (rating_conditions BETWEEN 1 AND 5),
  rating_compensation smallint CHECK (rating_compensation BETWEEN 1 AND 5),
  would_work_again boolean,
  -- Common
  overall_rating numeric(2,1) NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One review per reviewer_type per shift
  UNIQUE (shift_id, reviewer_type, reviewer_id)
);

-- Index for fast lookups
CREATE INDEX idx_shift_reviews_employee ON public.shift_reviews(reviewed_employee_id);
CREATE INDEX idx_shift_reviews_shift ON public.shift_reviews(shift_id);
CREATE INDEX idx_shift_reviews_company ON public.shift_reviews(company_id);

-- RLS
ALTER TABLE public.shift_reviews ENABLE ROW LEVEL SECURITY;

-- Admins/managers can read all reviews in their companies
CREATE POLICY "Company users can read reviews"
  ON public.shift_reviews FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Admins/managers can insert reviews
CREATE POLICY "Company users can insert reviews"
  ON public.shift_reviews FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Allow anon for employee portal reviews (employee-auth uses anon key)
CREATE POLICY "Anon can insert employee reviews"
  ON public.shift_reviews FOR INSERT
  TO anon
  WITH CHECK (reviewer_type = 'employee');

CREATE POLICY "Anon can read own employee reviews"
  ON public.shift_reviews FOR SELECT
  TO anon
  USING (reviewer_type = 'employee');
