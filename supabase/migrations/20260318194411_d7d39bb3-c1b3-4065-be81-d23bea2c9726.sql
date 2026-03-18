
CREATE OR REPLACE FUNCTION public.recalculate_rep_score(_worker_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _total_count int;
  _punctuality numeric;
  _quality numeric;
  _service numeric;
  _communication numeric;
  _attendance numeric;
  _presentation numeric;
  _reliability numeric;
  _overall numeric;
BEGIN
  SELECT 
    COUNT(*),
    ROUND(AVG(CASE WHEN notes = 'punctuality' THEN event_score END)::numeric, 2),
    ROUND(AVG(CASE WHEN notes = 'quality' THEN event_score END)::numeric, 2),
    ROUND(AVG(CASE WHEN notes = 'service' THEN event_score END)::numeric, 2),
    ROUND(AVG(CASE WHEN notes = 'professionalism' THEN event_score END)::numeric, 2),
    ROUND(AVG(CASE WHEN notes = 'attendance' THEN event_score END)::numeric, 2),
    ROUND(AVG(CASE WHEN notes = 'presentation' THEN event_score END)::numeric, 2),
    ROUND(AVG(CASE WHEN notes = 'teamwork' THEN event_score END)::numeric, 2)
  INTO _total_count, _punctuality, _quality, _service, _communication, _attendance, _presentation, _reliability
  FROM rep_events
  WHERE worker_profile_id = _worker_profile_id;

  IF _total_count = 0 THEN RETURN; END IF;

  _overall := 50 + COALESCE(
    COALESCE(_punctuality, 0) * 0.25 +
    COALESCE(_quality, 0) * 0.25 +
    COALESCE(_service, 0) * 0.15 +
    COALESCE(_communication, 0) * 0.15 +
    COALESCE(_reliability, 0) * 0.10 +
    COALESCE(_presentation, 0) * 0.10
  , 0);
  _overall := GREATEST(0, LEAST(100, ROUND(_overall, 2)));

  INSERT INTO rep_scores (
    worker_profile_id, overall_score, 
    punctuality_score, quality_score, service_score,
    communication_score, attendance_score, presentation_score, reliability_score,
    total_reviews_count, last_calculated_at
  ) VALUES (
    _worker_profile_id, _overall,
    _punctuality, _quality, _service,
    _communication, _attendance, _presentation, _reliability,
    _total_count, now()
  )
  ON CONFLICT (worker_profile_id)
  DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    punctuality_score = EXCLUDED.punctuality_score,
    quality_score = EXCLUDED.quality_score,
    service_score = EXCLUDED.service_score,
    communication_score = EXCLUDED.communication_score,
    attendance_score = EXCLUDED.attendance_score,
    presentation_score = EXCLUDED.presentation_score,
    reliability_score = EXCLUDED.reliability_score,
    total_reviews_count = EXCLUDED.total_reviews_count,
    last_calculated_at = EXCLUDED.last_calculated_at;
END;
$function$;
