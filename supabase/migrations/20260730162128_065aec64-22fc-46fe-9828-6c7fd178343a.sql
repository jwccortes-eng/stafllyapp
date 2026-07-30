-- ============================================================
-- Change Intelligence F1.2 — Durable Shadow Observation
-- Evidence ledger. NOT a delivery queue.
-- No FKs to business tables, no triggers on business tables.
-- ============================================================

-- 1) Platform staff allowlist (who may READ evidence)
CREATE TABLE public.ci_platform_allowlist (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ci_platform_allowlist TO authenticated;
GRANT ALL ON public.ci_platform_allowlist TO service_role;
ALTER TABLE public.ci_platform_allowlist ENABLE ROW LEVEL SECURITY;

-- read predicate: platform role AND live allowlist row
CREATE OR REPLACE FUNCTION public.ci_can_read_observations(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id
         AND ur.role::text IN ('developer','owner','founder')
     )
     AND EXISTS (
       SELECT 1 FROM public.ci_platform_allowlist a
       WHERE a.user_id = _user_id
         AND a.enabled
         AND (a.expires_at IS NULL OR a.expires_at > now())
     );
$$;

CREATE POLICY "ci_platform_allowlist_select_staff"
  ON public.ci_platform_allowlist FOR SELECT TO authenticated
  USING (public.ci_can_read_observations(auth.uid()));

-- 2) Pilot allowlist (which companies are observed)
CREATE TABLE public.ci_pilot_allowlist (
  company_id uuid PRIMARY KEY,           -- intentionally NO FK (isolation)
  pilot_stage smallint NOT NULL DEFAULT 1 CHECK (pilot_stage IN (1,2,3)),
  environment text NOT NULL DEFAULT 'demo' CHECK (environment IN ('demo','staging','production')),
  enabled boolean NOT NULL DEFAULT true,
  enabled_by uuid,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  daily_limit integer NOT NULL DEFAULT 5000 CHECK (daily_limit > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ci_pilot_allowlist TO authenticated;
GRANT ALL ON public.ci_pilot_allowlist TO service_role;
ALTER TABLE public.ci_pilot_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_pilot_allowlist_select_staff"
  ON public.ci_pilot_allowlist FOR SELECT TO authenticated
  USING (public.ci_can_read_observations(auth.uid()));

-- 3) Observations (one row per engine evaluation)
CREATE TABLE public.ci_observations (
  observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  correlation_id text,
  company_id uuid NOT NULL,              -- intentionally NO FK (isolation + per-company delete)
  environment text NOT NULL CHECK (environment IN ('demo','staging','production')),
  pilot_stage smallint NOT NULL CHECK (pilot_stage IN (1,2,3)),
  domain text NOT NULL,
  aggregate_type text,
  aggregate_id uuid,
  change_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  engine_version text NOT NULL,
  adapter_version text NOT NULL DEFAULT 'unknown',
  impact_level smallint NOT NULL CHECK (impact_level BETWEEN 0 AND 3),
  delta_semantics text[] NOT NULL DEFAULT '{}',
  audience_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_role_types text[] NOT NULL DEFAULT '{}',
  unresolved_count integer NOT NULL DEFAULT 0,
  unreachable_count integer NOT NULL DEFAULT 0,
  deduplication_count integer NOT NULL DEFAULT 0,
  suppression_reasons text[] NOT NULL DEFAULT '{}',
  simulated_channel text NOT NULL DEFAULT 'none',
  acknowledgement_required text CHECK (acknowledgement_required IN ('none','light','probatory')),
  deadline_category text CHECK (deadline_category IN ('none','lt_2h','lt_12h','lt_24h','gt_24h')),
  message_quality_gate text CHECK (message_quality_gate IN ('pass','fail')),
  message_quality_issues text[] NOT NULL DEFAULT '{}',
  privacy_gate text CHECK (privacy_gate IN ('pass','fail')),
  privacy_gate_findings text[] NOT NULL DEFAULT '{}',
  legacy_recipient_count integer NOT NULL DEFAULT 0,
  ci_recipient_count integer NOT NULL DEFAULT 0,
  unresolved_causes text[] NOT NULL DEFAULT '{}',
  location_ref text,
  client_ref text,
  observation_only boolean NOT NULL DEFAULT true CHECK (observation_only),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ci_observations_event_unique UNIQUE (event_id, engine_version)
);
CREATE INDEX ci_observations_company_observed_idx ON public.ci_observations (company_id, observed_at DESC);
CREATE INDEX ci_observations_change_type_idx ON public.ci_observations (change_type, observed_at DESC);
CREATE INDEX ci_observations_correlation_idx ON public.ci_observations (correlation_id);
CREATE INDEX ci_observations_unresolved_idx ON public.ci_observations (company_id) WHERE unresolved_count > 0;

GRANT SELECT ON public.ci_observations TO authenticated;
GRANT ALL ON public.ci_observations TO service_role;
ALTER TABLE public.ci_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_observations_select_staff"
  ON public.ci_observations FOR SELECT TO authenticated
  USING (public.ci_can_read_observations(auth.uid()));
-- No INSERT/UPDATE/DELETE policy for authenticated: writes are service_role only.

-- 4) Human reviews (append-only)
CREATE TABLE public.ci_observation_reviews (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.ci_observations(observation_id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL,
  verdict text NOT NULL CHECK (verdict IN (
    'correct','audience_excessive','audience_insufficient','message_unclear',
    'wrong_level','wrong_ack','wrong_deadline','wrong_reachability','needs_investigation'
  )),
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ci_observation_reviews_observation_idx ON public.ci_observation_reviews (observation_id);
GRANT SELECT, INSERT ON public.ci_observation_reviews TO authenticated;
GRANT ALL ON public.ci_observation_reviews TO service_role;
ALTER TABLE public.ci_observation_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_observation_reviews_select_staff"
  ON public.ci_observation_reviews FOR SELECT TO authenticated
  USING (public.ci_can_read_observations(auth.uid()));
CREATE POLICY "ci_observation_reviews_insert_staff"
  ON public.ci_observation_reviews FOR INSERT TO authenticated
  WITH CHECK (public.ci_can_read_observations(auth.uid()) AND reviewer_user_id = auth.uid());

-- 5) Daily aggregates (survive detail purge)
CREATE TABLE public.ci_observation_daily_metrics (
  company_id uuid NOT NULL,
  day date NOT NULL,
  environment text NOT NULL CHECK (environment IN ('demo','staging','production')),
  change_type text NOT NULL,
  evaluations integer NOT NULL DEFAULT 0,
  persisted integer NOT NULL DEFAULT 0,
  dropped_by_limit integer NOT NULL DEFAULT 0,
  dropped_by_sampling integer NOT NULL DEFAULT 0,
  level0 integer NOT NULL DEFAULT 0,
  level1 integer NOT NULL DEFAULT 0,
  level2 integer NOT NULL DEFAULT 0,
  level3 integer NOT NULL DEFAULT 0,
  unresolved_count integer NOT NULL DEFAULT 0,
  unreachable_count integer NOT NULL DEFAULT 0,
  deduplication_count integer NOT NULL DEFAULT 0,
  legacy_recipient_count integer NOT NULL DEFAULT 0,
  ci_recipient_count integer NOT NULL DEFAULT 0,
  message_quality_fail integer NOT NULL DEFAULT 0,
  privacy_gate_fail integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, day, environment, change_type)
);
GRANT SELECT ON public.ci_observation_daily_metrics TO authenticated;
GRANT ALL ON public.ci_observation_daily_metrics TO service_role;
ALTER TABLE public.ci_observation_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_daily_metrics_select_staff"
  ON public.ci_observation_daily_metrics FOR SELECT TO authenticated
  USING (public.ci_can_read_observations(auth.uid()));

