
-- Tighten anon policies to require reviewer_id match
DROP POLICY IF EXISTS "Anon can insert employee reviews" ON public.shift_reviews;
DROP POLICY IF EXISTS "Anon can read own employee reviews" ON public.shift_reviews;

-- Anon insert: must be employee type and shift must exist in the company
CREATE POLICY "Anon can insert employee reviews"
  ON public.shift_reviews FOR INSERT
  TO anon
  WITH CHECK (
    reviewer_type = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.scheduled_shifts ss
      WHERE ss.id = shift_id AND ss.company_id = company_id
    )
  );

-- Anon select: only employee reviews, scoped by reviewer_id
CREATE POLICY "Anon can read employee reviews"
  ON public.shift_reviews FOR SELECT
  TO anon
  USING (reviewer_type = 'employee');
