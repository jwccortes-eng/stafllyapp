
-- 1. Trigger to prevent overlapping time_entries for the same employee
CREATE OR REPLACE FUNCTION public.prevent_overlapping_time_entries()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  _overlap_id uuid;
  _overlap_in timestamptz;
BEGIN
  -- Skip if no clock_in (shouldn't happen but safety)
  IF NEW.clock_in IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine effective clock_out: if null (open entry), treat as "now + 24h" for overlap check
  -- This prevents a new entry while another is still open
  SELECT te.id, te.clock_in INTO _overlap_id, _overlap_in
  FROM time_entries te
  WHERE te.employee_id = NEW.employee_id
    AND te.id IS DISTINCT FROM NEW.id
    -- Check overlap: new entry's range intersects existing entry's range
    AND (
      -- Case 1: existing entry is still open (no clock_out) → always overlaps with any new entry
      (te.clock_out IS NULL)
      OR
      -- Case 2: both have clock_out → standard range overlap
      (
        NEW.clock_in::timestamptz < te.clock_out::timestamptz
        AND (NEW.clock_out IS NULL OR NEW.clock_out::timestamptz > te.clock_in::timestamptz)
      )
    )
  LIMIT 1;

  IF _overlap_id IS NOT NULL THEN
    RAISE EXCEPTION 'El fichaje se solapa con otro registro existente (entrada: %). Cierra o elimina el fichaje anterior antes de crear uno nuevo.',
      to_char(_overlap_in, 'DD/MM HH24:MI');
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_prevent_overlap_time_entries ON time_entries;
CREATE TRIGGER trg_prevent_overlap_time_entries
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_overlapping_time_entries();

-- 2. Update consolidate_period_base_pay to report open (unclosed) entries as a warning
CREATE OR REPLACE FUNCTION public.consolidate_period_base_pay(_company_id uuid, _period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _period RECORD;
  _ot_threshold numeric := 40;
  _config_val jsonb;
  _result jsonb;
  _affected int := 0;
  _skipped_import int := 0;
  _clock_source text := 'shifts';
  _open_entries int := 0;
  _rejected_entries int := 0;
BEGIN
  -- Validate period exists and belongs to company
  SELECT id, start_date, end_date, status
    INTO _period
    FROM pay_periods
   WHERE id = _period_id AND company_id = _company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Period not found or does not belong to company');
  END IF;

  -- Read OT threshold from company_settings if available
  SELECT value INTO _config_val
    FROM company_settings
   WHERE company_id = _company_id AND key = 'payroll_config';

  IF _config_val IS NOT NULL AND (_config_val->>'ot_weekly_threshold') IS NOT NULL THEN
    _ot_threshold := (_config_val->>'ot_weekly_threshold')::numeric;
  END IF;

  -- Count existing import-based records (will be skipped)
  SELECT count(*) INTO _skipped_import
    FROM period_base_pay
   WHERE period_id = _period_id
     AND company_id = _company_id
     AND import_id IS NOT NULL;

  -- Count open (unclosed) entries in this period — warn the admin
  SELECT count(*) INTO _open_entries
    FROM time_entries te
   WHERE te.company_id = _company_id
     AND te.clock_out IS NULL
     AND te.clock_in::date >= _period.start_date::date
     AND te.clock_in::date <= _period.end_date::date;

  -- Count rejected entries in this period — informational
  SELECT count(*) INTO _rejected_entries
    FROM time_entries te
   WHERE te.company_id = _company_id
     AND te.status = 'rejected'
     AND te.clock_in::date >= _period.start_date::date
     AND te.clock_in::date <= _period.end_date::date;

  -- Determine clock source: prefer time_entries (approved) if any exist for this period
  IF EXISTS (
    SELECT 1 FROM time_entries te
     WHERE te.company_id = _company_id
       AND te.status = 'approved'
       AND te.clock_out IS NOT NULL
       AND te.clock_in::date >= _period.start_date::date
       AND te.clock_in::date <= _period.end_date::date
  ) THEN
    _clock_source := 'time_entries';
  END IF;

  IF _clock_source = 'time_entries' THEN
    WITH clock_hours AS (
      SELECT
        te.employee_id,
        SUM(
          EXTRACT(EPOCH FROM (te.clock_out::timestamptz - te.clock_in::timestamptz)) / 3600.0
          - COALESCE(te.break_minutes, 0) / 60.0
        ) AS total_work_hours,
        COALESCE(
          AVG(NULLIF(s.hourly_rate_usd, 0)),
          0
        ) AS avg_rate
      FROM time_entries te
      LEFT JOIN scheduled_shifts ss ON ss.id = te.shift_id
      LEFT JOIN shifts s ON s.employee_id = te.employee_id
                        AND s.period_id = _period_id
                        AND s.company_id = _company_id
      WHERE te.company_id = _company_id
        AND te.status = 'approved'
        AND te.clock_in IS NOT NULL
        AND te.clock_out IS NOT NULL
        AND te.clock_out::timestamptz > te.clock_in::timestamptz
        AND te.clock_in::date >= _period.start_date::date
        AND te.clock_in::date <= _period.end_date::date
      GROUP BY te.employee_id
    ),
    calculated AS (
      SELECT
        ch.employee_id,
        ROUND(ch.total_work_hours::numeric, 2) AS total_work_hours,
        ROUND(LEAST(ch.total_work_hours, _ot_threshold)::numeric, 2) AS total_regular,
        ROUND(GREATEST(ch.total_work_hours - _ot_threshold, 0)::numeric, 2) AS total_overtime,
        ROUND(ch.total_work_hours::numeric, 2) AS total_paid_hours,
        ch.avg_rate,
        ROUND(
          (LEAST(ch.total_work_hours, _ot_threshold) * ch.avg_rate
           + GREATEST(ch.total_work_hours - _ot_threshold, 0) * ch.avg_rate * 1.5
          )::numeric, 2
        ) AS base_total_pay
      FROM clock_hours ch
      WHERE ch.total_work_hours > 0
    )
    INSERT INTO period_base_pay (
      company_id, period_id, employee_id,
      total_work_hours, total_regular, total_overtime,
      total_paid_hours, base_total_pay, import_id
    )
    SELECT
      _company_id, _period_id, c.employee_id,
      c.total_work_hours, c.total_regular, c.total_overtime,
      c.total_paid_hours, c.base_total_pay, NULL
    FROM calculated c
    WHERE NOT EXISTS (
      SELECT 1 FROM period_base_pay pbp
       WHERE pbp.period_id = _period_id
         AND pbp.company_id = _company_id
         AND pbp.employee_id = c.employee_id
         AND pbp.import_id IS NOT NULL
    )
    ON CONFLICT (period_id, employee_id)
    DO UPDATE SET
      total_work_hours = EXCLUDED.total_work_hours,
      total_regular = EXCLUDED.total_regular,
      total_overtime = EXCLUDED.total_overtime,
      total_paid_hours = EXCLUDED.total_paid_hours,
      base_total_pay = EXCLUDED.base_total_pay
    WHERE period_base_pay.import_id IS NULL;

  ELSE
    WITH clock_hours AS (
      SELECT
        s.employee_id,
        SUM(
          EXTRACT(EPOCH FROM (s.clock_out_time::timestamptz - s.clock_in_time::timestamptz)) / 3600.0
        ) AS total_work_hours,
        COALESCE(AVG(NULLIF(s.hourly_rate_usd, 0)), 0) AS avg_rate
      FROM shifts s
      WHERE s.company_id = _company_id
        AND s.period_id = _period_id
        AND s.clock_in_time IS NOT NULL
        AND s.clock_out_time IS NOT NULL
        AND s.clock_out_time::timestamptz > s.clock_in_time::timestamptz
      GROUP BY s.employee_id
    ),
    calculated AS (
      SELECT
        ch.employee_id,
        ROUND(ch.total_work_hours::numeric, 2) AS total_work_hours,
        ROUND(LEAST(ch.total_work_hours, _ot_threshold)::numeric, 2) AS total_regular,
        ROUND(GREATEST(ch.total_work_hours - _ot_threshold, 0)::numeric, 2) AS total_overtime,
        ch.total_work_hours AS total_paid_hours,
        ch.avg_rate,
        ROUND(
          (LEAST(ch.total_work_hours, _ot_threshold) * ch.avg_rate
           + GREATEST(ch.total_work_hours - _ot_threshold, 0) * ch.avg_rate * 1.5
          )::numeric, 2
        ) AS base_total_pay
      FROM clock_hours ch
    )
    INSERT INTO period_base_pay (
      company_id, period_id, employee_id,
      total_work_hours, total_regular, total_overtime,
      total_paid_hours, base_total_pay, import_id
    )
    SELECT
      _company_id, _period_id, c.employee_id,
      c.total_work_hours, c.total_regular, c.total_overtime,
      c.total_paid_hours, c.base_total_pay, NULL
    FROM calculated c
    WHERE NOT EXISTS (
      SELECT 1 FROM period_base_pay pbp
       WHERE pbp.period_id = _period_id
         AND pbp.company_id = _company_id
         AND pbp.employee_id = c.employee_id
         AND pbp.import_id IS NOT NULL
    )
    ON CONFLICT (period_id, employee_id)
    DO UPDATE SET
      total_work_hours = EXCLUDED.total_work_hours,
      total_regular = EXCLUDED.total_regular,
      total_overtime = EXCLUDED.total_overtime,
      total_paid_hours = EXCLUDED.total_paid_hours,
      base_total_pay = EXCLUDED.base_total_pay
    WHERE period_base_pay.import_id IS NULL;

  END IF;

  GET DIAGNOSTICS _affected = ROW_COUNT;

  _result := jsonb_build_object(
    'success', true,
    'consolidated_employees', _affected,
    'skipped_import_employees', _skipped_import,
    'ot_threshold', _ot_threshold,
    'period_id', _period_id::text,
    'clock_source', _clock_source,
    'open_entries', _open_entries,
    'rejected_entries', _rejected_entries
  );

  -- Log activity
  INSERT INTO activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), _company_id, 'consolidate_clock',
    'pay_period', _period_id::text,
    _result
  );

  RETURN _result;
END;
$function$;
