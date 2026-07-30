CREATE TABLE public.oai_platform_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reason text,
  UNIQUE (user_id)
);

GRANT SELECT ON public.oai_platform_allowlist TO authenticated;
GRANT ALL ON public.oai_platform_allowlist TO service_role;
ALTER TABLE public.oai_platform_allowlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oai_pilot_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'demo',
  window_starts_at timestamptz NOT NULL DEFAULT now(),
  window_ends_at timestamptz NOT NULL,
  daily_cap integer NOT NULL DEFAULT 2000,
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (company_id),
  CONSTRAINT oai_pilot_env_check CHECK (environment IN ('demo','staging')),
  CONSTRAINT oai_pilot_cap_check CHECK (daily_cap > 0 AND daily_cap <= 20000)
);

GRANT SELECT ON public.oai_pilot_allowlist TO authenticated;
GRANT ALL ON public.oai_pilot_allowlist TO service_role;
ALTER TABLE public.oai_pilot_allowlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oai_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  contract_version integer NOT NULL,
  engine_version text NOT NULL,
  rule_version text NOT NULL,
  observed_at timestamptz NOT NULL,
  evaluated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL,
  worker_ref text NOT NULL,
  shift_ref text,
  actor_ref text,
  client_ref text,
  location_ref text,
  source_surface text NOT NULL,
  trigger_type text NOT NULL,
  system_readiness_state text NOT NULL,
  system_block_reasons text[] NOT NULL DEFAULT '{}',
  legacy_mixed_signal_present boolean NOT NULL DEFAULT false,
  document_state_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_grade_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_available text[] NOT NULL DEFAULT '{}',
  context_missing text[] NOT NULL DEFAULT '{}',
  simulated_oai_outcome text NOT NULL,
  simulated_reason_codes text[] NOT NULL DEFAULT '{}',
  winning_requirement_source text NOT NULL DEFAULT 'none',
  unclassified_requirements text[] NOT NULL DEFAULT '{}',
  cascade_conflicts text[] NOT NULL DEFAULT '{}',
  human_action text NOT NULL,
  assignment_result text NOT NULL,
  contradiction_detected boolean NOT NULL DEFAULT false,
  authority_status text NOT NULL DEFAULT 'unresolved',
  eventual_outcome text NOT NULL DEFAULT 'unknown',
  navigation_count integer NOT NULL DEFAULT 0,
  context_loss_detected boolean NOT NULL DEFAULT false,
  persistence_issue_detected boolean NOT NULL DEFAULT false,
  latency_ms_from_block integer,
  observation_only boolean NOT NULL DEFAULT true,
  CONSTRAINT oai_observation_only_check CHECK (observation_only = true),
  CONSTRAINT oai_outcome_check CHECK (simulated_oai_outcome IN (
    'authorized','authorized_with_conditions','decision_required','not_authorized',
    'legally_prohibited','insufficient_evidence','expired_authorization','revoked','unknown'
  )),
  CONSTRAINT oai_readiness_check CHECK (system_readiness_state IN ('blocked','warned','clear','unknown')),
  CONSTRAINT oai_authority_check CHECK (authority_status IN ('explicit','unresolved','not_observable'))
);

CREATE INDEX oai_observations_company_observed_idx
  ON public.oai_observations (company_id, observed_at DESC);
CREATE INDEX oai_observations_correlation_idx
  ON public.oai_observations (correlation_id);

GRANT SELECT ON public.oai_observations TO authenticated;
GRANT ALL ON public.oai_observations TO service_role;
ALTER TABLE public.oai_observations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oai_persistence_probes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  company_id uuid NOT NULL,
  worker_ref text NOT NULL,
  requirement_code text NOT NULL,
  expected_state text NOT NULL,
  immediate_ui_state text NOT NULL,
  persisted_state text NOT NULL,
  reloaded_state text NOT NULL,
  mismatch_detected boolean NOT NULL,
  source_surface text NOT NULL,
  elapsed_ms integer NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  observation_only boolean NOT NULL DEFAULT true,
  CONSTRAINT oai_probe_observation_only_check CHECK (observation_only = true)
);

