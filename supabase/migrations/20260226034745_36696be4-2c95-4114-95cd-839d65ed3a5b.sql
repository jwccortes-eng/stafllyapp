
-- Company-level settings for advanced configuration
CREATE TABLE public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE(company_id, key)
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage all company_settings"
  ON public.company_settings FOR ALL
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Admins can manage own company settings"
  ON public.company_settings FOR ALL
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers with config permission can view"
  ON public.company_settings FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_action_permission(auth.uid(), company_id, 'configurar_empresa')
  );

CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default settings for existing companies
INSERT INTO public.company_settings (company_id, key, value)
SELECT id, 'geofence', '{"radius_meters": 200, "enabled": true}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_id, key, value)
SELECT id, 'time_tolerance', '{"clock_in_minutes": 5, "clock_out_minutes": 5}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_id, key, value)
SELECT id, 'pay_week', '{"cut_day": "tuesday", "cut_time": "23:59"}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_id, key, value)
SELECT id, 'overtime', '{"weekly_threshold_hours": 40, "rate_multiplier": 1.5, "enabled": true}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_id, key, value)
SELECT id, 'auto_close', '{"enabled": false, "close_after_hours": 12}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_id, key, value)
SELECT id, 'auto_validation', '{"enabled": false, "validate_geofence": true, "validate_schedule": true}'::jsonb FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_id, key, value)
SELECT id, 'pay_types', '{"types": ["hourly", "salary"], "default": "hourly"}'::jsonb FROM companies
ON CONFLICT DO NOTHING;
