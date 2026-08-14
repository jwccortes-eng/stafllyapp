-- =====================================================================
-- P0 — AUTHORIZATION MODEL HARDENING
-- From "admin = full access + denylist" to "operating role allowlist".
-- Mirrors src/lib/auth/role-defaults.ts + permission-resolver.ts
-- =====================================================================

-- 1) Allowlist canónica por rol operativo -----------------------------
CREATE OR REPLACE FUNCTION public.operating_role_permissions()
RETURNS TABLE(role_key text, permission text)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT r.role_key, p.permission
  FROM (VALUES
    -- Shift Administrator
    ('shift_admin', ARRAY['service.view','service.create','service.edit','service.publish','service.cancel',
                          'staffing.view','staffing.assign','staffing.replace','staffing.remove',
                          'workers.view','clients.view','locations.view']),
    -- Time & Closeout Administrator
    ('time_closeout_admin', ARRAY['service.view','attendance.view','time_entries.view','time_entries.review',
                                  'time_entries.adjust','time_entries.approve','closeout.close_day',
                                  'closeout.reopen_day','service.close','service.reopen','workers.view']),
    -- Payroll Administrator (prepara, no aprueba)
    ('payroll_admin', ARRAY['payroll.view','payroll.manage','payroll.export','reports.view','workers.view']),
    -- Payroll Approver
    ('payroll_approver', ARRAY['payroll.view','payroll.approve','reports.view']),
    -- Service Supervisor (scope ASSIGNED_SERVICE lo aplica cada superficie)
    ('service_supervisor', ARRAY['service.view','staffing.view','attendance.view','time_entries.view',
                                 'time_entries.review','workers.view']),
    -- Worker: sin permisos administrativos
    ('worker', ARRAY[]::text[]),
    -- Membresía admin SIN operating_role_key: solo lectura operativa
    ('admin_unassigned', ARRAY['service.view','staffing.view','attendance.view','time_entries.view',
                               'workers.view','clients.view','locations.view','documents.view'])
  ) AS r(role_key, perms)
  CROSS JOIN LATERAL unnest(r.perms) AS p(permission);
$function$;

GRANT EXECUTE ON FUNCTION public.operating_role_permissions() TO authenticated, service_role;

-- 2) Rol operativo efectivo -------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_operating_role(_user_id uuid, _company_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _membership text; _explicit text;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN RETURN NULL; END IF;

  SELECT role, NULLIF(btrim(coalesce(operating_role_key,'')),'')
    INTO _membership, _explicit
  FROM public.company_users
  WHERE user_id = _user_id AND company_id = _company_id
  LIMIT 1;

  IF _membership IS NULL THEN RETURN NULL; END IF;
  IF _membership = 'company_owner' THEN RETURN 'company_owner'; END IF;

  -- operating_role_key='company_owner' sin membresía de dueño NO escala.
  IF _explicit IS NOT NULL AND _explicit <> 'company_owner'
     AND EXISTS (SELECT 1 FROM public.operating_role_permissions() o WHERE o.role_key = _explicit) THEN
    RETURN _explicit;
  END IF;

  RETURN CASE _membership
    WHEN 'admin' THEN 'admin_unassigned'
    WHEN 'manager' THEN 'service_supervisor'
    WHEN 'supervisor' THEN 'service_supervisor'
    WHEN 'employee' THEN 'worker'
    ELSE NULL
  END;
END $function$;

GRANT EXECUTE ON FUNCTION public.resolve_operating_role(uuid, uuid) TO authenticated, service_role;

-- 3) has_permission — allowlist, deny by default -----------------------
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _company_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  _is_platform boolean;
  _is_owner boolean;
  _role text;
  _saw boolean := false;
  _any_true boolean := false;
  _v boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO r FROM public.permission_catalog() c WHERE c.permission = _permission;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Staff de plataforma: acceso total, nunca restringible.
  _is_platform := public.is_global_owner(_user_id);
  IF _is_platform THEN RETURN true; END IF;

  IF _company_id IS NULL THEN RETURN false; END IF;

  -- Override explícito de ESTA compañía (nunca filas company_id IS NULL).
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

  _is_owner := public.is_company_owner(_user_id, _company_id);

  -- Dueño: acceso total; permisos críticos irrevocables (anti-lockout).
  IF _is_owner THEN
    IF _permission IN ('users.manage','roles.manage','company.settings') THEN RETURN true; END IF;
    IF _saw THEN RETURN _any_true; END IF;
    RETURN true;
  END IF;

  -- Permisos reservados al dueño: ningún rol ni override los concede.
  IF _permission IN ('users.manage','roles.manage','company.settings') THEN RETURN false; END IF;

  IF _saw THEN RETURN _any_true; END IF;

  -- Default del rol operativo (allowlist).
  _role := public.resolve_operating_role(_user_id, _company_id);
  IF _role IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.operating_role_permissions() o
    WHERE o.role_key = _role AND o.permission = _permission
  );
END $function$;

