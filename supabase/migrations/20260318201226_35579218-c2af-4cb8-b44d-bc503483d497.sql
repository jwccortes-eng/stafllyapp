
-- ============================================================
-- PILOT MIGRATION SCHEMA — Connecteam → StaflyApps
-- ============================================================

-- 1. Raw imported records (exactly as received from Connecteam)
CREATE TABLE public.migration_raw_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  source_system text NOT NULL DEFAULT 'connecteam',
  record_type text NOT NULL, -- schedule, clock, payroll, employee, location
  file_name text,
  raw_payload jsonb NOT NULL DEFAULT '{}',
  row_index int,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid
);

ALTER TABLE public.migration_raw_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage raw imports" ON public.migration_raw_imports
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

CREATE INDEX idx_mri_company_type ON migration_raw_imports(company_id, record_type);

-- 2. Normalized import records (mapped to StaflyApps structures)
CREATE TABLE public.migration_normalized_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  record_type text NOT NULL,
  raw_import_id uuid REFERENCES migration_raw_imports(id),
  normalized_payload jsonb NOT NULL DEFAULT '{}',
  source_reference text, -- external ID from Connecteam
  match_status text NOT NULL DEFAULT 'pending', -- pending, matched, unresolved
  stafly_entity_id uuid, -- matched StaflyApps entity
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.migration_normalized_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage normalized records" ON public.migration_normalized_records
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

CREATE INDEX idx_mnr_company_type ON migration_normalized_records(company_id, record_type);
CREATE INDEX idx_mnr_status ON migration_normalized_records(match_status);

-- 3. Employee mapping
CREATE TABLE public.migration_employee_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  connecteam_ref text NOT NULL, -- external employee identifier
  connecteam_name text,
  connecteam_phone text,
  connecteam_email text,
  stafly_employee_id uuid REFERENCES employees(id),
  match_status text NOT NULL DEFAULT 'pending', -- exact_match, probable_match, duplicate_candidate, unresolved, manually_resolved
  match_confidence numeric(5,2),
  match_method text, -- phone, email, name, code, manual
  resolved_by uuid,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, connecteam_ref)
);

ALTER TABLE public.migration_employee_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage employee mapping" ON public.migration_employee_mapping
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- 4. Location mapping
CREATE TABLE public.migration_location_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  connecteam_ref text NOT NULL,
  connecteam_name text,
  connecteam_address text,
  stafly_location_id uuid REFERENCES locations(id),
  match_status text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, connecteam_ref)
);

ALTER TABLE public.migration_location_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage location mapping" ON public.migration_location_mapping
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- 5. Shift mapping
CREATE TABLE public.migration_shift_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  connecteam_ref text NOT NULL,
  connecteam_data jsonb NOT NULL DEFAULT '{}',
  stafly_shift_id uuid REFERENCES scheduled_shifts(id),
  match_status text NOT NULL DEFAULT 'pending', -- exact_match, probable_match, missing_in_staflyapps, missing_in_connecteam, conflict, manually_resolved
  variance_data jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, connecteam_ref)
);

ALTER TABLE public.migration_shift_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage shift mapping" ON public.migration_shift_mapping
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- 6. Clock mapping
CREATE TABLE public.migration_clock_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  connecteam_ref text NOT NULL,
  connecteam_data jsonb NOT NULL DEFAULT '{}',
  stafly_time_entry_id uuid REFERENCES time_entries(id),
  stafly_clock_event_id uuid REFERENCES clock_events(id),
  match_status text NOT NULL DEFAULT 'pending', -- exact_match, within_tolerance, missing_clock_in, missing_clock_out, orphan_clock, duration_mismatch, unresolved, manually_resolved
  tolerance_minutes int,
  variance_data jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, connecteam_ref)
);

ALTER TABLE public.migration_clock_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage clock mapping" ON public.migration_clock_mapping
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- 7. Payroll period reconciliation
CREATE TABLE public.migration_period_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  week_start date NOT NULL,
  week_end date NOT NULL,
  stafly_period_id uuid REFERENCES pay_periods(id),
  status text NOT NULL DEFAULT 'draft_imported', -- draft_imported, partially_matched, under_review, reconciled, locked
  connecteam_totals jsonb DEFAULT '{}', -- gross, hours, weekend_jobs, pay_ride, adjustments
  stafly_totals jsonb DEFAULT '{}',
  total_variance numeric(12,2) DEFAULT 0,
  variance_details jsonb DEFAULT '{}',
  unresolved_count int DEFAULT 0,
  reviewed_by uuid,
  reviewed_at timestamptz,
  locked_by uuid,
  locked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, week_start)
);

ALTER TABLE public.migration_period_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage period reconciliation" ON public.migration_period_reconciliation
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- 8. Reconciliation exceptions queue
CREATE TABLE public.migration_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  period_reconciliation_id uuid REFERENCES migration_period_reconciliation(id),
  exception_type text NOT NULL, -- employee_unmatched, shift_missing, shift_duplicate, clock_orphan, payroll_variance, weekend_job_missing, pay_ride_missing, manual_correction
  severity text NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  source_record_type text, -- employee, shift, clock, payroll
  source_record_ref text,
  source_data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'open', -- open, in_progress, resolved, ignored
  resolution_action text, -- map_manually, merge_duplicate, ignore, create_record, expected_variance
  resolution_note text,
  assigned_to uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.migration_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage exceptions" ON public.migration_exceptions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

CREATE INDEX idx_me_company_status ON migration_exceptions(company_id, status);
CREATE INDEX idx_me_severity ON migration_exceptions(severity);

-- 9. Migration state / cutover readiness tracker
CREATE TABLE public.migration_pilot_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) UNIQUE,
  phase text NOT NULL DEFAULT 'historical_import', -- historical_import, historical_reconciliation, weekly_close_validation, live_sync_bridge, operational_cutover, connecteam_retired
  readiness text NOT NULL DEFAULT 'not_ready', -- not_ready, partially_ready, pilot_ready, ready_for_cutover, connecteam_read_only, connecteam_retired
  date_range_start date,
  date_range_end date,
  total_weeks_imported int DEFAULT 0,
  total_weeks_reconciled int DEFAULT 0,
  total_unresolved_issues int DEFAULT 0,
  sync_active boolean DEFAULT false,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.migration_pilot_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pilot status" ON public.migration_pilot_status
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('developer','owner','admin'))
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- Initialize pilot status for Quality Staff
INSERT INTO migration_pilot_status (company_id, phase, readiness, date_range_start, date_range_end)
VALUES ('00000000-0000-0000-0000-000000000001', 'historical_import', 'not_ready', '2025-01-01', CURRENT_DATE);
