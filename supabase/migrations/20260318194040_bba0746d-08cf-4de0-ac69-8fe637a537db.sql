
-- Fix the trigger to use correct column names from rep_events table
CREATE OR REPLACE FUNCTION public.trigger_shift_review_to_rep_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _wp_id uuid;
  _emp_id uuid;
BEGIN
  -- Find employee from reviewed_employee_id directly
  _emp_id := NEW.reviewed_employee_id;

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

  -- Create rep_events using correct column names
  INSERT INTO rep_events (worker_profile_id, source_type, source_id, event_weight, event_score, notes)
  VALUES
    (_wp_id, 'shift_review', NEW.id::text, 1, COALESCE(NEW.rating_punctuality, NEW.overall_rating::int, 3) - 3, 'punctuality'),
    (_wp_id, 'shift_review', NEW.id::text, 1, COALESCE(NEW.rating_quality, NEW.overall_rating::int, 3) - 3, 'quality'),
    (_wp_id, 'shift_review', NEW.id::text, 1, COALESCE(NEW.rating_service, NEW.overall_rating::int, 3) - 3, 'service'),
    (_wp_id, 'shift_review', NEW.id::text, 1, COALESCE(NEW.rating_professionalism, NEW.overall_rating::int, 3) - 3, 'professionalism'),
    (_wp_id, 'shift_review', NEW.id::text, 1, COALESCE(NEW.rating_presentation, NEW.overall_rating::int, 3) - 3, 'presentation')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
