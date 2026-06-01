ALTER TABLE public.clock_alerts DROP CONSTRAINT IF EXISTS clock_alerts_type_check;

ALTER TABLE public.clock_alerts ADD CONSTRAINT clock_alerts_type_check
  CHECK (type = ANY (ARRAY[
    'OUTSIDE_GEOFENCE'::text,
    'DEVICE_DUPLICATION'::text,
    'GPS_LOW_ACCURACY'::text,
    'SUSPICIOUS_MOVEMENT'::text,
    'GPS_UNAVAILABLE'::text
  ]));