
-- Create action permissions table for granular RBAC
CREATE TABLE public.action_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id, action)
);

-- Enable RLS
ALTER TABLE public.action_permissions ENABLE ROW LEVEL SECURITY;

-- Owners can manage all
CREATE POLICY "Owners can manage all action_permissions"
  ON public.action_permissions FOR ALL
  USING (public.is_global_owner(auth.uid()));

-- Admins can manage permissions for their companies
CREATE POLICY "Admins can manage company action_permissions"
  ON public.action_permissions FOR ALL
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Users can view own permissions
CREATE POLICY "Users can view own action_permissions"
  ON public.action_permissions FOR SELECT
  USING (auth.uid() = user_id);

-- Create security definer function to check action permissions
CREATE OR REPLACE FUNCTION public.has_action_permission(
  _user_id uuid,
  _company_id uuid,
  _action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      -- Owners and admins have all permissions
      WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('owner', 'admin')) THEN true
      -- Managers: check action_permissions table
      WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'manager') THEN
        COALESCE(
          (SELECT granted FROM action_permissions 
           WHERE user_id = _user_id AND company_id = _company_id AND action = _action),
          false
        )
      ELSE false
    END
$$;

-- Create role_templates table for preset permission groups
CREATE TABLE public.role_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  actions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage all role_templates"
  ON public.role_templates FOR ALL
  USING (public.is_global_owner(auth.uid()));

CREATE POLICY "Admins can manage company role_templates"
  ON public.role_templates FOR ALL
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers can view role_templates"
  ON public.role_templates FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
  );

-- Insert system templates
INSERT INTO public.role_templates (name, description, actions, is_system) VALUES
('Supervisor de Turnos', 'Gestión completa de turnos y asignaciones', 
 ARRAY['crear_turno','editar_turno','eliminar_turno','asignar_turno','cerrar_turno','reabrir_turno'], true),
('Supervisor de Reloj', 'Control de entradas/salidas y validación',
 ARRAY['editar_clock','aprobar_clock','cerrar_dia','reabrir_dia','alerta_no_clock','alerta_fuera_geofence'], true),
('Gestor de Nómina', 'Administración de nómina y exportaciones',
 ARRAY['crear_nomina','editar_nomina','aprobar_nomina','exportar_nomina','ver_salarios','ver_reportes'], true),
('Administrador de Empresa', 'Configuración y reportes generales',
 ARRAY['configurar_empresa','ver_reportes','ver_salarios','exportar_nomina'], true);

-- Add trigger for updated_at
CREATE TRIGGER update_action_permissions_updated_at
  BEFORE UPDATE ON public.action_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to apply a role template to a user
CREATE OR REPLACE FUNCTION public.apply_role_template(
  _user_id uuid,
  _company_id uuid,
  _template_id uuid,
  _replace boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actions text[];
  _action text;
BEGIN
  -- Get template actions
  SELECT actions INTO _actions FROM role_templates WHERE id = _template_id;
  
  IF _actions IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Optionally clear existing permissions
  IF _replace THEN
    DELETE FROM action_permissions WHERE user_id = _user_id AND company_id = _company_id;
  END IF;
  
  -- Insert permissions
  FOREACH _action IN ARRAY _actions LOOP
    INSERT INTO action_permissions (user_id, company_id, action, granted)
    VALUES (_user_id, _company_id, _action, true)
    ON CONFLICT (user_id, company_id, action) DO UPDATE SET granted = true, updated_at = now();
  END LOOP;
END;
$$;
