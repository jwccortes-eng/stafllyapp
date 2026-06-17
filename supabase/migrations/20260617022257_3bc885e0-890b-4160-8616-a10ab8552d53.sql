-- =====================================================================
-- P0 #1 — PublicPassport safe RPC
-- Reviewable migration. Read line by line before approving.
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
  v_profile   public.worker_profiles%ROWTYPE;
  v_pub       public.passport_publications%ROWTYPE;
  v_vis       public.worker_visibility_settings%ROWTYPE;
  v_rep       public.rep_scores%ROWTYPE;
  v_skills    jsonb := '[]'::jsonb;
  v_langs     jsonb := '[]'::jsonb;
  v_history   jsonb := '[]'::jsonb;
  v_result    jsonb;
BEGIN
  -- 1) Resolve profile by slug. Must be public + not deleted.
  SELECT *
    INTO v_profile
  FROM public.worker_profiles
  WHERE public_slug = p_slug
    AND is_profile_public = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL; -- frontend renders 404
  END IF;

  -- 2) Load visibility + publication gates (may not exist → safe defaults: hide).
  SELECT * INTO v_pub
    FROM public.passport_publications
   WHERE passport_id = v_profile.id
   LIMIT 1;

  SELECT * INTO v_vis
    FROM public.worker_visibility_settings
   WHERE worker_profile_id = v_profile.id
   LIMIT 1;

  -- 3) Reputation snapshot (only if reputation is published + visible).
  IF COALESCE(v_pub.publish_reputation, false) AND COALESCE(v_vis.show_reputation, false) THEN
    SELECT * INTO v_rep
      FROM public.rep_scores
     WHERE worker_profile_id = v_profile.id
     ORDER BY last_calculated_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  -- 4) Skills from real tables (worker_profile_skills JOIN worker_skills).
  IF COALESCE(v_pub.publish_skills, false) AND COALESCE(v_vis.show_skills, false) THEN
    SELECT COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'name', ws.name,
                 'category', ws.category,
                 'proficiency', wps.proficiency_level,
                 'years_experience', wps.years_experience,
                 'is_primary', wps.is_primary
               )
               ORDER BY wps.is_primary DESC NULLS LAST, ws.name ASC
             ),
             '[]'::jsonb
           )
      INTO v_skills
      FROM public.worker_profile_skills wps
      JOIN public.worker_skills ws ON ws.id = wps.skill_id
     WHERE wps.worker_profile_id = v_profile.id
       AND ws.is_active = true;
  END IF;

  -- 5) Languages from worker_languages.
  IF COALESCE(v_pub.publish_languages, false) AND COALESCE(v_vis.show_skills, false) THEN
    -- Note: visibility re-uses show_skills (no dedicated show_languages flag in schema).
    SELECT COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'code', language_code,
                 'proficiency', proficiency_level
               )
               ORDER BY language_code ASC
             ),
             '[]'::jsonb
           )
      INTO v_langs
      FROM public.worker_languages
     WHERE worker_profile_id = v_profile.id;
  END IF;

  -- 6) Work history (only verified rows; never expose internal source_id/source_type).
  IF COALESCE(v_pub.publish_work_history, false) AND COALESCE(v_vis.show_work_history, false) THEN
    SELECT COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'company_name', company_name,
                 'role_name',    role_name,
                 'date_start',   date_start,
                 'date_end',     date_end,
                 'total_hours',  total_hours,
                 'is_verified',  is_verified
               )
               ORDER BY date_start DESC NULLS LAST
             ),
             '[]'::jsonb
           )
      INTO v_history
      FROM public.passport_work_history
     WHERE passport_id = v_profile.id
       AND is_verified = true;
  END IF;

  -- 7) Build controlled payload. NEVER include: phone, email, address,
  --    employee_id, company_id, user_id, payroll, time_entries, shifts,
  --    documents, SSN/EIN, PIN, internal IDs.
  v_result := jsonb_build_object(
    'slug',         v_profile.public_slug,
    'first_name',   CASE WHEN COALESCE(v_vis.show_first_name, false) THEN v_profile.first_name ELSE NULL END,
    'last_name',    CASE WHEN COALESCE(v_vis.show_last_name,  false) THEN v_profile.last_name  ELSE NULL END,
    'avatar_url',   CASE WHEN COALESCE(v_pub.publish_photo, false) AND COALESCE(v_vis.show_photo, false)
                         THEN v_profile.avatar_url ELSE NULL END,
    'headline',     v_profile.headline,
    'bio',          v_profile.bio,
    'city',         CASE WHEN COALESCE(v_pub.publish_city, false) AND COALESCE(v_vis.show_city, false)
                         THEN v_profile.city ELSE NULL END,
    'state',        CASE WHEN COALESCE(v_pub.publish_city, false) AND COALESCE(v_vis.show_city, false)
                         THEN v_profile.state ELSE NULL END,
    'country',      CASE WHEN COALESCE(v_pub.publish_city, false) AND COALESCE(v_vis.show_city, false)
                         THEN v_profile.country ELSE NULL END,
    'english_level',     v_profile.english_level,
    'years_of_experience', CASE WHEN COALESCE(v_vis.show_experience, false)
                               THEN v_profile.years_of_experience ELSE NULL END,
    'verification_status', v_profile.verification_status,
    'reputation', CASE
       WHEN v_rep.id IS NULL THEN NULL
       ELSE jsonb_build_object(
         'overall_score',         v_rep.overall_score,
         'punctuality_score',     v_rep.punctuality_score,
         'attendance_score',      v_rep.attendance_score,
         'communication_score',   v_rep.communication_score,
         'service_score',         v_rep.service_score,
         'presentation_score',    v_rep.presentation_score,
         'quality_score',         v_rep.quality_score,
         'reliability_score',     v_rep.reliability_score,
         'total_reviews_count',   v_rep.total_reviews_count,
         'total_completed_shifts',v_rep.total_completed_shifts,
         'total_hours_worked',    CASE WHEN COALESCE(v_pub.publish_hours, false)
                                       THEN v_rep.total_hours_worked ELSE NULL END,
         'last_calculated_at',    v_rep.last_calculated_at
       )
    END,
    'skills',       v_skills,
    'languages',    v_langs,
    'work_history', v_history
  );

  RETURN v_result;
END;
$$;

-- Grants: only on the RPC, NOT on any underlying table.
REVOKE ALL ON FUNCTION public.get_public_passport(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_passport(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_passport(text) IS
  'P0 #1 — Public passport RPC. SECURITY DEFINER with fixed search_path. Returns a controlled jsonb payload gated by passport_publications + worker_visibility_settings. Never exposes phone/email/address/employee_id/company_id/payroll/time_entries/shifts/documents.';
