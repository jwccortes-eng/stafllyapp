
CREATE TABLE IF NOT EXISTS public.payroll_period_rate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  payroll_period_id uuid NOT NULL REFERENCES public.pay_periods(id) ON DELETE CASCADE,
  concept_id uuid,
  concept_name text,
  time_entry_ids uuid[] NOT NULL DEFAULT '{}',
  time_entry_count integer NOT NULL DEFAULT 0,
  hours_source text NOT NULL DEFAULT 'time_entries',
  total_hours numeric NOT NULL DEFAULT 0,
  regular_hours numeric NOT NULL DEFAULT 0,
  overtime_hours numeric NOT NULL DEFAULT 0,
  pay_rate numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  rate_source text NOT NULL,
  is_legacy_source boolean NOT NULL DEFAULT false,
  source_entity_id uuid,
  source_version text,
  effective_date date,
  effective_from date,
  effective_to date,
  rate_changed_mid_period boolean NOT NULL DEFAULT false,
  rate_by_work_date jsonb NOT NULL DEFAULT '[]'::jsonb,
  overtime_multiplier numeric NOT NULL DEFAULT 1.5,
  overtime_threshold_hours numeric NOT NULL DEFAULT 40,
  gross_base_amount numeric NOT NULL DEFAULT 0,
  period_status_at_resolution text,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  consolidation_version integer NOT NULL DEFAULT 1,
  audit_reference uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_period_rate_snapshots_unique_version
  ON public.payroll_period_rate_snapshots (payroll_period_id, employee_id, consolidation_version);
CREATE INDEX IF NOT EXISTS payroll_period_rate_snapshots_period_idx
  ON public.payroll_period_rate_snapshots (company_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS payroll_period_rate_snapshots_employee_idx
  ON public.payroll_period_rate_snapshots (company_id, employee_id, resolved_at DESC);

GRANT SELECT ON public.payroll_period_rate_snapshots TO authenticated;
GRANT ALL ON public.payroll_period_rate_snapshots TO service_role;

ALTER TABLE public.payroll_period_rate_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "period_rate_snapshots_select_admin"
  ON public.payroll_period_rate_snapshots FOR SELECT TO authenticated
  USING (
    public.is_global_owner(auth.uid())
    OR public.is_company_owner(auth.uid(), company_id)
    OR public.user_is_company_admin(auth.uid(), company_id)
    OR public.has_action_permission(auth.uid(), company_id, 'manage_compensation'::text)
  );

CREATE POLICY "period_rate_snapshots_select_self"
  ON public.payroll_period_rate_snapshots FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = payroll_period_rate_snapshots.employee_id
       AND e.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.payroll_rate_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'payroll_period_rate_snapshots is append-only: % is not allowed (period %, employee %)',
    TG_OP, COALESCE(OLD.payroll_period_id::text, '?'), COALESCE(OLD.employee_id::text, '?')
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS payroll_period_rate_snapshots_no_update ON public.payroll_period_rate_snapshots;
CREATE TRIGGER payroll_period_rate_snapshots_no_update
  BEFORE UPDATE OR DELETE ON public.payroll_period_rate_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.payroll_rate_snapshot_immutable();

CREATE OR REPLACE FUNCTION public.resolve_payroll_hourly_rate(_company_id uuid, _employee_id uuid, _period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _period RECORD;
  _hourly_concept_id uuid;
  _rate numeric;
  _source text;
  _source_id uuid;
  _eff_from date;
  _eff_to date;
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
    _eff_from := _period.start_date;
    _eff_to := _period.end_date;
  ELSE
    SELECT cer.rate, cer.id, cer.effective_from, cer.effective_to
      INTO _rate, _source_id, _eff_from, _eff_to
      FROM concept_employee_rates cer
     WHERE cer.employee_id = _employee_id AND cer.concept_id = _hourly_concept_id
       AND (cer.effective_from IS NULL OR cer.effective_from <= _period.end_date::date)
       AND (cer.effective_to IS NULL OR cer.effective_to >= _period.start_date::date)
     ORDER BY cer.effective_from DESC NULLS LAST LIMIT 1;
    IF _rate IS NOT NULL AND _rate > 0 THEN
      _source := 'concept_employee_rate';
    ELSE
      _source_id := NULL; _eff_from := NULL; _eff_to := NULL;
      SELECT c2.default_rate, c2.id INTO _rate, _source_id
        FROM concepts c2 WHERE c2.id = _hourly_concept_id AND c2.default_rate > 0;
      IF _rate IS NOT NULL AND _rate > 0 THEN
        _source := 'concept_default';
      ELSE
        _rate := NULL;
        _source_id := NULL;
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
    'concept_id', _hourly_concept_id,
    'source_entity_id', _source_id,
    'effective_from', _eff_from,
    'effective_to', _eff_to,
    'period_id', _period_id,
    'period_status', _period.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_payroll_hourly_rate_at(_company_id uuid, _employee_id uuid, _work_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _hourly_concept_id uuid;
  _rate numeric;
  _source text;
  _source_id uuid;
  _eff_from date;
  _eff_to date;
BEGIN
  SELECT id INTO _hourly_concept_id
    FROM concepts WHERE company_id = _company_id AND name = 'Hourly Rate' LIMIT 1;

  SELECT cer.rate, cer.id, cer.effective_from, cer.effective_to
    INTO _rate, _source_id, _eff_from, _eff_to
    FROM concept_employee_rates cer
   WHERE cer.employee_id = _employee_id AND cer.concept_id = _hourly_concept_id
     AND (cer.effective_from IS NULL OR cer.effective_from <= _work_date)
     AND (cer.effective_to IS NULL OR cer.effective_to >= _work_date)
   ORDER BY cer.effective_from DESC NULLS LAST LIMIT 1;

  IF _rate IS NOT NULL AND _rate > 0 THEN
    _source := 'concept_employee_rate';
  ELSE
    _source_id := NULL; _eff_from := NULL; _eff_to := NULL;
    SELECT c2.default_rate, c2.id INTO _rate, _source_id
      FROM concepts c2 WHERE c2.id = _hourly_concept_id AND c2.default_rate > 0;
    IF _rate IS NOT NULL AND _rate > 0 THEN
      _source := 'concept_default';
    ELSE
      _rate := NULL; _source_id := NULL; _source := 'none';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'rate', _rate,
    'source', _source,
    'work_date', _work_date,
    'source_entity_id', _source_id,
    'effective_from', _eff_from,
    'effective_to', _eff_to,
    'missing_rate', _rate IS NULL OR _rate <= 0
  );
END;
$function$;