-- 4) Tenant isolation: un rol global ya no administra cualquier empresa
CREATE OR REPLACE FUNCTION public.user_is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_global_owner(_user_id)                              -- staff de plataforma
    OR public.is_company_owner(_user_id, _company_id)             -- dueño de ESA empresa
    OR public.has_company_role(_user_id, _company_id, 'admin')    -- membresía admin de ESA empresa
$function$;

-- 5) Anti self-escalation en la administración de accesos --------------
DROP FUNCTION IF EXISTS public.admin_set_user_access(uuid, uuid, jsonb, jsonb, text);

CREATE OR REPLACE FUNCTION public.admin_set_user_access(
  _user_id uuid,
  _company_id uuid,
  _actions jsonb DEFAULT '{}'::jsonb,
  _modules jsonb DEFAULT '{}'::jsonb,
  _reason text DEFAULT NULL::text,
  _operating_role text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _before jsonb; _after jsonb; k text; v jsonb;
        _membership text; _role_before text; _role_after text;
        _actor uuid := auth.uid();
        _is_platform boolean;
        _is_owner boolean;
BEGIN
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_required'; END IF;
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  _is_platform := public.is_global_owner(_actor);
  _is_owner := public.is_company_owner(_actor, _company_id);

  -- Solo el dueño de ESTA empresa (o staff de plataforma) administra accesos.
  IF NOT (_is_platform OR _is_owner) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Nadie se administra a sí mismo (salvo staff de plataforma).
  IF _user_id = _actor AND NOT _is_platform THEN RAISE EXCEPTION 'self_escalation_blocked'; END IF;

  SELECT role, operating_role_key INTO _membership, _role_before
  FROM public.company_users WHERE user_id=_user_id AND company_id=_company_id;

  IF _membership IS NULL THEN RAISE EXCEPTION 'target_not_member_of_company'; END IF;

  -- El rol operativo nunca puede usarse para fabricar un dueño.
  IF _operating_role IS NOT NULL AND btrim(_operating_role) = 'company_owner' THEN
    RAISE EXCEPTION 'owner_role_not_assignable';
  END IF;

  IF _operating_role IS NOT NULL AND btrim(_operating_role) <> ''
     AND NOT EXISTS (SELECT 1 FROM public.operating_role_permissions() o
                     WHERE o.role_key = btrim(_operating_role)) THEN
    RAISE EXCEPTION 'unknown_operating_role';
  END IF;

  SELECT jsonb_build_object(
    'actions', COALESCE((SELECT jsonb_object_agg(action,granted) FROM public.action_permissions
                          WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'modules', COALESCE((SELECT jsonb_object_agg(module, jsonb_build_object('view',can_view,'edit',can_edit,'delete',can_delete))
                           FROM public.module_permissions WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'operating_role', to_jsonb(_role_before)
  ) INTO _before;

  FOR k, v IN SELECT * FROM jsonb_each(COALESCE(_actions,'{}'::jsonb)) LOOP
    INSERT INTO public.action_permissions (user_id, company_id, action, granted)
    VALUES (_user_id,_company_id,k,(v#>>'{}')::boolean)
    ON CONFLICT (user_id, company_id, action)
      DO UPDATE SET granted = EXCLUDED.granted, updated_at = now();
  END LOOP;

  FOR k, v IN SELECT * FROM jsonb_each(COALESCE(_modules,'{}'::jsonb)) LOOP
    INSERT INTO public.module_permissions (user_id, company_id, module, can_view, can_edit, can_delete)
    VALUES (_user_id,_company_id,k,
            COALESCE((v->>'view')::boolean,false),
            COALESCE((v->>'edit')::boolean,false),
            COALESCE((v->>'delete')::boolean,false))
    ON CONFLICT (user_id, company_id, module) WHERE company_id IS NOT NULL
      DO UPDATE SET can_view=EXCLUDED.can_view, can_edit=EXCLUDED.can_edit,
                    can_delete=EXCLUDED.can_delete, updated_at=now();
  END LOOP;

  IF _operating_role IS NOT NULL AND _membership <> 'company_owner' THEN
    UPDATE public.company_users
       SET operating_role_key = NULLIF(btrim(_operating_role),'')
     WHERE user_id=_user_id AND company_id=_company_id;
  END IF;

  SELECT operating_role_key INTO _role_after
  FROM public.company_users WHERE user_id=_user_id AND company_id=_company_id;

  SELECT jsonb_build_object(
    'actions', COALESCE((SELECT jsonb_object_agg(action,granted) FROM public.action_permissions
                          WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'modules', COALESCE((SELECT jsonb_object_agg(module, jsonb_build_object('view',can_view,'edit',can_edit,'delete',can_delete))
                           FROM public.module_permissions WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'operating_role', to_jsonb(_role_after)
  ) INTO _after;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (_actor, _company_id, 'update', 'permissions', _user_id,
          jsonb_build_object('actor',_actor,'target_user',_user_id,'company_id',_company_id,
                             'before',_before,'after',_after,'reason',_reason,'at',now()));

  RETURN _after;
END $function$;