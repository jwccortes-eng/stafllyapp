
-- ═══════════════════════════════════════════════════
-- DOMAIN D: REPUTATION ENGINE + DOMAIN E: WORKER PASSPORT
-- ═══════════════════════════════════════════════════

-- ─── Enums ───
CREATE TYPE reputation_source AS ENUM ('shift_review', 'marketplace_review', 'attendance', 'no_show', 'cancellation', 'completion_bonus', 'manual_adjustment');
CREATE TYPE passport_source   AS ENUM ('stafly_shift', 'marketplace_booking', 'imported_experience');

-- ═══════════════════════════════════════════════════
-- D1. rep_scores — Aggregated reputation per worker
-- ═══════════════════════════════════════════════════
CREATE TABLE rep_scores (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id         uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  overall_score             decimal(4,2) DEFAULT 0,
  punctuality_score         decimal(4,2),
  attendance_score          decimal(4,2),
  communication_score       decimal(4,2),
  service_score             decimal(4,2),
  presentation_score        decimal(4,2),
  quality_score             decimal(4,2),
  reliability_score         decimal(4,2),
  total_reviews_count       integer DEFAULT 0,
  total_completed_jobs      integer DEFAULT 0,
  total_completed_shifts    integer DEFAULT 0,
  total_hours_worked        decimal(10,2) DEFAULT 0,
  no_show_count             integer DEFAULT 0,
  cancellation_count        integer DEFAULT 0,
  score_version             integer DEFAULT 1,
  last_calculated_at        timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX idx_rep_worker  ON rep_scores (worker_profile_id);
CREATE INDEX idx_rep_overall ON rep_scores (overall_score DESC);

-- ═══════════════════════════════════════════════════
-- D2. rep_events — Individual reputation events
-- ═══════════════════════════════════════════════════
CREATE TABLE rep_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  source_type         reputation_source NOT NULL,
  source_id           uuid,
  event_weight        decimal(4,2),
  event_score         decimal(4,2),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_repe_worker ON rep_events (worker_profile_id);
CREATE INDEX idx_repe_source ON rep_events (source_type, source_id);
CREATE INDEX idx_repe_date   ON rep_events (created_at);

-- ═══════════════════════════════════════════════════
-- D3. rep_badges — Badge catalog
-- ═══════════════════════════════════════════════════
CREATE TABLE rep_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_code  text UNIQUE NOT NULL,
  badge_name  text NOT NULL,
  emoji       text,
  description text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- D4. rep_worker_badges — Badges earned by workers
-- ═══════════════════════════════════════════════════
CREATE TABLE rep_worker_badges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  reputation_badge_id uuid NOT NULL REFERENCES rep_badges(id) ON DELETE CASCADE,
  granted_at          timestamptz DEFAULT now(),
  expires_at          timestamptz,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (worker_profile_id, reputation_badge_id)
);

CREATE INDEX idx_rwb_worker ON rep_worker_badges (worker_profile_id);

-- ═══════════════════════════════════════════════════
-- E1. passport_profiles — Verified professional profile
-- ═══════════════════════════════════════════════════
CREATE TABLE passport_profiles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id           uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  passport_slug               text UNIQUE NOT NULL,
  display_name                text NOT NULL,
  primary_role                text,
  summary_text                text,
  total_verified_jobs         integer DEFAULT 0,
  total_verified_hours        decimal(10,2) DEFAULT 0,
  total_companies_worked      integer DEFAULT 0,
  total_marketplace_jobs      integer DEFAULT 0,
  overall_reputation_score    decimal(4,2),
  english_level               english_level_enum,
  passport_visibility         profile_visibility DEFAULT 'private',
  generated_at                timestamptz,
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX idx_pp_worker     ON passport_profiles (worker_profile_id);
CREATE INDEX idx_pp_visibility ON passport_profiles (passport_visibility) WHERE passport_visibility != 'private';

-- ═══════════════════════════════════════════════════
-- E2. passport_work_history
-- ═══════════════════════════════════════════════════
CREATE TABLE passport_work_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id         uuid NOT NULL REFERENCES passport_profiles(id) ON DELETE CASCADE,
  source_type         passport_source NOT NULL,
  source_id           uuid,
  company_name        text NOT NULL,
  role_name           text,
  date_start          date,
  date_end            date,
  total_hours         decimal(8,2),
  is_verified         boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_pwh_passport ON passport_work_history (passport_id);
