
-- Activity log for auditing all critical actions across the platform
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast queries
CREATE INDEX idx_activity_log_company ON public.activity_log(company_id, created_at DESC);
CREATE INDEX idx_activity_log_user ON public.activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Only owners can view all logs
CREATE POLICY "Owners can view all activity logs"
ON public.activity_log FOR SELECT
USING (public.is_global_owner(auth.uid()));

-- Admins can view their company logs
CREATE POLICY "Admins can view company activity logs"
ON public.activity_log FOR SELECT
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Anyone authenticated can insert (logging happens server-side)
CREATE POLICY "Authenticated users can insert logs"
ON public.activity_log FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Platform settings for global configuration
CREATE TABLE public.platform_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only owners can manage platform settings
CREATE POLICY "Owners can manage platform settings"
ON public.platform_settings FOR ALL
USING (public.is_global_owner(auth.uid()));

-- Insert default settings
INSERT INTO public.platform_settings (key, value) VALUES
  ('branding', '{"platform_name": "Stafly", "tagline": "Gestión de personal inteligente", "primary_color": "#6366f1"}'::jsonb),
  ('limits', '{"max_employees_per_company": 500, "max_companies": 50, "max_admins_per_company": 10}'::jsonb),
  ('features', '{"billing_enabled": false, "onboarding_wizard": true, "api_access": true}'::jsonb);

-- Helper function to log activity from client
CREATE OR REPLACE FUNCTION public.log_activity(
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _company_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _company_id, _action, _entity_type, _entity_id, _details);
END;
$$;
