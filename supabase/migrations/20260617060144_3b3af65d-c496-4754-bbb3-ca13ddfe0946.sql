CREATE OR REPLACE FUNCTION public.trigger_shift_review_to_rep_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wp_id uuid;
  _emp_id uuid;
  _is_active boolean;
  _user_id uuid;
  _emp_json jsonb;
  _payroll_safe boolean;
  _person_type text;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('submitted','approved') THEN
    RETURN NEW;
  END IF;
  IF NEW.reviewed_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT to_jsonb(e.*), e.is_active, e.user_id, e.id
    INTO _emp_json, _is_active, _user_id, _emp_id
  FROM employees e
  WHERE e.id = NEW.reviewed_employee_id;

  IF _emp_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(_is_active, false) = false THEN RETURN NEW; END IF;

  -- Defensive: tolerate missing columns (payroll_safe / person_type_guess
  -- are Core rules but not yet schema columns on employees).
  _payroll_safe := COALESCE((_emp_json->>'payroll_safe')::boolean, true);
  IF _payroll_safe = false THEN RETURN NEW; END IF;

  _person_type := COALESCE(_emp_json->>'person_type_guess', 'real');
  IF _person_type IN ('placeholder','system','external','agency','temp') THEN
    RETURN NEW;
  END IF;

  SELECT wp.id INTO _wp_id
  FROM worker_profiles wp
  WHERE wp.user_id = _user_id
  LIMIT 1;
  IF _wp_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.rating_punctuality IS NULL
     AND NEW.rating_quality IS NULL
     AND NEW.rating_service IS NULL
     AND NEW.rating_professionalism IS NULL
     AND NEW.rating_presentation IS NULL
     AND NEW.overall_rating IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO rep_events (worker_profile_id, source_type, source_id, event_weight, event_score, notes)
  SELECT _wp_id, 'shift_review', NEW.id, 1,
         GREATEST(-2, LEAST(2, COALESCE(r.rating, NEW.overall_rating::int, 3) - 3)),
         r.dim
  FROM (VALUES
    (NEW.rating_punctuality,     'punctuality'),
    (NEW.rating_quality,         'quality'),
    (NEW.rating_service,         'service'),
    (NEW.rating_professionalism, 'professionalism'),
    (NEW.rating_presentation,    'presentation')
  ) AS r(rating, dim)
  WHERE r.rating IS NOT NULL OR NEW.overall_rating IS NOT NULL
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;