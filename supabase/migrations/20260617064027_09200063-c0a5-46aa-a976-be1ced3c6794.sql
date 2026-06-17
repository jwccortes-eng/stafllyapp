-- E5.7A: Parceros consent adoption + enforcement-impact report (read-only view)
-- Per-company + global rollup of consent / visibility state for workers eligible for Parceros sync.
-- security_invoker=on  → caller's RLS on worker_profiles / worker_consent_records /
-- worker_visibility_settings / employees / companies applies. No PII columns exposed.

DROP VIEW IF EXISTS public.v_parceros_consent_adoption;

CREATE VIEW public.v_parceros_consent_adoption
WITH (security_invoker = on) AS
WITH latest_consent AS (
  SELECT DISTINCT ON (worker_profile_id)
    worker_profile_id,
    granted,
    revoked_at,
    granted_at
  FROM public.worker_consent_records
  WHERE consent_type = 'data_sharing'
  ORDER BY worker_profile_id, updated_at DESC, created_at DESC
),
base AS (
  SELECT
    wp.id              AS worker_profile_id,
    e.company_id       AS company_id,
    -- Consent status bucket (mirrors E5.6 decider semantics)
    CASE
      WHEN lc.worker_profile_id IS NULL                     THEN 'missing'
      WHEN lc.revoked_at IS NOT NULL                        THEN 'revoked'
      WHEN lc.granted IS TRUE                               THEN 'granted'
      WHEN lc.granted IS FALSE                              THEN 'denied'
      ELSE                                                       'error'
    END AS consent_bucket,
    -- Operational visibility reading: only 'public' is publishable in Parceros.
    -- 'private' and 'limited' are treated as "hidden" for impact analysis.
    -- (E5.6 decider currently only blocks on literal 'hidden'; documented limitation.)
    (COALESCE(wvs.profile_visibility::text, 'private') <> 'public') AS visibility_hidden_op
  FROM public.worker_profiles wp
  LEFT JOIN public.employees e
    ON e.id = wp.employee_id
  LEFT JOIN latest_consent lc
    ON lc.worker_profile_id = wp.id
  LEFT JOIN public.worker_visibility_settings wvs
    ON wvs.worker_profile_id = wp.id
  WHERE wp.deleted_at IS NULL
),
agg AS (
  SELECT
    company_id,
    COUNT(*)::int                                                                  AS eligible_workers,
    COUNT(*) FILTER (WHERE consent_bucket = 'granted')::int                        AS consent_granted,
    COUNT(*) FILTER (WHERE consent_bucket = 'missing')::int                        AS consent_missing,
    COUNT(*) FILTER (WHERE consent_bucket = 'revoked')::int                        AS consent_revoked,
    COUNT(*) FILTER (WHERE consent_bucket = 'denied')::int                         AS consent_denied,
    COUNT(*) FILTER (WHERE consent_bucket = 'error')::int                          AS consent_error,
    COUNT(*) FILTER (WHERE visibility_hidden_op)::int                              AS visibility_hidden,
    COUNT(*) FILTER (WHERE NOT visibility_hidden_op)::int                          AS visibility_public,
    COUNT(*) FILTER (WHERE consent_bucket <> 'granted' OR visibility_hidden_op)::int AS would_block_in_enforce,
    COUNT(*) FILTER (WHERE consent_bucket  = 'granted' AND NOT visibility_hidden_op)::int AS would_publish_if_enforce
  FROM base
  GROUP BY GROUPING SETS ((company_id), ())
)
SELECT
  agg.company_id,
  c.name      AS company_name,
  c.is_demo   AS is_demo,
  c.is_test   AS is_test,
  agg.eligible_workers,
  agg.consent_granted,
  agg.consent_missing,
  agg.consent_revoked,
  agg.consent_denied,
  agg.consent_error,
  agg.visibility_hidden,
  agg.visibility_public,
  agg.would_block_in_enforce,
  agg.would_publish_if_enforce,
  CASE WHEN agg.eligible_workers = 0 THEN 0::numeric
       ELSE ROUND((agg.consent_granted::numeric        / agg.eligible_workers) * 100, 2)
  END AS adoption_pct,
  CASE WHEN agg.eligible_workers = 0 THEN 0::numeric
       ELSE ROUND((agg.would_block_in_enforce::numeric / agg.eligible_workers) * 100, 2)
  END AS block_pct,
  now() AS snapshot_at
FROM agg
LEFT JOIN public.companies c ON c.id = agg.company_id;

GRANT SELECT ON public.v_parceros_consent_adoption TO authenticated;

COMMENT ON VIEW public.v_parceros_consent_adoption IS
  'E5.7A — Parceros consent adoption + enforcement-impact rollup. Read-only, security_invoker, no PII. One row per company plus a global rollup (company_id IS NULL).';