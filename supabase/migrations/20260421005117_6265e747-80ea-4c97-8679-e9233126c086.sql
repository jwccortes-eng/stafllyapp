-- ════════════════════════════════════════════════════════════════════
-- Rating Sampling + Auto-request engine
-- Extends the existing Reviews module with deterministic per-shift
-- random sampling (20–30%) prioritizing new workers and low scorers.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Sampling function ───────────────────────────────────────────
-- Returns the employee_ids that should be rated for a given shift.
-- Deterministic per shift (same result on repeated calls) thanks to
-- a seeded hash on (shift_id, employee_id).
CREATE OR REPLACE FUNCTION public.pick_workers_to_rate(_shift_id uuid)
RETURNS TABLE(employee_id uuid, sampling_reason text, priority numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _total int;
  _target int;
BEGIN
  SELECT ss.company_id INTO _company_id
    FROM scheduled_shifts ss
    WHERE ss.id = _shift_id;
  IF _company_id IS NULL THEN RETURN; END IF;

  -- Count distinct assigned employees (excluding rejected/removed)
  SELECT COUNT(DISTINCT sa.employee_id) INTO _total
    FROM shift_assignments sa
    WHERE sa.shift_id = _shift_id
      AND sa.status NOT IN ('rejected','removed');

  IF _total = 0 THEN RETURN; END IF;

  -- Target ~25% (rounded up), minimum 1, maximum = total
  _target := GREATEST(1, LEAST(_total, CEIL(_total * 0.25)::int));

  RETURN QUERY
  WITH assigned AS (
    SELECT sa.employee_id
      FROM shift_assignments sa
      WHERE sa.shift_id = _shift_id
        AND sa.status NOT IN ('rejected','removed')
  ),
  enriched AS (
    SELECT
      a.employee_id,
      -- Rating score: lower = higher priority. NULL = new worker.
      (SELECT rs.weighted_score
         FROM review_scores rs
         WHERE rs.entity_type = 'employee'
           AND rs.entity_id = a.employee_id
           AND rs.score_type = 'overall'
         LIMIT 1) AS current_score,
      (SELECT COUNT(*)
         FROM review_submissions rsb
         WHERE rsb.evaluated_entity_type = 'employee'
           AND rsb.evaluated_entity_id = a.employee_id) AS prior_reviews
    FROM assigned a
  ),
  scored AS (
    SELECT
      e.employee_id,
      CASE
        WHEN e.prior_reviews = 0          THEN 'new_worker'
        WHEN e.current_score IS NOT NULL
             AND e.current_score <= 3.0   THEN 'low_score'
        ELSE 'random_sample'
      END AS sampling_reason,
      -- Priority: new (10) > low_score (8) > random (5)
      CASE
        WHEN e.prior_reviews = 0          THEN 10.0
        WHEN e.current_score IS NOT NULL
             AND e.current_score <= 3.0   THEN 8.0
        ELSE 5.0
      END
      -- Deterministic tie-breaker (hash of shift+employee, in [0,1))
      + (('x' || substr(md5(_shift_id::text || e.employee_id::text), 1, 8))::bit(32)::int::numeric / 4294967296.0) AS priority
    FROM enriched e
  )
  SELECT s.employee_id, s.sampling_reason, s.priority
    FROM scored s
    ORDER BY s.priority DESC
    LIMIT _target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pick_workers_to_rate(uuid) TO authenticated;


-- ─── 2. Generate review_requests when a shift is completed ──────────
-- Idempotent: skips if a request already exists for the shift+admin pair.
CREATE OR REPLACE FUNCTION public.generate_shift_review_requests(_shift_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shift RECORD;
  _admin_user_id uuid;
  _row RECORD;
  _created int := 0;
  _deadline timestamptz;
BEGIN
  SELECT id, company_id, date, end_time, title
    INTO _shift
    FROM scheduled_shifts
    WHERE id = _shift_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Pick the shift admin if defined, else the first company admin
  SELECT sa.employee_id INTO _admin_user_id
    FROM shift_assignments sa
    WHERE sa.shift_id = _shift_id
      AND sa.is_shift_admin = true
    LIMIT 1;

  -- Deadline: 72h after shift end
  _deadline := (_shift.date::timestamp + _shift.end_time::time) AT TIME ZONE 'UTC' + INTERVAL '72 hours';

  FOR _row IN SELECT * FROM public.pick_workers_to_rate(_shift_id)
  LOOP
    -- Skip duplicates per (shift, employee)
    IF EXISTS (
      SELECT 1 FROM review_requests
      WHERE source_event_type = 'shift_completed'
        AND source_event_id = _shift_id::text
        AND evaluated_entity_id = _row.employee_id
        AND evaluated_entity_type = 'employee'
    ) THEN CONTINUE; END IF;

    INSERT INTO review_requests (
      company_id, source_product, source_event_type, source_event_id,
      evaluator_employee_id, evaluated_entity_type, evaluated_entity_id,
      review_form_type, status, priority, sampling_reason, deadline_at
    ) VALUES (
      _shift.company_id, 'stafly', 'shift_completed', _shift_id::text,
      _admin_user_id,    -- nullable; UI resolves any admin if null
      'employee', _row.employee_id,
      'admin_to_employee', 'pending', _row.priority, _row.sampling_reason, _deadline
    );
    _created := _created + 1;
  END LOOP;

  RETURN _created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_shift_review_requests(uuid) TO authenticated;


-- ─── 3. Auto-trigger when a shift transitions to "completed" ────────
CREATE OR REPLACE FUNCTION public.trg_generate_review_requests_on_shift_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE')
     AND NEW.status = 'completed'
     AND COALESCE(OLD.status, '') <> 'completed'
  THEN
    PERFORM public.generate_shift_review_requests(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_complete_review_requests ON public.scheduled_shifts;
CREATE TRIGGER trg_shift_complete_review_requests
  AFTER UPDATE OF status ON public.scheduled_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_generate_review_requests_on_shift_complete();