
-- ============================================
-- Compensation Management System — Full Schema
-- ============================================

-- 1. Enums
CREATE TYPE public.payment_mode_type AS ENUM ('hourly', 'daily', 'mixed');
CREATE TYPE public.comp_action_type AS ENUM ('created', 'updated', 'archived', 'imported', 'corrected', 'system_detected', 'inline_table_edit');
CREATE TYPE public.comp_source_type AS ENUM ('manual', 'import', 'migration', 'sync', 'admin_edit', 'inline_edit');
CREATE TYPE public.comp_rule_type AS ENUM ('hourly_default', 'daily_full', 'daily_half', 'ride_regular', 'ride_special', 'custom_daily_pattern');
CREATE TYPE public.comp_unit_type AS ENUM ('hour', 'day', 'half_day', 'ride', 'custom');
CREATE TYPE public.interpreted_payment_type AS ENUM ('hourly', 'daily', 'ride', 'manual_adjustment', 'mixed', 'unknown');
CREATE TYPE public.comp_rate_source AS ENUM ('company_default', 'job_default', 'location_default', 'employee_custom', 'imported');

-- 2. compensation_profiles
CREATE TABLE public.compensation_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  payment_mode public.payment_mode_type NOT NULL DEFAULT 'hourly',
  default_hourly_rate numeric,
  default_daily_rate numeric,
  default_half_day_rate numeric,
  default_ride_rate_regular numeric,
  default_ride_rate_special numeric,
  rate_source public.comp_rate_source NOT NULL DEFAULT 'company_default',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_comp_profiles_company ON public.compensation_profiles(company_id);
CREATE INDEX idx_comp_profiles_employee ON public.compensation_profiles(employee_id);
CREATE INDEX idx_comp_profiles_active ON public.compensation_profiles(company_id, is_active) WHERE is_active = true;

ALTER TABLE public.compensation_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_profiles_select" ON public.compensation_profiles FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "comp_profiles_insert" ON public.compensation_profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );

CREATE POLICY "comp_profiles_update" ON public.compensation_profiles FOR UPDATE TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );

CREATE POLICY "comp_profiles_delete" ON public.compensation_profiles FOR DELETE TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
  );

-- 3. compensation_change_log (immutable audit)
CREATE TABLE public.compensation_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  compensation_profile_id uuid REFERENCES public.compensation_profiles(id),
  action_type public.comp_action_type NOT NULL,
  changed_field text,
  old_value text,
  new_value text,
  old_payment_mode public.payment_mode_type,
  new_payment_mode public.payment_mode_type,
  effective_from_old date,
  effective_from_new date,
  reason text,
  source_type public.comp_source_type NOT NULL DEFAULT 'manual',
  source_file_name text,
  source_sheet_name text,
  source_row_number integer,
  import_batch_id uuid,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb
);

CREATE INDEX idx_comp_changelog_company ON public.compensation_change_log(company_id);
CREATE INDEX idx_comp_changelog_employee ON public.compensation_change_log(employee_id);
CREATE INDEX idx_comp_changelog_at ON public.compensation_change_log(changed_at DESC);

ALTER TABLE public.compensation_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_changelog_select" ON public.compensation_change_log FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "comp_changelog_insert" ON public.compensation_change_log FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );

-- 4. company_compensation_rules
CREATE TABLE public.company_compensation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_type public.comp_rule_type NOT NULL,
  rule_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  unit_type public.comp_unit_type NOT NULL DEFAULT 'hour',
  applies_to_role text,
  applies_to_job text,
  applies_to_location text,
  applies_to_employee uuid REFERENCES public.employees(id),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comp_rules_company ON public.company_compensation_rules(company_id);

ALTER TABLE public.company_compensation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_rules_select" ON public.company_compensation_rules FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "comp_rules_mutate" ON public.company_compensation_rules FOR ALL TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  )
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );

-- 5. payroll_import_batches
CREATE TABLE public.payroll_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  imported_by uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  warnings_count integer NOT NULL DEFAULT 0,
  errors_count integer NOT NULL DEFAULT 0,
  notes text
);

CREATE INDEX idx_import_batches_company ON public.payroll_import_batches(company_id);

ALTER TABLE public.payroll_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_select" ON public.payroll_import_batches FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "import_batches_insert" ON public.payroll_import_batches FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'import_payroll_compensation')
  );

CREATE POLICY "import_batches_update" ON public.payroll_import_batches FOR UPDATE TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'import_payroll_compensation')
  );

-- 6. payroll_interpreted_entries
CREATE TABLE public.payroll_interpreted_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES public.payroll_import_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id),
  raw_employee_name text,
  raw_total_amount numeric,
  interpreted_payment_type public.interpreted_payment_type NOT NULL DEFAULT 'unknown',
  detected_hourly_rate numeric,
  detected_daily_units numeric,
  detected_daily_full_days integer,
  detected_daily_half_days integer,
  detected_ride_type text,
  detected_ride_amount numeric,
  detected_manual_adjustment numeric,
  confidence_score integer,
  interpretation_notes text,
  suggested_compensation_change boolean NOT NULL DEFAULT false,
  approved_compensation_change boolean NOT NULL DEFAULT false,
  week_start date,
  week_end date,
  raw_row_payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interpreted_batch ON public.payroll_interpreted_entries(import_batch_id);
CREATE INDEX idx_interpreted_company ON public.payroll_interpreted_entries(company_id);

ALTER TABLE public.payroll_interpreted_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interpreted_select" ON public.payroll_interpreted_entries FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "interpreted_insert" ON public.payroll_interpreted_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'import_payroll_compensation')
  );

CREATE POLICY "interpreted_update" ON public.payroll_interpreted_entries FOR UPDATE TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'approve_compensation_changes')
  );

-- 7. payroll_rate_snapshots
CREATE TABLE public.payroll_rate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  source_record_type text NOT NULL,
  source_record_id uuid,
  payment_mode public.payment_mode_type,
  hourly_rate numeric,
  daily_rate numeric,
  half_day_rate numeric,
  ride_rate numeric,
  snapshot_reason text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_snapshots_company ON public.payroll_rate_snapshots(company_id);
CREATE INDEX idx_rate_snapshots_employee ON public.payroll_rate_snapshots(employee_id);

ALTER TABLE public.payroll_rate_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_snapshots_select" ON public.payroll_rate_snapshots FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "rate_snapshots_insert" ON public.payroll_rate_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );

-- 8. compensation_analysis_summary
CREATE TABLE public.compensation_analysis_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  first_seen_date date,
  first_known_hourly_rate numeric,
  current_known_hourly_rate numeric,
  hourly_rate_change_count integer NOT NULL DEFAULT 0,
  last_hourly_change_date date,
  daily_payment_detected boolean NOT NULL DEFAULT false,
  ride_payment_detected boolean NOT NULL DEFAULT false,
  manual_adjustment_detected boolean NOT NULL DEFAULT false,
  mixed_compensation_detected boolean NOT NULL DEFAULT false,
  notes text,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id)
);

CREATE INDEX idx_comp_analysis_company ON public.compensation_analysis_summary(company_id);

ALTER TABLE public.compensation_analysis_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_analysis_select" ON public.compensation_analysis_summary FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "comp_analysis_mutate" ON public.compensation_analysis_summary FOR ALL TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  )
  WITH CHECK (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation')
  );

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_comp_profiles BEFORE UPDATE ON public.compensation_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_comp_rules BEFORE UPDATE ON public.company_compensation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
