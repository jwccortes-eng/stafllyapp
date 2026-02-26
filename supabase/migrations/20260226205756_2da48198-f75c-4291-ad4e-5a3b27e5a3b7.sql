
-- DB function: consolidate clock records into period_base_pay
-- Only affects records NOT from CSV import (import_id IS NULL)
-- OT default: 40 hours/week
CREATE OR REPLACE FUNCTION public.consolidate_period_base_pay(
  _company_id uuid,
  _period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _period RECORD;
  _ot_threshold numeric := 40;
  _config_val jsonb;
  _result jsonb;
  _affected int := 0;
  _skipped_import int := 0;
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

  -- Consolidate: aggregate shifts with complete clock_in/out for this period
  WITH clock_hours AS (
    SELECT
      s.employee_id,
      SUM(
        EXTRACT(EPOCH FROM (s.clock_out_time::timestamptz - s.clock_in_time::timestamptz)) / 3600.0
      ) AS total_work_hours,
      -- Use the employee's hourly_rate from shifts if available, else 0
      COALESCE(AVG(NULLIF(s.hourly_rate_usd, 0)), 0) AS avg_rate
    FROM shifts s
    WHERE s.company_id = _company_id
      AND s.period_id = _period_id
      AND s.clock_in_time IS NOT NULL
      AND s.clock_out_time IS NOT NULL
      -- Only count valid durations (clock_out > clock_in)
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
      -- base_total_pay = regular * rate + overtime * rate * 1.5
      ROUND(
        (LEAST(ch.total_work_hours, _ot_threshold) * ch.avg_rate
         + GREATEST(ch.total_work_hours - _ot_threshold, 0) * ch.avg_rate * 1.5
        )::numeric, 2
      ) AS base_total_pay
    FROM clock_hours ch
  )
  -- UPSERT only for records WITHOUT an import source
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
  -- Skip employees that already have an import-based record
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
  -- Only update if the existing record is clock-sourced (no import)
  WHERE period_base_pay.import_id IS NULL;

  GET DIAGNOSTICS _affected = ROW_COUNT;

  _result := jsonb_build_object(
    'success', true,
    'consolidated_employees', _affected,
    'skipped_import_employees', _skipped_import,
    'ot_threshold', _ot_threshold,
    'period_id', _period_id::text
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
$$;

-- Ensure unique constraint exists for the UPSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'period_base_pay_period_employee_unique'
  ) THEN
    ALTER TABLE period_base_pay
      ADD CONSTRAINT period_base_pay_period_employee_unique
      UNIQUE (period_id, employee_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