CREATE INDEX oai_persistence_probes_company_idx
  ON public.oai_persistence_probes (company_id, observed_at DESC);

GRANT SELECT ON public.oai_persistence_probes TO authenticated;
GRANT ALL ON public.oai_persistence_probes TO service_role;
ALTER TABLE public.oai_persistence_probes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oai_observation_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  window_day date NOT NULL,
  total_observations integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  warned_count integer NOT NULL DEFAULT 0,
  assigned_after_negative integer NOT NULL DEFAULT 0,
  contradictions integer NOT NULL DEFAULT 0,
  unclassified_requirements integer NOT NULL DEFAULT 0,
  authority_unresolved integer NOT NULL DEFAULT 0,
  context_losses integer NOT NULL DEFAULT 0,
  persistence_issues integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, window_day)
);

GRANT SELECT ON public.oai_observation_daily_metrics TO authenticated;
GRANT ALL ON public.oai_observation_daily_metrics TO service_role;
ALTER TABLE public.oai_observation_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.oai_can_read_observations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.oai_platform_allowlist a
    WHERE a.user_id = auth.uid()
      AND a.expires_at > now()
  )
$$;

CREATE POLICY "oai_observations_staff_read"
  ON public.oai_observations FOR SELECT TO authenticated
  USING (public.oai_can_read_observations());

CREATE POLICY "oai_probes_staff_read"
  ON public.oai_persistence_probes FOR SELECT TO authenticated
  USING (public.oai_can_read_observations());

CREATE POLICY "oai_daily_metrics_staff_read"
  ON public.oai_observation_daily_metrics FOR SELECT TO authenticated
  USING (public.oai_can_read_observations());

CREATE POLICY "oai_pilot_allowlist_staff_read"
  ON public.oai_pilot_allowlist FOR SELECT TO authenticated
  USING (
    public.oai_can_read_observations()
    OR public.is_global_owner(auth.uid())
    OR public.is_founder(auth.uid())
  );

CREATE POLICY "oai_platform_allowlist_staff_read"
  ON public.oai_platform_allowlist FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_global_owner(auth.uid())
    OR public.is_founder(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.oai_purge_expired_observations()
RETURNS TABLE (deleted_observations bigint, deleted_probes bigint, deleted_metrics bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d1 bigint;
  d2 bigint;
  d3 bigint;
BEGIN
  DELETE FROM public.oai_observations WHERE observed_at < now() - interval '30 days';
  GET DIAGNOSTICS d1 = ROW_COUNT;
  DELETE FROM public.oai_persistence_probes WHERE observed_at < now() - interval '30 days';
  GET DIAGNOSTICS d2 = ROW_COUNT;
  DELETE FROM public.oai_observation_daily_metrics WHERE window_day < (now() - interval '90 days')::date;
  GET DIAGNOSTICS d3 = ROW_COUNT;
  RETURN QUERY SELECT d1, d2, d3;
END;
$$;

CREATE OR REPLACE FUNCTION public.oai_delete_company_observations(_company_id uuid)
RETURNS TABLE (deleted_observations bigint, deleted_probes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d1 bigint;
  d2 bigint;
BEGIN
  DELETE FROM public.oai_observations WHERE company_id = _company_id;
  GET DIAGNOSTICS d1 = ROW_COUNT;
  DELETE FROM public.oai_persistence_probes WHERE company_id = _company_id;
  GET DIAGNOSTICS d2 = ROW_COUNT;
  RETURN QUERY SELECT d1, d2;
END;
$$;

REVOKE ALL ON FUNCTION public.oai_purge_expired_observations() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.oai_delete_company_observations(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oai_purge_expired_observations() TO service_role;
GRANT EXECUTE ON FUNCTION public.oai_delete_company_observations(uuid) TO service_role;