ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS client_event_id text,
  ADD COLUMN IF NOT EXISTS captured_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_time_device timestamptz,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_delay_seconds integer,
  ADD COLUMN IF NOT EXISTS requires_time_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS time_review_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_client_event_id_key
  ON public.time_entries (client_event_id)
  WHERE client_event_id IS NOT NULL;

COMMENT ON COLUMN public.time_entries.client_event_id IS 'Idempotency key generated on the worker device for offline-first clock events. Never used in payroll math.';
COMMENT ON COLUMN public.time_entries.requires_time_review IS 'Marks suspicious device-clock drift on offline captures. Informational only; payroll keeps using clock_in/clock_out.';