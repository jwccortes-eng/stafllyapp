
-- ═══════════════════════════════════════════════════
-- DOMAIN A: SHARED CORE — Enums + Tables
-- ═══════════════════════════════════════════════════

-- ─── Enums ───
CREATE TYPE verification_status  AS ENUM ('unverified', 'pending', 'verified', 'rejected');
CREATE TYPE profile_visibility   AS ENUM ('private', 'limited', 'public');
CREATE TYPE english_level_enum   AS ENUM ('none', 'basic', 'intermediate', 'advanced', 'native');
CREATE TYPE document_type_enum   AS ENUM ('id_card', 'passport', 'driver_license', 'w9', 'certification', 'background_check', 'other');
CREATE TYPE proficiency_level    AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
CREATE TYPE experience_source    AS ENUM ('manual', 'stafly_import', 'marketplace_import', 'linkedin');

-- ─── A3. worker_profiles ───
CREATE TABLE worker_profiles (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id                     uuid REFERENCES employees(id) ON DELETE SET NULL,
  public_slug                     text UNIQUE,
  date_of_birth                   date,
  gender                          text,
  primary_phone                   text,
  emergency_contact_name          text,
  emergency_contact_phone         text,
  city                            text,
  state                           text,
  country                         text DEFAULT 'US',
  zip_code                        text,
  headline                        text,
  bio                             text,
  english_level                   english_level_enum,
  years_of_experience             integer,
  referred_by                     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  profile_completion_percent      integer DEFAULT 0,
  is_profile_public               boolean DEFAULT false,
  is_available_for_marketplace    boolean DEFAULT false,
  verification_status             verification_status DEFAULT 'unverified',
  created_at                      timestamptz DEFAULT now(),
  updated_at                      timestamptz DEFAULT now(),
  deleted_at                      timestamptz
);

CREATE UNIQUE INDEX idx_wp_user_id       ON worker_profiles (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_wp_employee_id   ON worker_profiles (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_wp_city_state           ON worker_profiles (city, state) WHERE deleted_at IS NULL;
CREATE INDEX idx_wp_public               ON worker_profiles (is_profile_public) WHERE is_profile_public = true;
CREATE INDEX idx_wp_marketplace          ON worker_profiles (is_available_for_marketplace) WHERE is_available_for_marketplace = true;
CREATE INDEX idx_wp_verification         ON worker_profiles (verification_status);

-- ─── A4. worker_skills (catalog) ───
CREATE TABLE worker_skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  category    text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_ws_category ON worker_skills (category) WHERE is_active = true;

-- ─── A5. worker_profile_skills ───
CREATE TABLE worker_profile_skills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  skill_id            uuid NOT NULL REFERENCES worker_skills(id) ON DELETE CASCADE,
  proficiency_level   proficiency_level,
  years_experience    integer,
  is_primary          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (worker_profile_id, skill_id)
);

CREATE INDEX idx_wps_profile ON worker_profile_skills (worker_profile_id);
CREATE INDEX idx_wps_skill   ON worker_profile_skills (skill_id);

-- ─── A6. worker_languages ───
CREATE TABLE worker_languages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  language_code       text NOT NULL,
  proficiency_level   proficiency_level NOT NULL,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (worker_profile_id, language_code)
);

-- ─── A7. worker_documents ───
CREATE TABLE worker_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id     uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  document_type         document_type_enum NOT NULL,
  file_url              text NOT NULL,
  file_name             text,
  verification_status   verification_status DEFAULT 'unverified',
  is_private            boolean DEFAULT true,
  expires_at            timestamptz,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_wd_profile ON worker_documents (worker_profile_id);
CREATE INDEX idx_wd_type    ON worker_documents (document_type);

-- ─── A8. worker_experience_records ───
CREATE TABLE worker_experience_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  title               text NOT NULL,
  company_name        text NOT NULL,
  description         text,
  start_date          date,
  end_date            date,
  is_current          boolean DEFAULT false,
  source_type         experience_source DEFAULT 'manual',
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_wer_profile ON worker_experience_records (worker_profile_id);

-- ─── A9. worker_visibility_settings ───
CREATE TABLE worker_visibility_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id           uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  show_photo                  boolean DEFAULT true,
  show_first_name             boolean DEFAULT true,
  show_last_name              boolean DEFAULT false,
  show_city                   boolean DEFAULT true,
  show_reputation             boolean DEFAULT true,
  show_experience             boolean DEFAULT true,
  show_skills                 boolean DEFAULT true,
  show_work_history           boolean DEFAULT false,
  show_approximate_location   boolean DEFAULT true,
  show_exact_location         boolean DEFAULT false,
  profile_visibility          profile_visibility DEFAULT 'private',
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

-- ─── RLS Policies ───
ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_profile_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_experience_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_visibility_settings ENABLE ROW LEVEL SECURITY;

-- worker_skills: readable by all authenticated
CREATE POLICY "Authenticated can read skills" ON worker_skills FOR SELECT TO authenticated USING (true);

-- worker_profiles: owner can CRUD, admins can read all, public profiles readable by all
CREATE POLICY "Owner can manage own profile" ON worker_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all profiles" ON worker_profiles
  FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Public profiles readable" ON worker_profiles
  FOR SELECT TO authenticated
  USING (is_profile_public = true AND deleted_at IS NULL);

-- worker_profile_skills: owner via profile
CREATE POLICY "Owner manages own skills" ON worker_profile_skills
  FOR ALL TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Public profile skills readable" ON worker_profile_skills
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE is_profile_public = true AND deleted_at IS NULL));

-- worker_languages: same pattern
CREATE POLICY "Owner manages own languages" ON worker_languages
  FOR ALL TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Public profile languages readable" ON worker_languages
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE is_profile_public = true AND deleted_at IS NULL));

-- worker_documents: owner only (private by default, never public)
CREATE POLICY "Owner manages own documents" ON worker_documents
  FOR ALL TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can read documents" ON worker_documents
  FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()));

-- worker_experience_records: owner + public profile readers
CREATE POLICY "Owner manages own experience" ON worker_experience_records
  FOR ALL TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Public profile experience readable" ON worker_experience_records
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE is_profile_public = true AND deleted_at IS NULL));

-- worker_visibility_settings: owner only
CREATE POLICY "Owner manages own visibility" ON worker_visibility_settings
  FOR ALL TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can read visibility" ON worker_visibility_settings
  FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()));

-- ─── Updated_at triggers ───
CREATE TRIGGER trg_worker_profiles_updated_at BEFORE UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_worker_skills_updated_at BEFORE UPDATE ON worker_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_worker_documents_updated_at BEFORE UPDATE ON worker_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_worker_visibility_updated_at BEFORE UPDATE ON worker_visibility_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
