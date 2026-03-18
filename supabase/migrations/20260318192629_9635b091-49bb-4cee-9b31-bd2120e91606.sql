
-- Function to check if user is company_owner for a specific company
CREATE OR REPLACE FUNCTION public.is_company_owner(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users 
    WHERE user_id = _user_id AND company_id = _company_id AND role = 'company_owner'
  )
$$;

-- Update has_action_permission to recognize company_owner
CREATE OR REPLACE FUNCTION public.has_action_permission(_user_id uuid, _company_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('developer', 'owner', 'admin')) THEN true
      WHEN public.is_company_owner(_user_id, _company_id) THEN true
      WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('manager', 'supervisor')) THEN
        COALESCE(
          (SELECT granted FROM action_permissions 
           WHERE user_id = _user_id AND company_id = _company_id AND action = _action),
          false
        )
      ELSE false
    END
$$;

-- Update has_company_role to recognize company_owner as having all sub-roles
CREATE OR REPLACE FUNCTION public.has_company_role(_user_id uuid, _company_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users 
    WHERE user_id = _user_id AND company_id = _company_id AND (
      role = _role
      OR role = 'company_owner'
    )
  ) OR public.is_global_owner(_user_id)
$$;

-- Update has_module_permission to recognize company_owner (via user having company_owner in ANY company they belong to)
CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('developer', 'owner', 'admin')) THEN true
      WHEN EXISTS (SELECT 1 FROM public.company_users WHERE user_id = _user_id AND role = 'company_owner') THEN true
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
