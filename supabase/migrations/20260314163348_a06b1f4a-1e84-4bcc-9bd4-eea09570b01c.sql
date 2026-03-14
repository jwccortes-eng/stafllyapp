
-- 1. Create kiosk_devices table
CREATE TABLE public.kiosk_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_id uuid REFERENCES public.locations(id),
  device_identifier text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view kiosk devices for their companies"
  ON public.kiosk_devices FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins can manage kiosk devices"
  ON public.kiosk_devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Add columns to clock_events
ALTER TABLE public.clock_events ADD COLUMN IF NOT EXISTS clock_method text NOT NULL DEFAULT 'mobile';
ALTER TABLE public.clock_events ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.clock_events ADD COLUMN IF NOT EXISTS kiosk_device_id uuid REFERENCES public.kiosk_devices(id);

-- 3. Add clock_method to scheduled_shifts
ALTER TABLE public.scheduled_shifts ADD COLUMN IF NOT EXISTS clock_method text NOT NULL DEFAULT 'both';

-- 4. Create storage bucket for kiosk photos
INSERT INTO storage.buckets (id, name, public) VALUES ('kiosk-photos', 'kiosk-photos', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS for kiosk-photos
CREATE POLICY "Authenticated users can upload kiosk photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kiosk-photos');

CREATE POLICY "Admins can view kiosk photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kiosk-photos');
