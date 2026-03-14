
-- FIX 4: shift_reviews - fix self-referencing tautology (ss.company_id = ss.company_id)
DROP POLICY IF EXISTS "Anon can insert employee reviews" ON public.shift_reviews;

CREATE POLICY "Anon can insert employee reviews"
ON public.shift_reviews FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.scheduled_shifts ss
    WHERE ss.id = shift_reviews.shift_id
      AND ss.company_id = shift_reviews.company_id
  )
);
