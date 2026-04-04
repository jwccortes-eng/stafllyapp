
-- Drop and recreate the notification trigger with richer content
CREATE OR REPLACE FUNCTION public.notify_employee_on_shift_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _shift RECORD;
  _location_name text;
  _client_name text;
  _body text;
BEGIN
  IF NEW.status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  SELECT title, date, start_time, end_time, company_id, client_id, location_id, meeting_point, shift_code
    INTO _shift
    FROM scheduled_shifts
   WHERE id = NEW.shift_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Get location and client names
  IF _shift.location_id IS NOT NULL THEN
    SELECT name INTO _location_name FROM locations WHERE id = _shift.location_id;
  END IF;
  IF _shift.client_id IS NOT NULL THEN
    SELECT name INTO _client_name FROM clients WHERE id = _shift.client_id;
  END IF;

  -- Build rich body
  _body := '"' || _shift.title || '"' ||
    CASE WHEN _shift.shift_code IS NOT NULL THEN ' (#' || lpad(_shift.shift_code::text, 4, '0') || ')' ELSE '' END ||
    ' — ' || to_char(_shift.date::date, 'DD Mon') ||
    ' de ' || substring(_shift.start_time::text from 1 for 5) ||
    ' a ' || substring(_shift.end_time::text from 1 for 5);

  IF _client_name IS NOT NULL THEN
    _body := _body || ' | ' || _client_name;
  END IF;
  IF _location_name IS NOT NULL THEN
    _body := _body || ' @ ' || _location_name;
  END IF;
  IF _shift.meeting_point IS NOT NULL AND _shift.meeting_point != '' THEN
    _body := _body || ' | Punto: ' || _shift.meeting_point;
  END IF;

  INSERT INTO notifications (
    company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
  ) VALUES (
    _shift.company_id,
    NEW.employee_id,
    'employee',
    'shift_assigned',
    '📋 Nuevo turno asignado',
    _body,
    jsonb_build_object(
      'shift_id', NEW.shift_id,
      'assignment_id', NEW.id,
      'date', _shift.date::text,
      'start_time', _shift.start_time::text,
      'end_time', _shift.end_time::text,
      'client', COALESCE(_client_name, ''),
      'location', COALESCE(_location_name, '')
    ),
    NULL
  );

  RETURN NEW;
END;
$$;
