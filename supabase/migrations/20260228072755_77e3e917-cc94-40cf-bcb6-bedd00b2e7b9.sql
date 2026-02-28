
-- 1. Add pay_type to scheduled_shifts
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'hourly';

-- Add a comment for documentation
COMMENT ON COLUMN public.scheduled_shifts.pay_type IS 'hourly = paid by hours worked; daily = paid a flat daily rate regardless of clock';

-- 2. Update consolidation function to auto-generate movements for daily-pay shifts
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
  _daily_movements int := 0;
  _daily_concept_id uuid;
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

  -- Count open (unclosed) entries in this period
  SELECT count(*) INTO _open_entries
    FROM time_entries te
   WHERE te.company_id = _company_id
     AND te.clock_out IS NULL
     AND te.clock_in::date >= _period.start_date::date
     AND te.clock_in::date <= _period.end_date::date;

  -- Count rejected entries
  SELECT count(*) INTO _rejected_entries
    FROM time_entries te
   WHERE te.company_id = _company_id
     AND te.status = 'rejected'
     AND te.clock_in::date >= _period.start_date::date
     AND te.clock_in::date <= _period.end_date::date;

  -- Determine clock source
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

  -- ========== HOURLY consolidation (existing logic) ==========
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
        -- Exclude entries linked to daily-pay shifts
        AND (te.shift_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM scheduled_shifts ds
           WHERE ds.id = te.shift_id AND ds.pay_type = 'daily'
        ))
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

  -- ========== DAILY-PAY auto-movements ==========
  -- Find or create "Daily Pay" concept for this company
  SELECT id INTO _daily_concept_id
    FROM concepts
   WHERE company_id = _company_id
     AND name = 'Daily Pay'
     AND category = 'earning'
   LIMIT 1;

  IF _daily_concept_id IS NULL THEN
    INSERT INTO concepts (company_id, name, category, calc_mode, rate_source, unit_label, is_active)
    VALUES (_company_id, 'Daily Pay', 'earning', 'qty_x_rate', 'employee_rate', 'días', true)
    RETURNING id INTO _daily_concept_id;
  END IF;

  -- Generate movements for daily-pay shifts:
  -- Count distinct days each employee was assigned to a daily-pay shift in this period
  WITH daily_assignments AS (
    SELECT
      sa.employee_id,
      COUNT(DISTINCT ss.date) AS days_worked,
      COALESCE(
        (SELECT cer.rate FROM concept_employee_rates cer
          WHERE cer.concept_id = _daily_concept_id
            AND cer.employee_id = sa.employee_id
            AND (cer.effective_from IS NULL OR cer.effective_from <= _period.end_date::date)
            AND (cer.effective_to IS NULL OR cer.effective_to >= _period.start_date::date)
          ORDER BY cer.effective_from DESC NULLS LAST
          LIMIT 1),
        (SELECT c2.default_rate FROM concepts c2 WHERE c2.id = _daily_concept_id),
        0
      ) AS daily_rate
    FROM shift_assignments sa
    JOIN scheduled_shifts ss ON ss.id = sa.shift_id
    WHERE ss.company_id = _company_id
      AND ss.pay_type = 'daily'
      AND ss.deleted_at IS NULL
      AND ss.date >= _period.start_date::text
      AND ss.date <= _period.end_date::text
      AND sa.status IN ('accepted', 'pending', 'confirmed')
    GROUP BY sa.employee_id
  )
  INSERT INTO movements (company_id, period_id, employee_id, concept_id, quantity, rate, total_value, note, created_by)
  SELECT
    _company_id, _period_id, da.employee_id, _daily_concept_id,
    da.days_worked, da.daily_rate,
    da.days_worked * da.daily_rate,
    'Auto: ' || da.days_worked || ' día(s) de turno diario',
    auth.uid()
  FROM daily_assignments da
  WHERE da.daily_rate > 0
    -- Don't duplicate: skip if a movement already exists for this concept+employee+period
    AND NOT EXISTS (
      SELECT 1 FROM movements m
       WHERE m.period_id = _period_id
         AND m.employee_id = da.employee_id
         AND m.concept_id = _daily_concept_id
         AND m.company_id = _company_id
    );

  GET DIAGNOSTICS _daily_movements = ROW_COUNT;

  _result := jsonb_build_object(
    'success', true,
    'consolidated_employees', _affected,
    'skipped_import_employees', _skipped_import,
    'ot_threshold', _ot_threshold,
    'period_id', _period_id::text,
    'clock_source', _clock_source,
    'open_entries', _open_entries,
    'rejected_entries', _rejected_entries,
    'daily_pay_movements', _daily_movements
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
