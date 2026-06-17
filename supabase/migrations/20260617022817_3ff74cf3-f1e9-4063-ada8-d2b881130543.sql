-- =====================================================================
-- P0 #1 v2 — PublicPassport safe RPC (passport_slug contract)
-- Rollback: DROP FUNCTION public.get_public_passport(text);
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_public_passport(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pass      public.passport_profiles%ROWTYPE;
  v_wp        public.worker_profiles%ROWTYPE;
  v_pub       public.passport_publications%ROWTYPE;
  v_vis       public.worker_visibility_settings%ROWTYPE;
  v_skills    jsonb := '[]'::jsonb;
  v_langs     jsonb := '[]'::jsonb;
  v_history   jsonb := '[]'::jsonb;
  v_metrics   jsonb := '[]'::jsonb;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN NULL;
  END IF;

  -- 1) Resolve passport by slug. Allow 'public' and 'limited' (link-only).
  --    Block 'private'. enum profile_visibility = {private, limited, public}.
  SELECT * INTO v_pass
    FROM public.passport_profiles
   WHERE passport_slug = p_slug
     AND passport_visibility IN ('public','limited')
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 2) Worker profile (must exist and not deleted).
  SELECT * INTO v_wp
    FROM public.worker_profiles
   WHERE id = v_pass.worker_profile_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 3) Visibility + publication gates. Missing rows => safe defaults (hide sensitive).
  SELECT * INTO v_pub FROM public.passport_publications
   WHERE passport_id = v_pass.id LIMIT 1;

  SELECT * INTO v_vis FROM public.worker_visibility_settings
   WHERE worker_profile_id = v_wp.id LIMIT 1;

  -- 4) Skills gated by publish_skills AND show_skills.
  IF COALESCE(v_pub.publish_skills, false) AND COALESCE(v_vis.show_skills, false) THEN
    SELECT COALESCE(
             jsonb_agg(ws.name ORDER BY wps.is_primary DESC NULLS LAST, ws.name ASC),
             '[]'::jsonb
           )
      INTO v_skills
      FROM public.worker_profile_skills wps
      JOIN public.worker_skills ws ON ws.id = wps.skill_id
     WHERE wps.worker_profile_id = v_wp.id
       AND ws.is_active = true;
  END IF;

  -- 5) Languages gated by publish_languages AND show_skills (no show_languages column — TECH DEBT).
  IF COALESCE(v_pub.publish_languages, false) AND COALESCE(v_vis.show_skills, false) THEN
    SELECT COALESCE(
             jsonb_agg(language_code ORDER BY language_code ASC),
             '[]'::jsonb
           )
      INTO v_langs
      FROM public.worker_languages
     WHERE worker_profile_id = v_wp.id;
  END IF;

  -- 6) Work history gated by publish_work_history AND show_work_history.
  IF COALESCE(v_pub.publish_work_history, false) AND COALESCE(v_vis.show_work_history, false) THEN
    SELECT COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'id',           id,
                 'company_name', company_name,
                 'role_name',    role_name,
                 'date_start',   date_start,
                 'date_end',     date_end,
                 'total_hours',  CASE WHEN COALESCE(v_pub.publish_hours, false)
                                      THEN total_hours ELSE NULL END,
                 'is_verified',  is_verified
               )
               ORDER BY date_start DESC NULLS LAST
             ),
             '[]'::jsonb
           )
      INTO v_history
      FROM public.passport_work_history
     WHERE passport_id = v_pass.id
       AND is_verified = true;
  END IF;

  -- 7) Metrics — filter by metric_code with per-metric gate.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'metric_code',  metric_code,
               'metric_label', metric_label,
               'metric_value', metric_value,
               'metric_display_order', metric_display_order
             )
             ORDER BY metric_display_order ASC NULLS LAST
           ),
           '[]'::jsonb
         )
    INTO v_metrics
    FROM public.passport_metrics
   WHERE passport_id = v_pass.id
     AND (
       (metric_code = 'rep_score'      AND COALESCE(v_pub.publish_reputation, false)      AND COALESCE(v_vis.show_reputation, false))
    OR (metric_code = 'total_hours'    AND COALESCE(v_pub.publish_hours, false))
    OR (metric_code = 'total_companies' AND COALESCE(v_pub.publish_companies_count, false))
    OR (metric_code NOT IN ('rep_score','total_hours','total_companies'))
     );

  -- 8) Build payload. Never expose PII / internal IDs / payroll / time / shifts / documents.
  RETURN jsonb_build_object(
    -- Identity (controlled)
    'slug',                v_pass.passport_slug,
    'display_name',        v_pass.display_name,
    'primary_role',        v_pass.primary_role,
    'summary_text',        v_pass.summary_text,
    'passport_visibility', v_pass.passport_visibility,
    'generated_at',        v_pass.generated_at,
    'english_level',       v_pass.english_level,

    -- Avatar gated.
    'avatar_url', CASE
      WHEN COALESCE(v_pub.publish_photo, false) AND COALESCE(v_vis.show_photo, false)
        THEN v_wp.avatar_url
      ELSE NULL
    END,

    -- City gated. Never state/country/zip/address.
    'city', CASE
      WHEN COALESCE(v_pub.publish_city, false) AND COALESCE(v_vis.show_city, false)
        THEN v_wp.city
      ELSE NULL
    END,

    -- Reputation summary gated.
    'overall_reputation_score', CASE
      WHEN COALESCE(v_pub.publish_reputation, false) AND COALESCE(v_vis.show_reputation, false)
        THEN v_pass.overall_reputation_score
      ELSE NULL
    END,
    'total_verified_jobs', CASE
      WHEN COALESCE(v_pub.publish_reputation, false) AND COALESCE(v_vis.show_reputation, false)
        THEN v_pass.total_verified_jobs
      ELSE NULL
    END,
    'total_verified_hours', CASE
      WHEN COALESCE(v_pub.publish_hours, false)
        THEN v_pass.total_verified_hours
      ELSE NULL
    END,
    'total_companies_worked', CASE
      WHEN COALESCE(v_pub.publish_companies_count, false)
        THEN v_pass.total_companies_worked
      ELSE NULL
    END,

    -- Collections (never null — frontend safety).
    'skills',       v_skills,
    'languages',    v_langs,
    'metrics',      v_metrics,
    'work_history', v_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_passport(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_passport(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_passport(text) IS
  'P0 #1 v2 — Public passport RPC. Resolves passport_profiles.passport_slug. SECURITY DEFINER + fixed search_path. Gated by passport_publications + worker_visibility_settings. Visibility allowlist: public, limited. Never exposes phone/email/address/employee_id/company_id/user_id/payroll/time_entries/shifts/documents/SSN/PIN. TECH DEBT: languages reuses show_skills until show_languages column exists.';
