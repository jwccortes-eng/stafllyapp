
-- ============================================================
-- DOMAIN F: Availability & Map (service zones, schedule prefs)
-- DOMAIN G: Audit & Security (verification logs, consent, access)
-- ============================================================

-- ── Enum: service_zone_type ──
DO $$ BEGIN
  CREATE TYPE public.service_zone_type AS ENUM ('radius', 'polygon', 'city', 'county', 'state');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: consent_type ──
DO $$ BEGIN
  CREATE TYPE public.consent_type AS ENUM ('terms_of_service', 'privacy_policy', 'background_check', 'drug_test', 'gps_tracking', 'data_sharing', 'photo_release');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: verification_method ──
DO $$ BEGIN
  CREATE TYPE public.verification_method AS ENUM ('manual', 'ai', 'third_party', 'document_scan', 'reference_check');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════════════════════════════════════
-- DOMAIN F: Availability & Map
-- ══════════════════════════════════════════════

-- F1: Worker service zones (where they're willing to work)
CREATE TABLE IF NOT EXISTS public.worker_service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  zone_type service_zone_type NOT NULL DEFAULT 'radius',
  label TEXT,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km NUMERIC(6,2),
  polygon_geojson JSONB,
  city TEXT,
  county TEXT,
  state TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wsz_worker ON public.worker_service_zones(worker_profile_id);

-- F2: Worker schedule preferences
CREATE TABLE IF NOT EXISTS public.worker_schedule_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  preferred_weekdays INT[] DEFAULT '{}',
  blocked_weekdays INT[] DEFAULT '{}',
  preferred_shift_start TIME,
  preferred_shift_end TIME,
  max_hours_per_week NUMERIC(5,2),
  min_hours_per_week NUMERIC(5,2),
  overnight_ok BOOLEAN DEFAULT false,
  weekend_ok BOOLEAN DEFAULT true,
  holiday_ok BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_profile_id)
);

-- F3: Worker travel preferences
CREATE TABLE IF NOT EXISTS public.worker_travel_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  has_own_transport BOOLEAN DEFAULT false,
  transport_type TEXT, -- car, bike, public, rideshare
  max_commute_minutes INT,
  max_commute_km NUMERIC(6,2),
  willing_to_relocate BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_profile_id)
);

-- ══════════════════════════════════════════════
-- DOMAIN G: Audit & Security
-- ══════════════════════════════════════════════

-- G1: Profile verification log
CREATE TABLE IF NOT EXISTS public.profile_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  verified_by UUID REFERENCES auth.users(id),
  verification_method verification_method NOT NULL DEFAULT 'manual',
  verified_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  notes TEXT,
  evidence_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pvl_worker ON public.profile_verification_log(worker_profile_id);
CREATE INDEX idx_pvl_field ON public.profile_verification_log(field_name);

-- G2: Worker consent records
CREATE TABLE IF NOT EXISTS public.worker_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  consent_type consent_type NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  document_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wcr_worker ON public.worker_consent_records(worker_profile_id);
CREATE UNIQUE INDEX idx_wcr_unique ON public.worker_consent_records(worker_profile_id, consent_type) WHERE revoked_at IS NULL;

-- G3: Profile access log (who viewed a worker's public profile)
CREATE TABLE IF NOT EXISTS public.profile_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  accessed_by UUID REFERENCES auth.users(id),
  access_type TEXT NOT NULL DEFAULT 'view', -- view, download, share
  company_id UUID REFERENCES public.companies(id),
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pal_worker ON public.profile_access_log(worker_profile_id);
CREATE INDEX idx_pal_accessed_by ON public.profile_access_log(accessed_by);

-- G4: Data export requests (GDPR/CCPA compliance)
CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_profile_id UUID REFERENCES public.worker_profiles(id),
  request_type TEXT NOT NULL DEFAULT 'export', -- export, delete
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, rejected
  requested_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  download_url TEXT,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_der_user ON public.data_export_requests(user_id);

-- ══════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════

ALTER TABLE public.worker_service_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_schedule_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_travel_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

-- Owner policies (via worker_profiles.user_id)
CREATE POLICY "wsz_owner_all" ON public.worker_service_zones FOR ALL
  USING (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "wsp_owner_all" ON public.worker_schedule_preferences FOR ALL
  USING (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "wtp_owner_all" ON public.worker_travel_preferences FOR ALL
  USING (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "wcr_owner_all" ON public.worker_consent_records FOR ALL
  USING (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()))
  WITH CHECK (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "der_owner_all" ON public.data_export_requests FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin read policies
CREATE POLICY "wsz_admin_read" ON public.worker_service_zones FOR SELECT
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "wsp_admin_read" ON public.worker_schedule_preferences FOR SELECT
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "wtp_admin_read" ON public.worker_travel_preferences FOR SELECT
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "pvl_admin_all" ON public.profile_verification_log FOR ALL
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

CREATE POLICY "pvl_owner_read" ON public.profile_verification_log FOR SELECT
  USING (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "wcr_admin_read" ON public.worker_consent_records FOR SELECT
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "pal_admin_all" ON public.profile_access_log FOR ALL
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

CREATE POLICY "pal_owner_read" ON public.profile_access_log FOR SELECT
  USING (worker_profile_id IN (SELECT id FROM public.worker_profiles WHERE user_id = auth.uid()));

CREATE POLICY "der_admin_all" ON public.data_export_requests FOR ALL
  USING (public.is_global_owner(auth.uid()))
  WITH CHECK (public.is_global_owner(auth.uid()));

-- ══════════════════════════════════════════════
-- updated_at triggers
-- ══════════════════════════════════════════════

CREATE TRIGGER trg_wsz_updated_at BEFORE UPDATE ON public.worker_service_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_wsp_updated_at BEFORE UPDATE ON public.worker_schedule_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_wtp_updated_at BEFORE UPDATE ON public.worker_travel_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_wcr_updated_at BEFORE UPDATE ON public.worker_consent_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