CREATE INDEX idx_pwh_source   ON passport_work_history (source_type, source_id);

-- ═══════════════════════════════════════════════════
-- E3. passport_metrics
-- ═══════════════════════════════════════════════════
CREATE TABLE passport_metrics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id           uuid NOT NULL REFERENCES passport_profiles(id) ON DELETE CASCADE,
  metric_code           text NOT NULL,
  metric_label          text NOT NULL,
  metric_value          text NOT NULL,
  metric_display_order  integer DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_pm_passport ON passport_metrics (passport_id);

-- ═══════════════════════════════════════════════════
-- E4. passport_publications — What to show publicly
-- ═══════════════════════════════════════════════════
CREATE TABLE passport_publications (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id               uuid NOT NULL REFERENCES passport_profiles(id) ON DELETE CASCADE UNIQUE,
  publish_photo             boolean DEFAULT true,
  publish_reputation        boolean DEFAULT true,
  publish_work_history      boolean DEFAULT false,
  publish_skills            boolean DEFAULT true,
  publish_languages         boolean DEFAULT true,
  publish_city              boolean DEFAULT true,
  publish_hours             boolean DEFAULT true,
  publish_companies_count   boolean DEFAULT true,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════

-- rep_scores
ALTER TABLE rep_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own rep" ON rep_scores
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage rep" ON rep_scores
  FOR ALL TO authenticated
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

CREATE POLICY "Public profiles rep readable" ON rep_scores
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE is_profile_public = true AND deleted_at IS NULL));

-- rep_events
ALTER TABLE rep_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own events" ON rep_events
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage events" ON rep_events
  FOR ALL TO authenticated
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

-- rep_badges (catalog — read by all authenticated)
ALTER TABLE rep_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All can read badges" ON rep_badges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage badges" ON rep_badges
  FOR ALL TO authenticated
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

-- rep_worker_badges
ALTER TABLE rep_worker_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own badges" ON rep_worker_badges
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Public worker badges readable" ON rep_worker_badges
  FOR SELECT TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE is_profile_public = true AND deleted_at IS NULL));

CREATE POLICY "Admins manage worker badges" ON rep_worker_badges
  FOR ALL TO authenticated
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

-- passport_profiles
ALTER TABLE passport_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own passport" ON passport_profiles
  FOR ALL TO authenticated
  USING (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can read all passports" ON passport_profiles
  FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Public passports readable" ON passport_profiles
  FOR SELECT TO authenticated
  USING (passport_visibility != 'private');

-- passport_work_history
ALTER TABLE passport_work_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own history" ON passport_work_history
  FOR ALL TO authenticated
  USING (passport_id IN (SELECT id FROM passport_profiles WHERE worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid())))
  WITH CHECK (passport_id IN (SELECT id FROM passport_profiles WHERE worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid())));

CREATE POLICY "Public passport history readable" ON passport_work_history
  FOR SELECT TO authenticated
  USING (passport_id IN (SELECT id FROM passport_profiles WHERE passport_visibility != 'private'));

CREATE POLICY "Admins can read all history" ON passport_work_history
  FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()));

-- passport_metrics
ALTER TABLE passport_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own metrics" ON passport_metrics
  FOR ALL TO authenticated
  USING (passport_id IN (SELECT id FROM passport_profiles WHERE worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid())))
  WITH CHECK (passport_id IN (SELECT id FROM passport_profiles WHERE worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid())));

CREATE POLICY "Public passport metrics readable" ON passport_metrics
  FOR SELECT TO authenticated
  USING (passport_id IN (SELECT id FROM passport_profiles WHERE passport_visibility != 'private'));

-- passport_publications
ALTER TABLE passport_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own publications" ON passport_publications
  FOR ALL TO authenticated
  USING (passport_id IN (SELECT id FROM passport_profiles WHERE worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid())))
  WITH CHECK (passport_id IN (SELECT id FROM passport_profiles WHERE worker_profile_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid())));

CREATE POLICY "Admins can read publications" ON passport_publications
  FOR SELECT TO authenticated
  USING (public.is_global_owner(auth.uid()));

-- ─── Updated_at triggers ───
CREATE TRIGGER trg_rep_scores_updated_at BEFORE UPDATE ON rep_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_passport_profiles_updated_at BEFORE UPDATE ON passport_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_passport_publications_updated_at BEFORE UPDATE ON passport_publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
