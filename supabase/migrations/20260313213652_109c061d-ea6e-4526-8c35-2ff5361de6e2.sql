
-- ============================================
-- FASE 1: clock_events table for GPS tracking
-- ============================================
CREATE TABLE public.clock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  time_entry_id UUID REFERENCES public.time_entries(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('clock_in', 'clock_out')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  address TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clock_events_employee ON public.clock_events(employee_id);
CREATE INDEX idx_clock_events_company ON public.clock_events(company_id);
CREATE INDEX idx_clock_events_shift ON public.clock_events(shift_id);
CREATE INDEX idx_clock_events_time_entry ON public.clock_events(time_entry_id);

ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;

-- Employees can see their own events
CREATE POLICY "Employees can view own clock events"
ON public.clock_events FOR SELECT TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR public.is_global_owner(auth.uid())
  OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.company_id = clock_events.company_id)
);

-- Employees can insert their own events
CREATE POLICY "Employees can insert own clock events"
ON public.clock_events FOR INSERT TO authenticated
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR public.is_global_owner(auth.uid())
);

-- ============================================
-- FASE 2: employee_location_history for route tracking
-- ============================================
CREATE TABLE public.employee_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_emp_loc_history_employee ON public.employee_location_history(employee_id);
CREATE INDEX idx_emp_loc_history_shift ON public.employee_location_history(shift_id);
CREATE INDEX idx_emp_loc_history_time ON public.employee_location_history(recorded_at);

ALTER TABLE public.employee_location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view location history"
ON public.employee_location_history FOR SELECT TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR public.is_global_owner(auth.uid())
  OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.company_id = employee_location_history.company_id)
);

CREATE POLICY "Employees can insert own location"
ON public.employee_location_history FOR INSERT TO authenticated
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- ============================================
-- FASE 3: clock_alerts for fraud detection
-- ============================================
CREATE TABLE public.clock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('OUTSIDE_GEOFENCE', 'DEVICE_DUPLICATION', 'GPS_LOW_ACCURACY', 'SUSPICIOUS_MOVEMENT')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clock_alerts_company ON public.clock_alerts(company_id);
CREATE INDEX idx_clock_alerts_employee ON public.clock_alerts(employee_id);

ALTER TABLE public.clock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view clock alerts"
ON public.clock_alerts FOR SELECT TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.company_id = clock_alerts.company_id)
);

CREATE POLICY "System can insert clock alerts"
ON public.clock_alerts FOR INSERT TO authenticated
WITH CHECK (
  public.is_global_owner(auth.uid())
  OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.company_id = clock_alerts.company_id)
  OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can update clock alerts"
ON public.clock_alerts FOR UPDATE TO authenticated
USING (
  public.is_global_owner(auth.uid())
  OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.company_id = clock_alerts.company_id AND cu.role IN ('admin', 'owner'))
);

-- Add geofence columns to locations if not exists
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS geofence_radius INTEGER DEFAULT 200;

-- Add geofence_policy to company_settings concept (no schema change needed, just config)
-- Enable realtime for clock_events and location history
ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_location_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_alerts;