-- 6) Retention / deletion (NOT a delivery cron)
CREATE OR REPLACE FUNCTION public.ci_purge_expired_observations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_detail integer;
  deleted_metrics integer;
BEGIN
  DELETE FROM public.ci_observations WHERE observed_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_detail = ROW_COUNT;
  DELETE FROM public.ci_observation_daily_metrics WHERE day < (current_date - 90);
  GET DIAGNOSTICS deleted_metrics = ROW_COUNT;
  RETURN jsonb_build_object('deleted_observations', deleted_detail, 'deleted_metrics', deleted_metrics);
END;
$$;
REVOKE ALL ON FUNCTION public.ci_purge_expired_observations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ci_purge_expired_observations() TO service_role;

CREATE OR REPLACE FUNCTION public.ci_delete_company_observations(_company_id uuid, _include_metrics boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_detail integer;
  deleted_metrics integer := 0;
BEGIN
  DELETE FROM public.ci_observations WHERE company_id = _company_id;
  GET DIAGNOSTICS deleted_detail = ROW_COUNT;
  IF _include_metrics THEN
    DELETE FROM public.ci_observation_daily_metrics WHERE company_id = _company_id;
    GET DIAGNOSTICS deleted_metrics = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('deleted_observations', deleted_detail, 'deleted_metrics', deleted_metrics);
END;
$$;
REVOKE ALL ON FUNCTION public.ci_delete_company_observations(uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ci_delete_company_observations(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.ci_can_read_observations(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ci_can_read_observations(uuid) TO authenticated, service_role;