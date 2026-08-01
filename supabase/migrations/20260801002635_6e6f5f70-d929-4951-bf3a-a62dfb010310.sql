CREATE TABLE public.operational_signal_shadow_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id text NOT NULL,
  correlation_id text,
  event_type text NOT NULL,
  source_system text NOT NULL DEFAULT 'app',
  shift_id uuid,
  actor_id uuid,
  subject_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notification_family text NOT NULL,
  priority text NOT NULL,
  recommended_channel text[] NOT NULL DEFAULT '{}',
  dedupe_key text NOT NULL,
  should_group boolean NOT NULL DEFAULT false,
  group_window_seconds integer NOT NULL DEFAULT 0,
  requires_acknowledgement boolean NOT NULL DEFAULT false,
  acknowledgement_deadline_seconds integer,
  urgency_reason text,
  suppress_reason text,
  recommended_send_time timestamptz,
  current_system_action text,
  actual_recipients_count integer NOT NULL DEFAULT 0,
  recommended_recipients_count integer NOT NULL DEFAULT 0,
  estimated_noise_reduction numeric NOT NULL DEFAULT 0,
  risk_detected text[] NOT NULL DEFAULT '{}',
  recommended_audience jsonb NOT NULL DEFAULT '[]'::jsonb,
  excluded_audience jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ossd_company_created ON public.operational_signal_shadow_decisions (company_id, created_at DESC);
CREATE INDEX idx_ossd_dedupe ON public.operational_signal_shadow_decisions (company_id, dedupe_key);
CREATE INDEX idx_ossd_family ON public.operational_signal_shadow_decisions (company_id, notification_family);

GRANT SELECT, INSERT ON public.operational_signal_shadow_decisions TO authenticated;
GRANT ALL ON public.operational_signal_shadow_decisions TO service_role;

ALTER TABLE public.operational_signal_shadow_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ossd_select_company_admins"
ON public.operational_signal_shadow_decisions
FOR SELECT
TO authenticated
USING (
  public.has_company_role(auth.uid(), company_id, 'admin'::text)
  OR public.is_company_owner(auth.uid(), company_id)
);

CREATE POLICY "ossd_insert_company_members"
ON public.operational_signal_shadow_decisions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = operational_signal_shadow_decisions.company_id
      AND cu.user_id = auth.uid()
  )
);