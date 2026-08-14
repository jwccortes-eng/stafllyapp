CREATE OR REPLACE FUNCTION public.permission_catalog()
 RETURNS TABLE(permission text, domain text, legacy_action text, legacy_module text, legacy_level text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT * FROM (VALUES
    ('service.view','services',NULL,'shifts','view'),
    ('service.create','services','crear_turno','shifts','edit'),
    ('service.edit','services','editar_turno','shifts','edit'),
    ('service.publish','services','editar_turno','shifts','edit'),
    ('service.cancel','services','eliminar_turno','shifts','delete'),
    ('service.close','services','cerrar_turno',NULL,NULL),
    ('service.reopen','services','reabrir_turno',NULL,NULL),
    ('staffing.view','staffing',NULL,'shifts','view'),
    ('staffing.assign','staffing','asignar_turno','shifts','edit'),
    ('staffing.replace','staffing','asignar_turno','shifts','edit'),
    ('staffing.remove','staffing','asignar_turno','shifts','edit'),
    ('attendance.view','attendance',NULL,'timeclock','view'),
    ('time_entries.view','attendance',NULL,'timeclock','view'),
    ('time_entries.review','attendance','editar_clock','timeclock','edit'),
    ('time_entries.adjust','attendance','editar_clock','timeclock','edit'),
    ('time_entries.approve','attendance','aprobar_clock',NULL,NULL),
    ('closeout.close_day','attendance','cerrar_dia',NULL,NULL),
    ('closeout.reopen_day','attendance','reabrir_dia',NULL,NULL),
    ('workers.view','people',NULL,'employees','view'),
    ('workers.edit','people',NULL,'employees','edit'),
    ('workers.documents','people',NULL,'employees','edit'),
    ('workers.invite','people',NULL,'employees','edit'),
    ('clients.view','clients',NULL,'clients','view'),
    ('clients.edit','clients',NULL,'clients','edit'),
    ('locations.view','clients',NULL,'locations','view'),
    ('locations.edit','clients',NULL,'locations','edit'),
    ('documents.view','documents',NULL,'employees','view'),
    ('documents.manage','documents',NULL,'employees','edit'),
    ('announcements.publish','communication','publicar_anuncio','announcements','edit'),
    ('announcements.edit','communication','editar_anuncio','announcements','edit'),
    ('announcements.delete','communication','eliminar_anuncio','announcements','delete'),
    ('announcements.pin','communication','fijar_anuncio','announcements','edit'),
    ('payroll.view','payroll','ver_salarios','summary','view'),
    ('payroll.manage','payroll','editar_nomina','periods','edit'),
    ('payroll.approve','payroll','aprobar_nomina',NULL,NULL),
    ('payroll.export','payroll','exportar_nomina','summary','view'),
    ('reports.view','payroll','ver_reportes','reports','view'),
    ('users.manage','admin',NULL,NULL,NULL),
    ('roles.manage','admin',NULL,NULL,NULL),
    ('company.settings','admin','configurar_empresa',NULL,NULL),
    ('payroll.settings','admin','configurar_nomina',NULL,NULL)
  ) AS t(permission,domain,legacy_action,legacy_module,legacy_level)
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _company_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  _is_owner boolean;
  _role text;
  _saw boolean := false;
  _any_true boolean := false;
  _v boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO r FROM public.permission_catalog() c WHERE c.permission = _permission;
  IF NOT FOUND THEN RETURN false; END IF;

  IF public.is_global_owner(_user_id) THEN RETURN true; END IF;

  IF _company_id IS NULL THEN RETURN false; END IF;

  -- 1) Regla explícita por ACCIÓN: es autoritativa (un deny explícito manda).
  IF r.legacy_action IS NOT NULL THEN
    SELECT granted INTO _v FROM public.action_permissions
      WHERE user_id=_user_id AND company_id=_company_id AND action=r.legacy_action LIMIT 1;
    IF FOUND THEN
      _saw := true;
      _any_true := COALESCE(_v,false);
    END IF;
  END IF;

  -- 2) Solo si NO hay regla de acción, se consulta el módulo (más amplio).
  IF NOT _saw AND r.legacy_module IS NOT NULL THEN
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
      _any_true := COALESCE(_v,false);
    END IF;
  END IF;

  _is_owner := public.is_company_owner(_user_id, _company_id);

  IF _is_owner THEN
    IF _permission IN ('users.manage','roles.manage','company.settings') THEN RETURN true; END IF;
    IF _saw THEN RETURN _any_true; END IF;
    RETURN true;
  END IF;

  IF _permission IN ('users.manage','roles.manage','company.settings') THEN RETURN false; END IF;

  IF _saw THEN RETURN _any_true; END IF;

  _role := public.resolve_operating_role(_user_id, _company_id);
  IF _role IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.operating_role_permissions() o
    WHERE o.role_key = _role AND o.permission = _permission
  );
END $function$;