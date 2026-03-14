
-- =============================================
-- Passport Consolidation: DB function
-- Aggregates real shift/time data per worker into passport tables
-- =============================================

CREATE OR REPLACE FUNCTION public.consolidate_passport(_worker_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _passport_id uuid;
  _user_id uuid;
  _emp RECORD;
  _total_hours numeric := 0;
  _total_jobs int := 0;
  _total_companies int := 0;
  _rep_score numeric;
BEGIN
  -- Get user_id from worker_profile
  SELECT user_id INTO _user_id FROM worker_profiles WHERE id = _worker_profile_id;
  IF _user_id IS NULL THEN RETURN; END IF;

  -- Get or create passport_profile
  SELECT id INTO _passport_id FROM passport_profiles WHERE worker_profile_id = _worker_profile_id;
  
  IF _passport_id IS NULL THEN
    -- Get display name
    DECLARE _display text;
    BEGIN
      SELECT COALESCE(full_name, email, 'Worker') INTO _display FROM profiles WHERE user_id = _user_id LIMIT 1;
      INSERT INTO passport_profiles (worker_profile_id, display_name, passport_slug)
      VALUES (_worker_profile_id, _display, replace(gen_random_uuid()::text, '-', ''))
      RETURNING id INTO _passport_id;
    END;
  END IF;

  -- Aggregate work history per company from real shifts
  -- Delete old auto-generated entries, keep manual ones
  DELETE FROM passport_work_history 
  WHERE passport_id = _passport_id AND source_type = 'stafly_verified';

  FOR _emp IN
    SELECT 
      e.id AS emp_id,
      e.company_id,
      c.name AS company_name,
      e.employee_role,
      MIN(s.shift_date) AS date_start,
      MAX(s.shift_date) AS date_end,
      ROUND(COALESCE(SUM(s.shift_hours), 0)::numeric, 1) AS total_hours,
      COUNT(DISTINCT s.id) AS job_count
    FROM employees e
    JOIN companies c ON c.id = e.company_id
    JOIN shifts s ON s.employee_id = e.id AND s.company_id = e.company_id
    WHERE e.user_id = _user_id AND e.is_active = true
    GROUP BY e.id, e.company_id, c.name, e.employee_role
  LOOP
    INSERT INTO passport_work_history (
      passport_id, company_name, role_name, date_start, date_end,
      total_hours, is_verified, source_type, source_id
    ) VALUES (
      _passport_id, _emp.company_name, _emp.employee_role,
      _emp.date_start::text, _emp.date_end::text,
      _emp.total_hours, true, 'stafly_verified', _emp.emp_id::text
    );
    
    _total_hours := _total_hours + _emp.total_hours;
    _total_jobs := _total_jobs + _emp.job_count;
    _total_companies := _total_companies + 1;
  END LOOP;

  -- Also count from time_entries (approved, with clock_out)
  DECLARE
    _clock_hours numeric := 0;
    _clock_jobs int := 0;
  BEGIN
    SELECT 
      COALESCE(SUM(EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 3600.0), 0),
      COUNT(DISTINCT te.id)
    INTO _clock_hours, _clock_jobs
    FROM time_entries te
    JOIN employees emp ON emp.id = te.employee_id AND emp.user_id = _user_id
    WHERE te.status = 'approved' AND te.clock_out IS NOT NULL;
    
    -- Use max of shifts vs clock hours
    IF _clock_hours > _total_hours THEN
      _total_hours := ROUND(_clock_hours::numeric, 1);
    END IF;
    IF _clock_jobs > _total_jobs THEN
      _total_jobs := _clock_jobs;
    END IF;
  END;

  -- Get reputation score
  SELECT overall_score INTO _rep_score
  FROM rep_scores WHERE worker_profile_id = _worker_profile_id;

  -- Update passport_profile aggregates
  UPDATE passport_profiles SET
    total_verified_hours = _total_hours,
    total_verified_jobs = _total_jobs,
    total_companies_worked = _total_companies,
    overall_reputation_score = _rep_score,
    generated_at = now(),
    updated_at = now()
  WHERE id = _passport_id;

  -- Upsert key metrics
  INSERT INTO passport_metrics (passport_id, metric_code, metric_label, metric_value, metric_display_order)
  VALUES
    (_passport_id, 'total_hours', 'Horas Verificadas', _total_hours::text, 1),
    (_passport_id, 'total_jobs', 'Trabajos Completados', _total_jobs::text, 2),
    (_passport_id, 'total_companies', 'Empresas', _total_companies::text, 3),
    (_passport_id, 'rep_score', 'Reputation Score', COALESCE(_rep_score, 50)::text, 4)
  ON CONFLICT (passport_id, metric_code)
  DO UPDATE SET
    metric_value = EXCLUDED.metric_value,
    created_at = now();
END;
$$;

-- Function to consolidate ALL workers (for cron)
CREATE OR REPLACE FUNCTION public.consolidate_all_passports()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _wp RECORD;
  _count int := 0;
BEGIN
  FOR _wp IN SELECT id FROM worker_profiles LOOP
    PERFORM public.consolidate_passport(_wp.id);
    _count := _count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('consolidated', _count, 'at', now());
END;
$$;

-- Add unique constraint on passport_metrics for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'passport_metrics_passport_id_metric_code_key'
  ) THEN
    ALTER TABLE passport_metrics ADD CONSTRAINT passport_metrics_passport_id_metric_code_key
      UNIQUE (passport_id, metric_code);
  END IF;
END $$;
