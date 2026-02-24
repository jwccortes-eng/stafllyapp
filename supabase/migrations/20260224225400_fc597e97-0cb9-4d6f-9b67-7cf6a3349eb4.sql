
-- Create module permissions table for managers
CREATE TABLE public.module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

-- Enable RLS
ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

-- Owners can manage all permissions
CREATE POLICY "Owners can manage permissions"
ON public.module_permissions
FOR ALL
USING (public.has_role(auth.uid(), 'owner'));

-- Admins can view permissions
CREATE POLICY "Admins can view permissions"
ON public.module_permissions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view own permissions
CREATE POLICY "Users can view own permissions"
ON public.module_permissions
FOR SELECT
USING (auth.uid() = user_id);

-- Update has_role function to treat owner as having all admin permissions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (
      role = _role 
      OR (role = 'owner' AND _role = 'admin')
    )
  )
$$;

-- Create function to check module permission
CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner') THEN true
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN true
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'manager') THEN
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

-- Trigger for updated_at
CREATE TRIGGER update_module_permissions_updated_at
BEFORE UPDATE ON public.module_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update handle_new_user_role to set first user as owner
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;
  RETURN NEW;
END;
$$;
