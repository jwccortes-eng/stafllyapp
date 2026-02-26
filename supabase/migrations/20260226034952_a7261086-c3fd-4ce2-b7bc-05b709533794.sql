
-- Automation rules per company
CREATE TABLE public.automation_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE(company_id, rule_key)
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage all automation_rules"
  ON public.automation_rules FOR ALL
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Admins can manage company automation_rules"
  ON public.automation_rules FOR ALL
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers with config can view automation_rules"
  ON public.automation_rules FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_action_permission(auth.uid(), company_id, 'configurar_empresa')
  );

CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Automation execution log
CREATE TABLE public.automation_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  details jsonb DEFAULT '{}'::jsonb,
  triggered_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view all automation_log"
  ON public.automation_log FOR ALL
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Admins can view company automation_log"
  ON public.automation_log FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Seed default rules for existing companies
INSERT INTO public.automation_rules (company_id, rule_key, enabled, config)
SELECT id, 'recordatorio_turno', false, '{"hours_before": 2, "channel": "push"}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.automation_rules (company_id, rule_key, enabled, config)
SELECT id, 'alerta_no_clock', false, '{"minutes_after": 15, "notify_admin": true}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.automation_rules (company_id, rule_key, enabled, config)
SELECT id, 'alerta_fuera_geofence', false, '{"notify_admin": true, "block_entry": false}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.automation_rules (company_id, rule_key, enabled, config)
SELECT id, 'auto_validacion_clock', false, '{"validate_geofence": true, "validate_schedule": true}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.automation_rules (company_id, rule_key, enabled, config)
SELECT id, 'auto_cierre_dia', false, '{"close_after_hours": 12}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.automation_rules (company_id, rule_key, enabled, config)
SELECT id, 'auto_generar_nomina', false, '{"generate_on_close": true}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.automation_rules (company_id, rule_key, enabled, config)
SELECT id, 'alerta_horas_exceso', false, '{"weekly_max_hours": 50, "notify_admin": true}'::jsonb FROM companies
ON CONFLICT DO NOTHING;
