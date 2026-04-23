-- Tipos enum para visitas
CREATE TYPE public.office_visit_type AS ENUM (
  'pickup_check',
  'update_data',
  'submit_documents',
  'fix_documents',
  'portal_help',
  'payment_support',
  'onboarding',
  'general_inquiry',
  'other'
);

CREATE TYPE public.office_visit_status AS ENUM (
  'in_progress',
  'resolved',
  'pending_followup',
  'requires_admin_review',
  'cancelled'
);

CREATE TYPE public.office_visit_rating AS ENUM (
  'excellent',
  'good',
  'regular',
  'bad'
);

-- Tabla principal de visitas
CREATE TABLE public.office_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Check-in/out
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Visita
  visit_type public.office_visit_type NOT NULL DEFAULT 'general_inquiry',
  visit_detail TEXT,
  status public.office_visit_status NOT NULL DEFAULT 'in_progress',
  
  -- Atención
  attended_by UUID REFERENCES auth.users(id),
  attendant_name TEXT,
  
  -- Snapshot de pendientes detectados al inicio
  pending_items JSONB DEFAULT '[]'::jsonb,
  pending_count INTEGER DEFAULT 0,
  
  -- Cambios realizados durante la visita
  updates_made JSONB DEFAULT '[]'::jsonb,
  photo_taken BOOLEAN NOT NULL DEFAULT false,
  documents_uploaded INTEGER NOT NULL DEFAULT 0,
  
  -- Rating
  rating public.office_visit_rating,
  rating_score INTEGER CHECK (rating_score BETWEEN 1 AND 5),
  rating_comment TEXT,
  rating_submitted_at TIMESTAMPTZ,
  
  -- Contexto
  language TEXT NOT NULL DEFAULT 'es',
  device_id UUID,
  channel TEXT NOT NULL DEFAULT 'front_desk_kiosk',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla de dispositivos
CREATE TABLE public.front_desk_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.office_visits 
  ADD CONSTRAINT office_visits_device_fk 
  FOREIGN KEY (device_id) REFERENCES public.front_desk_devices(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX idx_office_visits_company_date ON public.office_visits(company_id, checked_in_at DESC);
CREATE INDEX idx_office_visits_employee ON public.office_visits(employee_id, checked_in_at DESC);
CREATE INDEX idx_office_visits_status ON public.office_visits(company_id, status) WHERE status IN ('pending_followup', 'requires_admin_review');
CREATE INDEX idx_office_visits_type ON public.office_visits(company_id, visit_type, checked_in_at DESC);
CREATE INDEX idx_office_visits_rating ON public.office_visits(company_id, rating) WHERE rating IS NOT NULL;
CREATE INDEX idx_front_desk_devices_company ON public.front_desk_devices(company_id) WHERE is_active = true;

-- Trigger updated_at
CREATE TRIGGER trg_office_visits_updated
  BEFORE UPDATE ON public.office_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_front_desk_devices_updated
  BEFORE UPDATE ON public.front_desk_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.office_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.front_desk_devices ENABLE ROW LEVEL SECURITY;

-- Admins/supervisores ven visitas de su empresa
CREATE POLICY "Company admins can view office visits"
  ON public.office_visits FOR SELECT
  USING (
    public.user_is_company_admin(auth.uid(), company_id)
    OR public.has_company_role(auth.uid(), company_id, 'supervisor')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  );

-- Admins pueden actualizar (cerrar follow-ups, etc)
CREATE POLICY "Company admins can update office visits"
  ON public.office_visits FOR UPDATE
  USING (public.user_is_company_admin(auth.uid(), company_id));

-- Empleado ve sus propias visitas
CREATE POLICY "Employees can view their own visits"
  ON public.office_visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = office_visits.employee_id AND e.user_id = auth.uid()
    )
  );

-- Devices: solo admins
CREATE POLICY "Company admins manage front desk devices"
  ON public.front_desk_devices FOR ALL
  USING (public.user_is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.user_is_company_admin(auth.uid(), company_id));

-- Vista materializada para dashboard diario
CREATE OR REPLACE VIEW public.office_visits_daily_summary AS
SELECT
  company_id,
  date_trunc('day', checked_in_at)::date AS visit_date,
  COUNT(*) AS total_visits,
  COUNT(DISTINCT employee_id) AS unique_employees,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
  COUNT(*) FILTER (WHERE status = 'pending_followup') AS pending_followup_count,
  COUNT(*) FILTER (WHERE rating IS NOT NULL) AS rated_count,
  ROUND(AVG(rating_score)::numeric, 2) AS avg_rating,
  COUNT(*) FILTER (WHERE rating IN ('regular','bad')) AS low_rating_count,
  AVG(duration_seconds) AS avg_duration_seconds
FROM public.office_visits
GROUP BY company_id, date_trunc('day', checked_in_at);

GRANT SELECT ON public.office_visits_daily_summary TO authenticated;