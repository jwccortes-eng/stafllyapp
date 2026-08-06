-- P0 PAYROLL RATE TRUTH AND SAFETY (Fase 0 + Fase 1)

CREATE OR REPLACE FUNCTION public.resolve_payroll_hourly_rate(
  _company_id uuid, _employee_id uuid, _period_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _period RECORD;
  _hourly_concept_id uuid;
  _rate numeric;
  _source text;
BEGIN
  SELECT start_date, end_date, status INTO _period
    FROM pay_periods WHERE id = _period_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('rate', NULL, 'source', 'unknown', 'is_legacy', false,
      'fallback_used', false, 'missing_rate', true, 'currency', 'USD',
      'concept', 'Hourly Rate', 'period_id', _period_id, 'period_status', NULL);
  END IF;

  SELECT id INTO _hourly_concept_id
    FROM concepts WHERE company_id = _company_id AND name = 'Hourly Rate' LIMIT 1;

  SELECT AVG(NULLIF(s.hourly_rate_usd, 0)) INTO _rate
    FROM shifts s
   WHERE s.employee_id = _employee_id AND s.period_id = _period_id AND s.company_id = _company_id
     AND s.hourly_rate_usd IS NOT NULL AND s.hourly_rate_usd > 0;
  IF _rate IS NOT NULL AND _rate > 0 THEN
    _source := 'legacy_shifts';
  ELSE
    SELECT cer.rate INTO _rate
      FROM concept_employee_rates cer
     WHERE cer.employee_id = _employee_id AND cer.concept_id = _hourly_concept_id
       AND (cer.effective_from IS NULL OR cer.effective_from <= _period.end_date::date)
       AND (cer.effective_to IS NULL OR cer.effective_to >= _period.start_date::date)
     ORDER BY cer.effective_from DESC NULLS LAST LIMIT 1;
    IF _rate IS NOT NULL AND _rate > 0 THEN
      _source := 'concept_employee_rate';
    ELSE
      SELECT c2.default_rate INTO _rate
        FROM concepts c2 WHERE c2.id = _hourly_concept_id AND c2.default_rate > 0;
      IF _rate IS NOT NULL AND _rate > 0 THEN
        _source := 'concept_default';
      ELSE
        _rate := NULL;
        _source := 'none';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'rate', _rate,
    'source', _source,
    'is_legacy', _source = 'legacy_shifts',
    'fallback_used', _source = 'concept_default',
    'missing_rate', _rate IS NULL OR _rate <= 0,
    'currency', 'USD',
    'concept', 'Hourly Rate',
    'period_id', _period_id,
    'period_status', _period.status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_payroll_hourly_rate(uuid, uuid, uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.payroll_consolidation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  time_entry_ids uuid[] NOT NULL DEFAULT '{}',
  worked_hours numeric,
  applied_rate numeric,
  rate_source text,
  is_legacy_source boolean NOT NULL DEFAULT false,
  fallback_used boolean NOT NULL DEFAULT false,
  period_status text,
  actor_id uuid,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payroll_consolidation_audit TO authenticated;
GRANT ALL ON public.payroll_consolidation_audit TO service_role;

ALTER TABLE public.payroll_consolidation_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members read payroll consolidation audit" ON public.payroll_consolidation_audit;
CREATE POLICY "company members read payroll consolidation audit"
ON public.payroll_consolidation_audit FOR SELECT TO authenticated
USING (
  public.has_company_role(auth.uid(), company_id, 'admin')
  OR public.has_company_role(auth.uid(), company_id, 'owner')
  OR public.has_company_role(auth.uid(), company_id, 'manager')
);

CREATE INDEX IF NOT EXISTS idx_payroll_consolidation_audit_period
  ON public.payroll_consolidation_audit (company_id, period_id, created_at DESC);

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
  _hourly_concept_id uuid;
  _current_user uuid;
  _anomalous_count int := 0;
  _missing_rate_employees jsonb := '[]'::jsonb;
  _legacy_rate_count int := 0;
  _max_single_clock_hours numeric := 16;
  _max_schedule_deviation_factor numeric := 3;
BEGIN
  _current_user := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  SELECT id, start_date, end_date, status
    INTO _period
    FROM pay_periods
   WHERE id = _period_id AND company_id = _company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Period not found or does not belong to company');
  END IF;

  -- P0 PAYROLL SAFETY: fail-closed on locked periods (closed / paid).
  IF _period.status IN ('closed', 'paid') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'period_locked',
      'period_status', _period.status,
      'error', 'Este periodo ya está cerrado y no puede recalcularse.'
    );
  END IF;

  SELECT value INTO _config_val
    FROM company_settings
   WHERE company_id = _company_id AND key = 'payroll_config';

  IF _config_val IS NOT NULL AND (_config_val->>'ot_weekly_threshold') IS NOT NULL THEN
    _ot_threshold := (_config_val->>'ot_weekly_threshold')::numeric;
  END IF;

  SELECT id INTO _hourly_concept_id
    FROM concepts
   WHERE company_id = _company_id AND name = 'Hourly Rate'
   LIMIT 1;

  SELECT count(*) INTO _skipped_import
    FROM period_base_pay
   WHERE period_id = _period_id AND company_id = _company_id AND import_id IS NOT NULL;

  SELECT count(*) INTO _open_entries
    FROM time_entries te
   WHERE te.company_id = _company_id AND te.clock_out IS NULL
     AND te.clock_in::date >= _period.start_date::date AND te.clock_in::date <= _period.end_date::date;

  SELECT count(*) INTO _rejected_entries
    FROM time_entries te
   WHERE te.company_id = _company_id AND te.status = 'rejected'
     AND te.clock_in::date >= _period.start_date::date AND te.clock_in::date <= _period.end_date::date;

  IF EXISTS (
    SELECT 1 FROM time_entries te
     WHERE te.company_id = _company_id AND te.status = 'approved' AND te.clock_out IS NOT NULL
       AND te.clock_in::date >= _period.start_date::date AND te.clock_in::date <= _period.end_date::date
  ) THEN
    _clock_source := 'time_entries';
  END IF;

  IF _clock_source = 'time_entries' THEN
    WITH raw_clock_hours AS (
      SELECT te.employee_id,
        te.id AS entry_id,
        EXTRACT(EPOCH FROM (te.clock_out::timestamptz - te.clock_in::timestamptz)) / 3600.0
          - COALESCE(te.break_minutes, 0) / 60.0 AS entry_hours,
        CASE WHEN te.shift_id IS NOT NULL THEN
          (SELECT EXTRACT(EPOCH FROM (ss.end_time - ss.start_time)) / 3600.0
           FROM scheduled_shifts ss WHERE ss.id = te.shift_id)
        ELSE NULL END AS scheduled_hours
      FROM time_entries te
      WHERE te.company_id = _company_id AND te.status = 'approved'
        AND te.clock_in IS NOT NULL AND te.clock_out IS NOT NULL
        AND te.clock_out::timestamptz > te.clock_in::timestamptz
        AND te.clock_in::date >= _period.start_date::date AND te.clock_in::date <= _period.end_date::date
        AND (te.shift_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM scheduled_shifts ds WHERE ds.id = te.shift_id AND ds.pay_type = 'daily'
        ))
    ),
    flagged_entries AS (
      SELECT rch.*,
        (rch.entry_hours > _max_single_clock_hours) AS flag_exceeds_max,
        (rch.scheduled_hours IS NOT NULL AND rch.entry_hours > rch.scheduled_hours * _max_schedule_deviation_factor) AS flag_exceeds_schedule,
        (rch.entry_hours > _max_single_clock_hours 
         OR (rch.scheduled_hours IS NOT NULL AND rch.entry_hours > rch.scheduled_hours * _max_schedule_deviation_factor)
        ) AS is_anomalous
      FROM raw_clock_hours rch
    ),
    clean_clock_hours AS (
      SELECT employee_id,
        SUM(CASE WHEN NOT is_anomalous THEN entry_hours ELSE 0 END) AS total_work_hours,
        COUNT(*) FILTER (WHERE is_anomalous) AS anomaly_count,
        jsonb_agg(
          CASE WHEN is_anomalous THEN 
            jsonb_build_object(
              'entry_id', entry_id,
              'clocked_hours', ROUND(entry_hours::numeric, 2),
              'scheduled_hours', ROUND(COALESCE(scheduled_hours, 0)::numeric, 2),
              'flags', ARRAY[
                CASE WHEN flag_exceeds_max THEN 'exceeds_16h_max' END,
                CASE WHEN flag_exceeds_schedule THEN 'exceeds_3x_schedule' END
              ]
            )
          END
        ) FILTER (WHERE is_anomalous) AS anomaly_details
      FROM flagged_entries
      GROUP BY employee_id
    ),
    emp_rates AS (
      SELECT ch.employee_id,
        ch.total_work_hours,
        ch.anomaly_count,
        ch.anomaly_details,
        COALESCE((rr.info->>'rate')::numeric, 0) AS hourly_rate,
        COALESCE((rr.info->>'missing_rate')::boolean, true) AS missing_rate
      FROM clean_clock_hours ch
      CROSS JOIN LATERAL public.resolve_payroll_hourly_rate(_company_id, ch.employee_id, _period_id) AS rr(info)
      WHERE ch.total_work_hours > 0 OR ch.anomaly_count > 0
    ),
    calculated AS (
      SELECT er.employee_id,
        ROUND(er.total_work_hours::numeric, 2) AS total_work_hours,
        ROUND(LEAST(er.total_work_hours, _ot_threshold)::numeric, 2) AS total_regular,
        ROUND(GREATEST(er.total_work_hours - _ot_threshold, 0)::numeric, 2) AS total_overtime,
        ROUND(er.total_work_hours::numeric, 2) AS total_paid_hours,
        ROUND((LEAST(er.total_work_hours, _ot_threshold) * er.hourly_rate
           + GREATEST(er.total_work_hours - _ot_threshold, 0) * er.hourly_rate * 1.5)::numeric, 2) AS base_total_pay,
        er.anomaly_count,
        er.anomaly_details,
        er.missing_rate,
        (er.anomaly_count > 0 AND er.total_work_hours = 0) AS is_anomalous
      FROM emp_rates er
    )
    INSERT INTO period_base_pay (company_id, period_id, employee_id, total_work_hours, total_regular, total_overtime, total_paid_hours, base_total_pay, import_id, anomaly_flags, is_anomalous)
    SELECT _company_id, _period_id, c.employee_id, c.total_work_hours, c.total_regular, c.total_overtime, c.total_paid_hours, c.base_total_pay, NULL, COALESCE(c.anomaly_details, '[]'::jsonb), c.is_anomalous
    FROM calculated c
    WHERE NOT c.missing_rate
      AND NOT EXISTS (
      SELECT 1 FROM period_base_pay pbp WHERE pbp.period_id = _period_id AND pbp.company_id = _company_id AND pbp.employee_id = c.employee_id AND pbp.import_id IS NOT NULL
    )
    ON CONFLICT (period_id, employee_id)
    DO UPDATE SET total_work_hours = EXCLUDED.total_work_hours, total_regular = EXCLUDED.total_regular, total_overtime = EXCLUDED.total_overtime, total_paid_hours = EXCLUDED.total_paid_hours, base_total_pay = EXCLUDED.base_total_pay, anomaly_flags = EXCLUDED.anomaly_flags, is_anomalous = EXCLUDED.is_anomalous
    WHERE period_base_pay.import_id IS NULL;

    GET DIAGNOSTICS _affected = ROW_COUNT;

    SELECT count(*) INTO _anomalous_count FROM period_base_pay WHERE period_id = _period_id AND company_id = _company_id AND is_anomalous = true;

  ELSE
    WITH shift_hours AS (
      SELECT s.employee_id,
        SUM(COALESCE(s.shift_hours, 0)) AS total_work_hours,
        AVG(NULLIF(s.hourly_rate_usd, 0)) AS avg_rate
      FROM shifts s
      WHERE s.period_id = _period_id AND s.company_id = _company_id
      GROUP BY s.employee_id
    ),
    emp_rates AS (
      SELECT sh.employee_id,
        sh.total_work_hours,
        COALESCE((rr.info->>'rate')::numeric, 0) AS hourly_rate,
        COALESCE((rr.info->>'missing_rate')::boolean, true) AS missing_rate
      FROM shift_hours sh
      CROSS JOIN LATERAL public.resolve_payroll_hourly_rate(_company_id, sh.employee_id, _period_id) AS rr(info)
      WHERE sh.total_work_hours > 0
    ),
    calculated AS (
      SELECT er.employee_id,
        ROUND(er.total_work_hours::numeric, 2) AS total_work_hours,
        ROUND(LEAST(er.total_work_hours, _ot_threshold)::numeric, 2) AS total_regular,
        ROUND(GREATEST(er.total_work_hours - _ot_threshold, 0)::numeric, 2) AS total_overtime,
        ROUND(er.total_work_hours::numeric, 2) AS total_paid_hours,
        ROUND((LEAST(er.total_work_hours, _ot_threshold) * er.hourly_rate
           + GREATEST(er.total_work_hours - _ot_threshold, 0) * er.hourly_rate * 1.5)::numeric, 2) AS base_total_pay,
        er.missing_rate
      FROM emp_rates er
    )
    INSERT INTO period_base_pay (company_id, period_id, employee_id, total_work_hours, total_regular, total_overtime, total_paid_hours, base_total_pay, import_id)
    SELECT _company_id, _period_id, c.employee_id, c.total_work_hours, c.total_regular, c.total_overtime, c.total_paid_hours, c.base_total_pay, NULL
    FROM calculated c
    WHERE NOT c.missing_rate
      AND NOT EXISTS (
      SELECT 1 FROM period_base_pay pbp WHERE pbp.period_id = _period_id AND pbp.company_id = _company_id AND pbp.employee_id = c.employee_id AND pbp.import_id IS NOT NULL
    )
    ON CONFLICT (period_id, employee_id)
    DO UPDATE SET total_work_hours = EXCLUDED.total_work_hours, total_regular = EXCLUDED.total_regular, total_overtime = EXCLUDED.total_overtime, total_paid_hours = EXCLUDED.total_paid_hours, base_total_pay = EXCLUDED.base_total_pay
    WHERE period_base_pay.import_id IS NULL;

    GET DIAGNOSTICS _affected = ROW_COUNT;
  END IF;

  SELECT id INTO _daily_concept_id
    FROM concepts
   WHERE company_id = _company_id AND name = 'Daily Pay' AND is_active
   LIMIT 1;

  IF _daily_concept_id IS NOT NULL THEN
    WITH daily_shifts AS (
      SELECT te.employee_id, COUNT(DISTINCT te.clock_in::date) AS days_worked,
        COALESCE(
          (SELECT cer.rate FROM concept_employee_rates cer
            WHERE cer.employee_id = te.employee_id AND cer.concept_id = _daily_concept_id
              AND (cer.effective_from IS NULL OR cer.effective_from <= _period.end_date::date)
              AND (cer.effective_to IS NULL OR cer.effective_to >= _period.start_date::date)
            ORDER BY cer.effective_from DESC NULLS LAST LIMIT 1),
          (SELECT c3.default_rate FROM concepts c3 WHERE c3.id = _daily_concept_id AND c3.default_rate > 0),
          0
        ) AS daily_rate
      FROM time_entries te
      JOIN scheduled_shifts ss ON ss.id = te.shift_id AND ss.pay_type = 'daily'
      WHERE te.company_id = _company_id AND te.status = 'approved'
        AND te.clock_in::date >= _period.start_date::date AND te.clock_in::date <= _period.end_date::date
      GROUP BY te.employee_id
    )
    INSERT INTO movements (company_id, period_id, employee_id, concept_id, quantity, rate, total_value, note, approval_status)
    SELECT _company_id, _period_id, ds.employee_id, _daily_concept_id, ds.days_worked, ds.daily_rate, ds.days_worked * ds.daily_rate, 'Auto: Daily Pay', 'pending'
    FROM daily_shifts ds WHERE ds.daily_rate > 0
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS _daily_movements = ROW_COUNT;
  END IF;

  -- P0 PAYROLL SAFETY: per-worker rate audit + missing-rate report (no silent $0).
  WITH worked AS (
    SELECT te.employee_id,
           array_agg(te.id) AS entry_ids,
           ROUND(SUM(EXTRACT(EPOCH FROM (te.clock_out::timestamptz - te.clock_in::timestamptz)) / 3600.0
             - COALESCE(te.break_minutes, 0) / 60.0)::numeric, 2) AS hours
      FROM time_entries te
     WHERE te.company_id = _company_id AND te.status = 'approved'
       AND te.clock_in IS NOT NULL AND te.clock_out IS NOT NULL
       AND te.clock_in::date >= _period.start_date::date AND te.clock_in::date <= _period.end_date::date
     GROUP BY te.employee_id
  ), resolved AS (
    SELECT w.*, rr.info
      FROM worked w
      CROSS JOIN LATERAL public.resolve_payroll_hourly_rate(_company_id, w.employee_id, _period_id) AS rr(info)
  ), ins AS (
    INSERT INTO payroll_consolidation_audit (
      company_id, period_id, employee_id, time_entry_ids, worked_hours,
      applied_rate, rate_source, is_legacy_source, fallback_used,
      period_status, actor_id, result
    )
    SELECT _company_id, _period_id, r.employee_id, r.entry_ids, r.hours,
           (r.info->>'rate')::numeric, r.info->>'source',
           COALESCE((r.info->>'is_legacy')::boolean, false),
           COALESCE((r.info->>'fallback_used')::boolean, false),
           _period.status, _current_user,
           CASE WHEN COALESCE((r.info->>'missing_rate')::boolean, true)
                THEN 'blocked_missing_rate' ELSE 'consolidated' END
      FROM resolved r
    RETURNING employee_id, result, is_legacy_source
  )
  SELECT COALESCE(jsonb_agg(employee_id) FILTER (WHERE result = 'blocked_missing_rate'), '[]'::jsonb),
         COUNT(*) FILTER (WHERE is_legacy_source)
    INTO _missing_rate_employees, _legacy_rate_count
    FROM ins;

  _result := jsonb_build_object(
    'success', true,
    'missing_rate_employees', COALESCE(_missing_rate_employees, '[]'::jsonb),
    'missing_rate_count', jsonb_array_length(COALESCE(_missing_rate_employees, '[]'::jsonb)),
    'legacy_rate_count', COALESCE(_legacy_rate_count, 0),
    'period_status', _period.status,
    'period_id', _period_id,
    'source', _clock_source,
    'employees_consolidated', _affected,
    'skipped_imported', _skipped_import,
    'open_entries', _open_entries,
    'rejected_entries', _rejected_entries,
    'daily_movements', _daily_movements,
    'anomalous_clocks_suppressed', _anomalous_count
  );

  INSERT INTO activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (_current_user, _company_id, 'consolidate_clock', 'pay_period', _period_id::text, _result);

  RETURN _result;
END;
$function$;