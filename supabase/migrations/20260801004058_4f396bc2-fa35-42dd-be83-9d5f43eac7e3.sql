CREATE TABLE public.operational_signal_shadow_config (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  persistence_enabled boolean NOT NULL DEFAULT false,
  sample_rate numeric NOT NULL DEFAULT 1.0 CHECK (sample_rate >= 0 AND sample_rate <= 1),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.operational_signal_shadow_config TO authenticated;
GRANT ALL ON public.operational_signal_shadow_config TO service_role;

ALTER TABLE public.operational_signal_shadow_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ossc_select_company_admins" ON public.operational_signal_shadow_config
FOR SELECT TO authenticated
USING (public.has_company_role(auth.uid(), company_id, 'admin') OR public.is_company_owner(auth.uid(), company_id));

CREATE POLICY "ossc_insert_company_admins" ON public.operational_signal_shadow_config
FOR INSERT TO authenticated
WITH CHECK (public.has_company_role(auth.uid(), company_id, 'admin') OR public.is_company_owner(auth.uid(), company_id));

CREATE POLICY "ossc_update_company_admins" ON public.operational_signal_shadow_config
FOR UPDATE TO authenticated
USING (public.has_company_role(auth.uid(), company_id, 'admin') OR public.is_company_owner(auth.uid(), company_id))
WITH CHECK (public.has_company_role(auth.uid(), company_id, 'admin') OR public.is_company_owner(auth.uid(), company_id));

CREATE TRIGGER trg_ossc_updated_at
BEFORE UPDATE ON public.operational_signal_shadow_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bitácora inmutable: sin políticas de UPDATE/DELETE y bloqueo explícito a nivel de trigger.
CREATE OR REPLACE FUNCTION public.ossd_block_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'operational_signal_shadow_decisions is append-only';
END;
$$;

CREATE TRIGGER trg_ossd_block_mutations
BEFORE UPDATE OR DELETE ON public.operational_signal_shadow_decisions
FOR EACH ROW EXECUTE FUNCTION public.ossd_block_mutations();