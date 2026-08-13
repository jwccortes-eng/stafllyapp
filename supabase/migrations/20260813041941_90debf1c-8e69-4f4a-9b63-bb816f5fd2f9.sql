CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _company_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  _is_admin boolean;
  _is_platform boolean;
  _is_owner boolean;
  _saw boolean := false;
  _any_true boolean := false;
  _v boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO r FROM public.permission_catalog() c WHERE c.permission = _permission;
  IF NOT FOUND THEN RETURN false; END IF;

  _is_platform := public.is_global_owner(_user_id)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('developer','owner'));

  _is_owner := _company_id IS NOT NULL AND public.is_company_owner(_user_id, _company_id);

  _is_admin := _is_platform
    OR _is_owner
    OR (_company_id IS NOT NULL AND public.has_exact_company_role(_user_id, _company_id, 'admin'));

  -- users.manage / roles.manage / configuración pura: solo administración de compañía
  IF r.legacy_action IS NULL AND r.legacy_module IS NULL THEN
    RETURN _is_admin;
  END IF;

  IF _is_admin THEN
    -- Plataforma: nunca restringible por compañía
    IF _is_platform THEN RETURN true; END IF;

    -- Anti-lockout: el dueño conserva siempre sus permisos críticos
    IF _is_owner AND _permission IN ('users.manage','roles.manage','company.settings') THEN
      RETURN true;
    END IF;

    -- Override explícito en negativo restringe también a admin / owner
    IF r.legacy_action IS NOT NULL THEN
      SELECT granted INTO _v FROM public.action_permissions
        WHERE user_id=_user_id AND company_id=_company_id AND action=r.legacy_action LIMIT 1;
      IF FOUND THEN
        _saw := true;
        IF COALESCE(_v,false) THEN _any_true := true; END IF;
      END IF;
    END IF;

    IF r.legacy_module IS NOT NULL THEN
      SELECT CASE r.legacy_level
               WHEN 'view' THEN can_view
               WHEN 'edit' THEN can_edit
               ELSE can_delete
             END
        INTO _v
        FROM public.module_permissions
        WHERE user_id=_user_id AND company_id=_company_id AND module=r.legacy_module LIMIT 1;
      IF FOUND THEN
        _saw := true;
        IF COALESCE(_v,false) THEN _any_true := true; END IF;
      END IF;
    END IF;

    IF _saw AND NOT _any_true THEN RETURN false; END IF;
    RETURN true;
  END IF;

  IF r.legacy_action IS NOT NULL
     AND COALESCE((SELECT granted FROM public.action_permissions
                    WHERE user_id=_user_id AND company_id=_company_id AND action=r.legacy_action LIMIT 1), false) THEN
    RETURN true;
  END IF;

  IF r.legacy_module IS NOT NULL
     AND public.has_module_permission_in_company(_user_id,_company_id,r.legacy_module,r.legacy_level) THEN
    RETURN true;
  END IF;

  RETURN false;
END $function$;