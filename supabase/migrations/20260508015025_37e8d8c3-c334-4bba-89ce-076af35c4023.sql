ALTER TABLE public.kiosk_devices
  ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_kiosk_devices_identifier
  ON public.kiosk_devices (device_identifier);
