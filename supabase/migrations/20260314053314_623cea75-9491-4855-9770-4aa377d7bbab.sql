
-- Parceros event queue for outbound event dispatching
CREATE TABLE public.parceros_event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  worker_profile_id uuid NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for processing pending events
CREATE INDEX idx_parceros_event_queue_status ON public.parceros_event_queue(status, created_at);
CREATE INDEX idx_parceros_event_queue_worker ON public.parceros_event_queue(worker_profile_id);

-- RLS: only service-role access (no client access)
ALTER TABLE public.parceros_event_queue ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service-role can access (which is correct for internal queue)

COMMENT ON TABLE public.parceros_event_queue IS 'Outbound event queue for StaflyApps → Parceros integration. Only accessible via service-role.';
