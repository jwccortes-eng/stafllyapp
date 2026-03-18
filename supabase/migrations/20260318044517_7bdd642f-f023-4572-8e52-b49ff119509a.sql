
-- Scoring function
CREATE OR REPLACE FUNCTION public.recalculate_review_score(
  _company_id UUID, _entity_type review_entity_type, _entity_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _overall NUMERIC; _count INTEGER; _weighted NUMERIC; _recent_avg NUMERIC; _old_avg NUMERIC; _trend TEXT;
BEGIN
  SELECT AVG(overall_rating), COUNT(*) INTO _overall, _count
  FROM review_submissions WHERE company_id = _company_id AND evaluated_entity_type = _entity_type AND evaluated_entity_id = _entity_id;
  IF _count = 0 THEN RETURN; END IF;
  SELECT AVG(overall_rating) INTO _recent_avg FROM (
    SELECT overall_rating FROM review_submissions WHERE company_id = _company_id AND evaluated_entity_type = _entity_type AND evaluated_entity_id = _entity_id ORDER BY submitted_at DESC LIMIT GREATEST(3, _count / 3)
  ) r;
  SELECT AVG(overall_rating) INTO _old_avg FROM (
    SELECT overall_rating FROM review_submissions WHERE company_id = _company_id AND evaluated_entity_type = _entity_type AND evaluated_entity_id = _entity_id ORDER BY submitted_at ASC LIMIT GREATEST(3, _count / 3)
  ) o;
  _weighted := ROUND((_recent_avg * 0.6 + _overall * 0.4)::numeric, 2);
  IF _recent_avg > _old_avg + 0.3 THEN _trend := 'improving';
  ELSIF _recent_avg < _old_avg - 0.3 THEN _trend := 'declining';
  ELSE _trend := 'stable'; END IF;
  INSERT INTO review_scores (company_id, entity_type, entity_id, score_type, score_value, score_count, weighted_score, trend, last_review_at)
  VALUES (_company_id, _entity_type, _entity_id, 'overall', ROUND(_overall::numeric, 2), _count, _weighted, _trend, now())
  ON CONFLICT (company_id, entity_type, entity_id, score_type) DO UPDATE SET
    score_value = EXCLUDED.score_value, score_count = EXCLUDED.score_count, weighted_score = EXCLUDED.weighted_score,
    trend = EXCLUDED.trend, last_review_at = EXCLUDED.last_review_at, updated_at = now();
  INSERT INTO review_scores (company_id, entity_type, entity_id, score_type, score_value, score_count, last_review_at)
  SELECT _company_id, _entity_type, _entity_id, ds.category_key, ROUND(AVG(ds.rating)::numeric, 2), COUNT(*), MAX(rs.submitted_at)
  FROM review_dimension_scores ds JOIN review_submissions rs ON rs.id = ds.submission_id
  WHERE rs.company_id = _company_id AND rs.evaluated_entity_type = _entity_type AND rs.evaluated_entity_id = _entity_id
  GROUP BY ds.category_key
  ON CONFLICT (company_id, entity_type, entity_id, score_type) DO UPDATE SET
    score_value = EXCLUDED.score_value, score_count = EXCLUDED.score_count, last_review_at = EXCLUDED.last_review_at, updated_at = now();
END; $$;

-- Auto-flag + score trigger
CREATE OR REPLACE FUNCTION public.trigger_review_auto_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.overall_rating <= 2 THEN
    INSERT INTO review_flags (submission_id, company_id, flag_type, severity, status)
    VALUES (NEW.id, NEW.company_id,
      CASE WHEN NEW.overall_rating = 1 THEN 'very_low_rating' ELSE 'low_rating' END,
      CASE WHEN NEW.overall_rating = 1 THEN 'critical'::review_flag_severity ELSE 'high'::review_flag_severity END, 'open');
  ELSIF NEW.overall_rating = 3 THEN
    INSERT INTO review_flags (submission_id, company_id, flag_type, severity, status)
    VALUES (NEW.id, NEW.company_id, 'attention_needed', 'medium'::review_flag_severity, 'open');
  END IF;
  PERFORM public.recalculate_review_score(NEW.company_id, NEW.evaluated_entity_type, NEW.evaluated_entity_id);
  IF NEW.review_request_id IS NOT NULL THEN
    UPDATE review_requests SET status = 'submitted'::review_status, updated_at = now() WHERE id = NEW.review_request_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_review_submission_after_insert
  AFTER INSERT ON public.review_submissions FOR EACH ROW EXECUTE FUNCTION public.trigger_review_auto_flag();
