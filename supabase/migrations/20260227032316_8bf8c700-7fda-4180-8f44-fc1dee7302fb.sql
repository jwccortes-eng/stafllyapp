
CREATE OR REPLACE FUNCTION public.prevent_overlapping_shift_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
  _new_shift RECORD;
  _conflict RECORD;
BEGIN
  -- Get the shift details for the new assignment
  SELECT id, date, start_time, end_time, title, deleted_at
    INTO _new_shift
    FROM scheduled_shifts
   WHERE id = NEW.shift_id;

  IF NOT FOUND OR _new_shift.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check for overlapping shifts assigned to the same employee
  SELECT ss.title, ss.start_time, ss.end_time, ss.shift_code
    INTO _conflict
    FROM shift_assignments sa
    JOIN scheduled_shifts ss ON ss.id = sa.shift_id
   WHERE sa.employee_id = NEW.employee_id
     AND sa.id IS DISTINCT FROM NEW.id
     AND sa.status NOT IN ('rejected', 'removed')
     AND ss.date = _new_shift.date
     AND ss.deleted_at IS NULL
     -- Time overlap: new start < existing end AND new end > existing start
     AND _new_shift.start_time < ss.end_time
     AND _new_shift.end_time > ss.start_time
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'El empleado ya tiene un turno asignado que se solapa: "%" (% - %). No se puede asignar al turno "%" (% - %) el mismo día.',
      _conflict.title,
      _conflict.start_time::text,
      _conflict.end_time::text,
      _new_shift.title,
      _new_shift.start_time::text,
      _new_shift.end_time::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_overlapping_shift_assignments
  BEFORE INSERT OR UPDATE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_overlapping_shift_assignments();
