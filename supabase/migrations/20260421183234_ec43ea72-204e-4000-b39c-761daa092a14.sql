-- =========================================================
-- LOCATION INTELLIGENCE — PHASE 2 (Realtime presence)
-- =========================================================

-- Ensure full row payloads on UPDATE so realtime listeners get
-- the new lat/lng/last_seen_at fields, not only changed columns.
ALTER TABLE public.location_presence REPLICA IDENTITY FULL;
ALTER TABLE public.location_events REPLICA IDENTITY FULL;
ALTER TABLE public.location_sessions REPLICA IDENTITY FULL;

-- Add to the supabase_realtime publication (idempotent via DO block)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.location_presence;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.location_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.location_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;