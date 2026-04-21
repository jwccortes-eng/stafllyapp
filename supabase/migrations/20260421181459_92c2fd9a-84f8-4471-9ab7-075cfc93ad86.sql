-- =========================================================
-- LOCATION INTELLIGENCE — FOUNDATION (Phase 1)
-- =========================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.location_type_enum AS ENUM (
    'billing', 'operational', 'meeting_point', 'job_site', 'company_site', 'customer_site'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.location_subject_type_enum AS ENUM (
    'employee', 'shift', 'applicant', 'provider', 'kiosk_device'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.location_context_type_enum AS ENUM (
    'shift', 'job', 'route', 'general'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.location_event_type_enum AS ENUM (
    'tracking_started',
    'tracking_stopped',
    'entered_geofence',
    'exited_geofence',
    'arrived_meeting_point',
    'arrived_job_site',
    'stale_location',
    'manual_checkpoint'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.location_session_status_enum AS ENUM (
    'active', 'stopped', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- 1. locations_v2 — shared structured locations
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_type public.location_type_enum NOT NULL DEFAULT 'operational',

  -- Display
  name TEXT,
  formatted_address TEXT,

  -- Structured address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,

  -- Geocoding
  place_id TEXT,            -- Mapbox / Google Place ID
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timezone TEXT,            -- IANA tz, e.g. America/New_York

  -- Operational notes
  access_notes TEXT,
  arrival_notes TEXT,
  parking_notes TEXT,
  contact_on_site TEXT,

  -- Geofence (meters). NULL = no enforcement
  geofence_radius_meters INT,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_v2_company ON public.locations_v2(company_id);
CREATE INDEX IF NOT EXISTS idx_locations_v2_type ON public.locations_v2(company_id, location_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_locations_v2_place ON public.locations_v2(place_id) WHERE place_id IS NOT NULL;

CREATE TRIGGER trg_locations_v2_updated_at
  BEFORE UPDATE ON public.locations_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 2. location_sessions — tracking windows
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_type public.location_subject_type_enum NOT NULL,
  subject_id UUID NOT NULL,

  context_type public.location_context_type_enum NOT NULL DEFAULT 'general',
  context_id UUID,                -- e.g. shift_id

  status public.location_session_status_enum NOT NULL DEFAULT 'active',
  source TEXT,                    -- 'mobile_app','portal','admin_kiosk',...
  device TEXT,

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_sessions_subject
  ON public.location_sessions(subject_type, subject_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_location_sessions_company
  ON public.location_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_location_sessions_context
  ON public.location_sessions(context_type, context_id);

-- Auto-stop previous active session when a new one starts for same subject+context
CREATE OR REPLACE FUNCTION public.auto_stop_prior_location_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.location_sessions
       SET status = 'stopped', stopped_at = now()
     WHERE subject_type = NEW.subject_type
       AND subject_id = NEW.subject_id
       AND COALESCE(context_id::text,'') = COALESCE(NEW.context_id::text,'')
       AND id <> NEW.id
       AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_stop_prior_sessions
  AFTER INSERT ON public.location_sessions
  FOR EACH ROW EXECUTE FUNCTION public.auto_stop_prior_location_sessions();

-- ---------------------------------------------------------
-- 3. location_presence — latest position per subject
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_type public.location_subject_type_enum NOT NULL,
  subject_id UUID NOT NULL,

  context_type public.location_context_type_enum,
  context_id UUID,
  session_id UUID REFERENCES public.location_sessions(id) ON DELETE SET NULL,

  current_lat DOUBLE PRECISION NOT NULL,
  current_lng DOUBLE PRECISION NOT NULL,
  accuracy_meters DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  heading DOUBLE PRECISION,

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_location_presence_company
  ON public.location_presence(company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_location_presence_context
  ON public.location_presence(context_type, context_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_location_presence_last_seen
  ON public.location_presence(last_seen_at DESC) WHERE is_active = true;

CREATE TRIGGER trg_location_presence_updated_at
  BEFORE UPDATE ON public.location_presence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 4. location_events — audit log
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.location_sessions(id) ON DELETE CASCADE,
  subject_type public.location_subject_type_enum NOT NULL,
  subject_id UUID NOT NULL,

  event_type public.location_event_type_enum NOT NULL,
  context_type public.location_context_type_enum,
  context_id UUID,

  location_v2_id UUID REFERENCES public.locations_v2(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_meters DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION,

  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_events_subject
  ON public.location_events(subject_type, subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_events_company
  ON public.location_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_events_session
  ON public.location_events(session_id);

-- ---------------------------------------------------------
-- 5. Foreign keys from existing tables (non-breaking)
-- ---------------------------------------------------------
ALTER TABLE public.billing_client_locations
  ADD COLUMN IF NOT EXISTS location_v2_id UUID REFERENCES public.locations_v2(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bcl_location_v2 ON public.billing_client_locations(location_v2_id);

ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS meeting_point_location_id UUID REFERENCES public.locations_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_site_location_id UUID REFERENCES public.locations_v2(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ss_meeting_loc ON public.scheduled_shifts(meeting_point_location_id);
CREATE INDEX IF NOT EXISTS idx_ss_jobsite_loc ON public.scheduled_shifts(job_site_location_id);

-- =========================================================
-- RLS — multi-tenant strict
-- =========================================================
ALTER TABLE public.locations_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_events ENABLE ROW LEVEL SECURITY;

-- locations_v2: company members read; admins write
CREATE POLICY "locations_v2 read by company members"
  ON public.locations_v2 FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

CREATE POLICY "locations_v2 insert by company admins"
  ON public.locations_v2 FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_is_company_admin(auth.uid(), company_id)
  );

CREATE POLICY "locations_v2 update by company admins"
  ON public.locations_v2 FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_is_company_admin(auth.uid(), company_id)
  );

CREATE POLICY "locations_v2 delete by company admins"
  ON public.locations_v2 FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_is_company_admin(auth.uid(), company_id)
  );

-- location_sessions
CREATE POLICY "location_sessions read by company"
  ON public.location_sessions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND company_id IN (SELECT public.user_company_ids(auth.uid())))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "location_sessions insert by company members"
  ON public.location_sessions FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND company_id IN (SELECT public.user_company_ids(auth.uid())))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "location_sessions update by company admins or self"
  ON public.location_sessions FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND public.user_is_company_admin(auth.uid(), company_id))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

-- location_presence
CREATE POLICY "location_presence read by company or self"
  ON public.location_presence FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND company_id IN (SELECT public.user_company_ids(auth.uid())))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "location_presence upsert by self or admin"
  ON public.location_presence FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND public.user_is_company_admin(auth.uid(), company_id))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "location_presence update by self or admin"
  ON public.location_presence FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND public.user_is_company_admin(auth.uid(), company_id))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

-- location_events
CREATE POLICY "location_events read by company or self"
  ON public.location_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND company_id IN (SELECT public.user_company_ids(auth.uid())))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "location_events insert by company member or self"
  ON public.location_events FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND company_id IN (SELECT public.user_company_ids(auth.uid())))
    OR (subject_type = 'employee' AND subject_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    ))
  );