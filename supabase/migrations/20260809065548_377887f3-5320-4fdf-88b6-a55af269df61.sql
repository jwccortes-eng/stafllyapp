CREATE TABLE public.eldm_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  knowledge_kind text NOT NULL,
  domain text NOT NULL,
  verb text NOT NULL,
  scope_level text NOT NULL DEFAULT 'tenant',
  person_id uuid,
  venue_id uuid,
  client_id uuid,
  service_type text,
  subject_role text,
  occurred_at timestamptz NOT NULL,
  source_reference text NOT NULL,
  evidence_ref text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  superseded_by uuid REFERENCES public.eldm_signals(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  superseded_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX eldm_signals_source_identity_idx
  ON public.eldm_signals (company_id, source_reference);
CREATE INDEX eldm_signals_person_idx ON public.eldm_signals (company_id, person_id, occurred_at DESC);
CREATE INDEX eldm_signals_venue_idx ON public.eldm_signals (company_id, venue_id, occurred_at DESC);

ALTER TABLE public.eldm_signals
  ADD CONSTRAINT eldm_signals_kind_check
  CHECK (knowledge_kind IN ('fact','observation','inference','confirmed_preference','decision','outcome'));
ALTER TABLE public.eldm_signals
  ADD CONSTRAINT eldm_signals_scope_check
  CHECK (scope_level IN ('ecosystem','tenant','person','shared_reputation'));

GRANT SELECT, INSERT, UPDATE ON public.eldm_signals TO authenticated;
GRANT ALL ON public.eldm_signals TO service_role;

ALTER TABLE public.eldm_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eldm_signals_select_own_company"
  ON public.eldm_signals FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "eldm_signals_insert_own_company"
  ON public.eldm_signals FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "eldm_signals_update_own_company"
  ON public.eldm_signals FOR UPDATE TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
  WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));