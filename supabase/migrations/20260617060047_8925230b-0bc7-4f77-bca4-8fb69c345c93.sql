-- E5.1A safety rails for legacy shift_reviews -> rep_events pipeline

-- 1) Partial unique index for idempotency (legacy shift_review source only)
CREATE UNIQUE INDEX IF NOT EXISTS rep_events_shift_review_dim_uidx
  ON public.rep_events (source_id, notes)
  WHERE source_type = 'shift_review' AND source_id IS NOT NULL;

-- 2) Hardened trigger function
CREATE OR REPLACE FUNCTION public.trigger_shift_review_to_rep_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wp_id uuid;
  _emp employees%ROWTYPE;
BEGIN
  -- Gate 1: review status must be submitted or approved
  IF NEW.status IS NULL OR NEW.status NOT IN ('submitted','approved') THEN
    RETURN NEW;
  END IF;
  IF NEW.reviewed_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Gate 2: employee must exist + be eligible
  SELECT * INTO _emp FROM employees WHERE id = NEW.reviewed_employee_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF COALESCE(_emp.is_active, false) = false THEN RETURN NEW; END IF;
  IF COALESCE(_emp.payroll_safe, true) = false THEN RETURN NEW; END IF;
  IF COALESCE(_emp.person_type_guess, 'real') IN ('placeholder','system','external','agency','temp') THEN
    RETURN NEW;
  END IF;

  -- Gate 3: worker_profile must be resolvable
  SELECT wp.id INTO _wp_id
  FROM worker_profiles wp
  WHERE wp.user_id = _emp.user_id
  LIMIT 1;
  IF _wp_id IS NULL THEN RETURN NEW; END IF;

  -- Gate 4: at least one rating must be present (no neutral noise)
  IF NEW.rating_punctuality IS NULL
     AND NEW.rating_quality IS NULL
     AND NEW.rating_service IS NULL
     AND NEW.rating_professionalism IS NULL
     AND NEW.rating_presentation IS NULL
     AND NEW.overall_rating IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert only category dimensions (notes = dimension name, NEVER free text)
  -- event_score normalized to -2..+2; defensive clamp.
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