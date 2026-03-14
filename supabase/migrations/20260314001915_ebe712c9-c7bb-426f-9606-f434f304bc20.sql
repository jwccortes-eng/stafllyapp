
-- Function to notify employees when their shift is updated
CREATE OR REPLACE FUNCTION public.notify_employees_on_shift_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _assignment RECORD;
  _change_type text;
  _body text;
BEGIN
  -- Determine what changed
  IF TG_OP = 'DELETE' OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
    _change_type := 'shift_cancelled';
  ELSIF OLD.start_time != NEW.start_time OR OLD.end_time != NEW.end_time THEN
    _change_type := 'shift_time_changed';
  ELSIF OLD.date != NEW.date THEN
    _change_type := 'shift_date_changed';
  ELSIF OLD.location_id IS DISTINCT FROM NEW.location_id THEN
    _change_type := 'shift_location_changed';
  ELSE
    RETURN NEW;
  END IF;

  -- Build body message
  CASE _change_type
    WHEN 'shift_cancelled' THEN
      _body := 'El turno "' || COALESCE(NEW.title, OLD.title) || '" del ' || to_char(COALESCE(NEW.date, OLD.date)::date, 'DD Mon') || ' ha sido cancelado.';
    WHEN 'shift_time_changed' THEN
      _body := 'El horario del turno "' || NEW.title || '" cambió a ' || substring(NEW.start_time::text from 1 for 5) || ' - ' || substring(NEW.end_time::text from 1 for 5) || '.';
    WHEN 'shift_date_changed' THEN
      _body := 'El turno "' || NEW.title || '" se movió al ' || to_char(NEW.date::date, 'DD Mon') || '.';
    WHEN 'shift_location_changed' THEN
      _body := 'La ubicación del turno "' || NEW.title || '" del ' || to_char(NEW.date::date, 'DD Mon') || ' ha sido actualizada.';
  END CASE;

  -- Notify all assigned employees
  FOR _assignment IN
    SELECT employee_id FROM shift_assignments
    WHERE shift_id = COALESCE(NEW.id, OLD.id)
      AND status NOT IN ('rejected', 'removed')
  LOOP
    INSERT INTO notifications (
      company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
    ) VALUES (
      COALESCE(NEW.company_id, OLD.company_id),
      _assignment.employee_id,
      'employee',
      _change_type,
      CASE _change_type
        WHEN 'shift_cancelled' THEN '❌ Turno cancelado'
        WHEN 'shift_time_changed' THEN '🔄 Cambio de horario'
        WHEN 'shift_date_changed' THEN '📅 Cambio de fecha'
        WHEN 'shift_location_changed' THEN '📍 Cambio de ubicación'
      END,
      _body,
      jsonb_build_object('shift_id', COALESCE(NEW.id, OLD.id)),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach trigger to scheduled_shifts
CREATE TRIGGER trg_notify_shift_change
  AFTER UPDATE ON public.scheduled_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_employees_on_shift_change();
