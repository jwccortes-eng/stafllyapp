-- Create the notification function for shift assignments
CREATE OR REPLACE FUNCTION public.notify_employee_on_shift_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _shift RECORD;
BEGIN
  -- Only notify on confirmed/accepted assignments
  IF NEW.status IN ('rejected', 'removed') THEN
    RETURN NEW;
  END IF;

  -- Get shift details
  SELECT title, date, start_time, end_time, company_id
    INTO _shift
    FROM scheduled_shifts
   WHERE id = NEW.shift_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Insert notification for the assigned employee
  INSERT INTO notifications (
    company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
  ) VALUES (
    _shift.company_id,
    NEW.employee_id,
    'employee',
    'shift_assigned',
    '📋 Nuevo turno asignado',
    '"' || _shift.title || '" — ' || to_char(_shift.date::date, 'DD Mon') || ' de ' || substring(_shift.start_time::text from 1 for 5) || ' a ' || substring(_shift.end_time::text from 1 for 5),
    jsonb_build_object('shift_id', NEW.shift_id, 'assignment_id', NEW.id),
    NULL
  );

  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER trg_notify_on_shift_assignment
  AFTER INSERT ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_employee_on_shift_assignment();
