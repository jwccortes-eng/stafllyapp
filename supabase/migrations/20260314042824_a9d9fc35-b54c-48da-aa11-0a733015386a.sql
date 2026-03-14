
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (
      role = _role 
      OR role = 'developer'
      OR (role = 'owner' AND _role IN ('admin', 'manager', 'supervisor', 'employee'))
      OR (role = 'admin' AND _role IN ('manager', 'supervisor', 'employee'))
      OR (role = 'manager' AND _role IN ('supervisor', 'employee'))
      OR (role = 'supervisor' AND _role = 'employee')
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'developer') THEN true
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner') THEN true
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN true
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('manager', 'supervisor')) THEN
        EXISTS (
          SELECT 1 FROM public.module_permissions
          WHERE user_id = _user_id AND module = _module AND (
            (_permission = 'view' AND can_view) OR
            (_permission = 'edit' AND can_edit) OR
            (_permission = 'delete' AND can_delete)
          )
        )
      ELSE false
    END
$$;

CREATE OR REPLACE FUNCTION public.has_action_permission(_user_id uuid, _company_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('developer', 'owner', 'admin')) THEN true
      WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('manager', 'supervisor')) THEN
        COALESCE(
          (SELECT granted FROM action_permissions 
           WHERE user_id = _user_id AND company_id = _company_id AND action = _action),
          false
        )
      ELSE false
    END
$$;
