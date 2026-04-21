CREATE OR REPLACE FUNCTION public.generate_shift_review_requests(_shift_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shift RECORD;
  _admin_employee_id uuid;
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

  -- Resolve the shift admin (preferred evaluator)
  SELECT sa.employee_id INTO _admin_employee_id
    FROM shift_assignments sa
    WHERE sa.shift_id = _shift_id
      AND sa.is_shift_admin = true
    LIMIT 1;

  IF _admin_employee_id IS NOT NULL THEN
    SELECT user_id INTO _admin_user_id FROM employees WHERE id = _admin_employee_id;
  END IF;

  -- Fallback: first admin of the company
  IF _admin_user_id IS NULL THEN
    SELECT user_id INTO _admin_user_id
      FROM company_users
      WHERE company_id = _shift.company_id
        AND role IN ('admin','company_owner','owner')
      LIMIT 1;
  END IF;

  -- Deadline: 72h after shift end
  _deadline := (_shift.date::timestamp + _shift.end_time::time) AT TIME ZONE 'UTC' + INTERVAL '72 hours';

  FOR _row IN SELECT * FROM public.pick_workers_to_rate(_shift_id)
  LOOP
    IF EXISTS (
      SELECT 1 FROM review_requests
      WHERE source_event_type = 'shift_completed'
        AND source_event_id = _shift_id::text
        AND evaluated_entity_id = _row.employee_id
        AND evaluated_entity_type = 'employee'
    ) THEN CONTINUE; END IF;

    INSERT INTO review_requests (
      company_id, source_product, source_event_type, source_event_id,
      evaluator_user_id, evaluator_employee_id,
      evaluated_entity_type, evaluated_entity_id,
      review_form_type, status, priority, sampling_reason, deadline_at
    ) VALUES (
      _shift.company_id, 'stafly', 'shift_completed', _shift_id::text,
      _admin_user_id, _admin_employee_id,
      'employee', _row.employee_id,
      'admin_to_employee', 'pending', _row.priority, _row.sampling_reason, _deadline
    );
    _created := _created + 1;
  END LOOP;

  RETURN _created;
END;
$$;