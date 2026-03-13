
-- Fix anon select policy - restrict to company-scoped reads
DROP POLICY IF EXISTS "Anon can read employee reviews" ON public.shift_reviews;

CREATE POLICY "Anon can read shift reviews by company"
  ON public.shift_reviews FOR SELECT
  TO anon
  USING (
    reviewer_type = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.scheduled_shifts ss
      WHERE ss.id = shift_reviews.shift_id AND ss.company_id = shift_reviews.company_id
    )
  );
