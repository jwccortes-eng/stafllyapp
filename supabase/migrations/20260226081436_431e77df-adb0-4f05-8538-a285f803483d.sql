
-- Trigger function: notify admins/managers when an employee submits a shift request
CREATE OR REPLACE FUNCTION public.notify_managers_on_shift_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shift RECORD;
  _emp RECORD;
  _manager RECORD;
BEGIN
  -- Get shift info
  SELECT title, date INTO _shift FROM scheduled_shifts WHERE id = NEW.shift_id;
  -- Get employee name
  SELECT first_name, last_name INTO _emp FROM employees WHERE id = NEW.employee_id;

  -- Notify all admins and managers with shifts edit permission for this company
  FOR _manager IN
    SELECT DISTINCT cu.user_id
    FROM company_users cu
    WHERE cu.company_id = NEW.company_id
      AND (
        cu.role IN ('admin', 'owner')
        OR EXISTS (
          SELECT 1 FROM module_permissions mp
          WHERE mp.user_id = cu.user_id AND mp.module = 'shifts' AND mp.can_edit = true
        )
      )
  LOOP
    INSERT INTO notifications (
      company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
    ) VALUES (
      NEW.company_id,
      _manager.user_id,
      'user',
      'shift_request_new',
      '🖐️ Nueva solicitud de turno',
      _emp.first_name || ' ' || _emp.last_name || ' solicita el turno "' || _shift.title || '" del ' || to_char(_shift.date::date, 'DD Mon'),
      jsonb_build_object('shift_id', NEW.shift_id, 'employee_id', NEW.employee_id, 'request_id', NEW.id),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger on shift_requests insert
CREATE TRIGGER trg_notify_managers_on_shift_request
AFTER INSERT ON public.shift_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_managers_on_shift_request();
