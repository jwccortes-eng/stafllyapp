-- Recreate view to ensure security_invoker is set (some Postgres versions ignore inline option)
DROP VIEW IF EXISTS public.employee_review_stats;

CREATE VIEW public.employee_review_stats AS
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

ALTER VIEW public.employee_review_stats SET (security_invoker = true);

GRANT SELECT ON public.employee_review_stats TO authenticated;

-- Fix search_path on the touch trigger function
CREATE OR REPLACE FUNCTION public.touch_shift_review_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;