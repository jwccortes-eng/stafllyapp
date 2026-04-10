
-- 1. Add operational_version to scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS operational_version integer NOT NULL DEFAULT 1;

-- 2. Add acceptance tracking fields to shift_assignments
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS response_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS response_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_shift_version integer;

-- 3. Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_shift_assignments_response
  ON public.shift_assignments (shift_id, response_status);

-- 4. Trigger function: on material shift change, bump version and invalidate acceptances
CREATE OR REPLACE FUNCTION public.handle_material_shift_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _is_material boolean := false;
  _assignment RECORD;
BEGIN
  -- Detect material changes
  IF OLD.date IS DISTINCT FROM NEW.date
     OR OLD.start_time IS DISTINCT FROM NEW.start_time
     OR OLD.end_time IS DISTINCT FROM NEW.end_time
     OR OLD.location_id IS DISTINCT FROM NEW.location_id
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.meeting_point IS DISTINCT FROM NEW.meeting_point
     OR OLD.notes IS DISTINCT FROM NEW.notes
     OR OLD.pay_type IS DISTINCT FROM NEW.pay_type
     OR OLD.hourly_rate IS DISTINCT FROM NEW.hourly_rate
  THEN
    _is_material := true;
  END IF;

  IF NOT _is_material THEN
    RETURN NEW;
  END IF;

  -- Bump operational version
  NEW.operational_version := OLD.operational_version + 1;

  -- Invalidate all accepted assignments and notify
  FOR _assignment IN
    SELECT id, employee_id
    FROM shift_assignments
    WHERE shift_id = NEW.id
      AND status NOT IN ('rejected', 'removed')
      AND response_status = 'accepted'
  LOOP
    UPDATE shift_assignments
    SET response_status = 'needs_reacceptance',
        response_required = true
    WHERE id = _assignment.id;

    INSERT INTO notifications (
      company_id, recipient_id, recipient_type, type, title, body, metadata, created_by
    ) VALUES (
      NEW.company_id,
      _assignment.employee_id,
      'employee',
      'shift_updated_reaccept',
      '🔄 Turno actualizado — acepta nuevamente',
      'Tu turno "' || NEW.title || '" del ' || to_char(NEW.date::date, 'DD Mon') ||
        ' fue modificado. Debes aceptarlo o rechazarlo nuevamente.',
      jsonb_build_object(
        'shift_id', NEW.id,
        'assignment_id', _assignment.id,
        'old_date', OLD.date::text,
        'new_date', NEW.date::text,
        'old_start', OLD.start_time::text,
        'new_start', NEW.start_time::text,
        'old_end', OLD.end_time::text,
        'new_end', NEW.end_time::text,
        'old_title', OLD.title,
        'new_title', NEW.title
      ),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 5. Attach trigger
DROP TRIGGER IF EXISTS trg_material_shift_change ON public.scheduled_shifts;
CREATE TRIGGER trg_material_shift_change
  BEFORE UPDATE ON public.scheduled_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_material_shift_change();
