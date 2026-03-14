
-- =============================================
-- Reputation Engine: DB-side score recalculation
-- =============================================

-- Function to recalculate reputation score from all rep_events
CREATE OR REPLACE FUNCTION public.recalculate_rep_score(_worker_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cat_scores jsonb;
  _overall numeric;
  _total_count int;
  _punctuality numeric;
  _quality numeric;
  _service numeric;
  _communication numeric;
  _attendance numeric;
  _presentation numeric;
  _reliability numeric;
BEGIN
  -- Aggregate events by category
  SELECT 
    COUNT(*),
    ROUND(AVG(CASE WHEN category = 'punctuality' THEN delta END)::numeric, 2),
    ROUND(AVG(CASE WHEN category = 'quality' THEN delta END)::numeric, 2),
    ROUND(AVG(CASE WHEN category = 'service' THEN delta END)::numeric, 2),
    ROUND(AVG(CASE WHEN category = 'professionalism' THEN delta END)::numeric, 2),
    ROUND(AVG(CASE WHEN category = 'attendance' THEN delta END)::numeric, 2),
    ROUND(AVG(CASE WHEN category = 'presentation' THEN delta END)::numeric, 2),
    ROUND(AVG(CASE WHEN category = 'teamwork' THEN delta END)::numeric, 2)
  INTO _total_count, _punctuality, _quality, _service, _communication, _attendance, _presentation, _reliability
  FROM rep_events
  WHERE worker_profile_id = _worker_profile_id;

  IF _total_count = 0 THEN
    RETURN;
  END IF;

  -- Calculate weighted overall (matching spec weights)
  -- Punctuality 25%, Quality 25%, Service 15%, Professionalism 15%, Teamwork 10%, Presentation 10%
  _overall := 50 + COALESCE(
    (
      COALESCE(_punctuality, 0) * 0.25 +
      COALESCE(_quality, 0) * 0.25 +
      COALESCE(_service, 0) * 0.15 +
      COALESCE(_communication, 0) * 0.15 +
      COALESCE(_reliability, 0) * 0.10 +
      COALESCE(_presentation, 0) * 0.10
    ), 0
  );
  _overall := GREATEST(0, LEAST(100, ROUND(_overall, 2)));

  -- Upsert the score
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
$$;

-- Trigger function for rep_events
CREATE OR REPLACE FUNCTION public.trigger_recalculate_rep_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recalculate_rep_score(
    COALESCE(NEW.worker_profile_id, OLD.worker_profile_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on rep_events
DROP TRIGGER IF EXISTS trg_rep_events_recalc ON public.rep_events;
CREATE TRIGGER trg_rep_events_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.rep_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_rep_score();

-- Trigger function for shift_reviews → auto-create rep_events
CREATE OR REPLACE FUNCTION public.trigger_shift_review_to_rep_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _wp_id uuid;
  _emp_id uuid;
BEGIN
  -- Find employee from shift assignment
  SELECT sa.employee_id INTO _emp_id
  FROM shift_assignments sa
  WHERE sa.shift_id = NEW.shift_id
    AND sa.status NOT IN ('rejected', 'removed')
  LIMIT 1;

  IF _emp_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find worker_profile_id from employee
  SELECT wp.id INTO _wp_id
  FROM worker_profiles wp
  JOIN employees e ON e.user_id = wp.user_id
  WHERE e.id = _emp_id
  LIMIT 1;

  IF _wp_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create rep_events for each rating dimension
  INSERT INTO rep_events (worker_profile_id, source, source_entity_id, category, delta, weight, note)
  VALUES
    (_wp_id, 'shift_review', NEW.id::text, 'punctuality', COALESCE(NEW.punctuality_rating, NEW.overall_rating, 3) - 3, 1, 'Auto from review'),
    (_wp_id, 'shift_review', NEW.id::text, 'quality', COALESCE(NEW.quality_rating, NEW.overall_rating, 3) - 3, 1, 'Auto from review'),
    (_wp_id, 'shift_review', NEW.id::text, 'service', COALESCE(NEW.service_rating, NEW.overall_rating, 3) - 3, 1, 'Auto from review'),
    (_wp_id, 'shift_review', NEW.id::text, 'professionalism', COALESCE(NEW.professionalism_rating, NEW.overall_rating, 3) - 3, 1, 'Auto from review'),
    (_wp_id, 'shift_review', NEW.id::text, 'presentation', COALESCE(NEW.presentation_rating, NEW.overall_rating, 3) - 3, 1, 'Auto from review')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger on shift_reviews
DROP TRIGGER IF EXISTS trg_shift_review_rep ON public.shift_reviews;
CREATE TRIGGER trg_shift_review_rep
  AFTER INSERT ON public.shift_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_shift_review_to_rep_event();
