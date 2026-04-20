-- 1. New attendance fields on scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'clock',
  ADD COLUMN IF NOT EXISTS meeting_time time without time zone NULL;

-- Constraint: valid attendance modes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_shifts_attendance_mode_check'
  ) THEN
    ALTER TABLE public.scheduled_shifts
      ADD CONSTRAINT scheduled_shifts_attendance_mode_check
      CHECK (attendance_mode IN ('clock', 'arrival', 'hybrid'));
  END IF;
END $$;

COMMENT ON COLUMN public.scheduled_shifts.attendance_mode IS
  'Operational attendance mode: clock (hourly time tracking), arrival (presence only, no payroll hours), hybrid (both).';
COMMENT ON COLUMN public.scheduled_shifts.meeting_time IS
  'Optional operational call time (e.g. 7:30pm for an 8pm event). Used to compute punctuality when present; falls back to start_time.';

-- 2. Extend clock_events
-- Drop old check constraint, add new one with arrival/departure
ALTER TABLE public.clock_events
  DROP CONSTRAINT IF EXISTS clock_events_type_check;

ALTER TABLE public.clock_events
  ADD CONSTRAINT clock_events_type_check
  CHECK (type IN ('clock_in', 'clock_out', 'arrival', 'departure'));

-- Add payroll relevance flag and punctuality
ALTER TABLE public.clock_events
  ADD COLUMN IF NOT EXISTS is_payroll_relevant boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS punctuality text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clock_events_punctuality_check'
  ) THEN
    ALTER TABLE public.clock_events
      ADD CONSTRAINT clock_events_punctuality_check
      CHECK (punctuality IS NULL OR punctuality IN ('on_time', 'late', 'very_late'));
  END IF;
END $$;

COMMENT ON COLUMN public.clock_events.is_payroll_relevant IS
  'When true, this event contributes to payroll hour calculations. arrival/departure events are typically false (presence only).';
COMMENT ON COLUMN public.clock_events.punctuality IS
  'Computed at insert for arrival events: on_time | late | very_late, based on shift meeting_time (or start_time) + company grace_period_minutes.';

-- Index for fast presence queries
CREATE INDEX IF NOT EXISTS idx_clock_events_shift_type
  ON public.clock_events(shift_id, type)
  WHERE shift_id IS NOT NULL;

-- 3. Trigger: auto-compute punctuality and is_payroll_relevant on insert
CREATE OR REPLACE FUNCTION public.compute_clock_event_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_date date;
  v_start_time time;
  v_meeting_time time;
  v_attendance_mode text;
  v_grace_minutes integer := 15;
  v_reference_ts timestamptz;
  v_diff_minutes numeric;
  v_clock_config jsonb;
BEGIN
  -- Force is_payroll_relevant for arrival/departure to false (presence only)
  IF NEW.type IN ('arrival', 'departure') THEN
    NEW.is_payroll_relevant := false;
  END IF;

  -- Compute punctuality only for arrival events with shift context
  IF NEW.type = 'arrival' AND NEW.shift_id IS NOT NULL THEN
    SELECT date, start_time, meeting_time, attendance_mode
      INTO v_shift_date, v_start_time, v_meeting_time, v_attendance_mode
    FROM public.scheduled_shifts
    WHERE id = NEW.shift_id;

    IF v_shift_date IS NOT NULL AND COALESCE(v_meeting_time, v_start_time) IS NOT NULL THEN
      -- Read grace period from company clock_config
      SELECT value INTO v_clock_config
      FROM public.company_settings
      WHERE company_id = NEW.company_id AND key = 'clock_config'
      LIMIT 1;

      IF v_clock_config IS NOT NULL AND v_clock_config ? 'grace_period_minutes' THEN
        v_grace_minutes := COALESCE((v_clock_config->>'grace_period_minutes')::integer, 15);
      END IF;

      -- Reference timestamp: meeting_time wins, fallback to start_time
      v_reference_ts := (v_shift_date::text || ' ' || COALESCE(v_meeting_time, v_start_time)::text)::timestamp
                        AT TIME ZONE 'UTC';

      v_diff_minutes := EXTRACT(EPOCH FROM (NEW.created_at - v_reference_ts)) / 60.0;

      IF v_diff_minutes <= v_grace_minutes THEN
        NEW.punctuality := 'on_time';
      ELSIF v_diff_minutes <= (v_grace_minutes * 2) THEN
        NEW.punctuality := 'late';
      ELSE
        NEW.punctuality := 'very_late';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clock_events_attendance ON public.clock_events;
CREATE TRIGGER trg_clock_events_attendance
  BEFORE INSERT ON public.clock_events
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_clock_event_attendance();