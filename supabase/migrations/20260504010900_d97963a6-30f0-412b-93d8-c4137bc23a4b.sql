CREATE OR REPLACE FUNCTION public.notify_review_on_clockout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _emp RECORD;
  _shift_title text := NULL;
  _manager RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.clock_out IS NULL AND NEW.clock_out IS NOT NULL AND NEW.status = 'approved' THEN
    SELECT first_name, last_name, company_id INTO _emp FROM employees WHERE id = NEW.employee_id;

    IF NEW.shift_id IS NOT NULL THEN
      SELECT title INTO _shift_title FROM scheduled_shifts WHERE id = NEW.shift_id;
    END IF;

    FOR _manager IN
      SELECT DISTINCT cu.user_id
      FROM company_users cu
      WHERE cu.company_id = NEW.company_id
        AND (
          cu.role IN ('admin', 'owner')
          OR EXISTS (
            SELECT 1 FROM module_permissions mp
            WHERE mp.user_id = cu.user_id AND mp.module = 'shifts' AND mp.can_view = true
          )
        )
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM shift_reviews sr
        WHERE sr.shift_id = COALESCE(NEW.shift_id, NEW.id::text::uuid)
          AND sr.reviewed_employee_id = NEW.employee_id
          AND sr.reviewer_type = 'manager'
      ) THEN
        INSERT INTO notifications (
          company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
        ) VALUES (
          NEW.company_id,
          _manager.user_id,
          'user',
          'review_pending',
          '⭐ Evaluación pendiente',
          _emp.first_name || ' ' || _emp.last_name || ' completó ' ||
            CASE WHEN _shift_title IS NOT NULL THEN '"' || _shift_title || '"' ELSE 'su turno' END ||
            '. Evalúa su desempeño.',
          jsonb_build_object(
            'shift_id', NEW.shift_id,
            'employee_id', NEW.employee_id,
            'time_entry_id', NEW.id
          ),
          NULL
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;