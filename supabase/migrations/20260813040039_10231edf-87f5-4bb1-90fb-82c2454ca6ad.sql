-- ============================================================
-- FASE 1 — COMPANY-SCOPED module_permissions
-- ============================================================
ALTER TABLE public.module_permissions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Old uniqueness was (user_id, module). Replace with company-aware rules.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.module_permissions'::regclass AND contype IN ('u','p')
      AND conname <> 'module_permissions_pkey'
  LOOP
    EXECUTE format('ALTER TABLE public.module_permissions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.module_permissions_user_module_key;
CREATE UNIQUE INDEX IF NOT EXISTS module_permissions_user_company_module_uidx
  ON public.module_permissions (user_id, company_id, module)
  WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS module_permissions_user_module_legacy_uidx
  ON public.module_permissions (user_id, module)
  WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS module_permissions_company_idx
  ON public.module_permissions (company_id);

-- Revisión de filas heredadas (ambiguas). Nada se asigna automáticamente.
CREATE OR REPLACE VIEW public.permission_scope_review
WITH (security_invoker = true) AS
SELECT
  mp.id                AS module_permission_id,
  mp.user_id,
  mp.module,
  mp.can_view, mp.can_edit, mp.can_delete,
  (SELECT count(*) FROM public.company_users cu WHERE cu.user_id = mp.user_id) AS membership_count,
  (SELECT array_agg(cu.company_id) FROM public.company_users cu WHERE cu.user_id = mp.user_id) AS candidate_company_ids,
  CASE
    WHEN (SELECT count(*) FROM public.company_users cu WHERE cu.user_id = mp.user_id) = 0 THEN 'orphan_no_membership'
    WHEN (SELECT count(*) FROM public.company_users cu WHERE cu.user_id = mp.user_id) = 1 THEN 'single_candidate'
    ELSE 'ambiguous_multi_company'
  END AS review_status
FROM public.module_permissions mp
WHERE mp.company_id IS NULL;

GRANT SELECT ON public.permission_scope_review TO authenticated;
GRANT ALL ON public.permission_scope_review TO service_role;

-- ============================================================
-- FASE 4/5 — Autorización canónica (company-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_module_permission_in_company(
  _user_id uuid, _company_id uuid, _module text, _permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.is_global_owner(_user_id) THEN true
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('developer','owner')) THEN true
    WHEN _company_id IS NOT NULL AND public.is_company_owner(_user_id, _company_id) THEN true
    WHEN _company_id IS NOT NULL AND public.has_exact_company_role(_user_id, _company_id, 'admin') THEN true
    ELSE COALESCE(
      -- 1) fila explícita de la compañía activa
      (SELECT CASE _permission WHEN 'view' THEN can_view WHEN 'edit' THEN can_edit WHEN 'delete' THEN can_delete ELSE false END
         FROM public.module_permissions
        WHERE user_id=_user_id AND company_id=_company_id AND module=_module LIMIT 1),
      -- 2) fallback heredado (company_id NULL) — preserva el comportamiento actual
      (SELECT CASE _permission WHEN 'view' THEN can_view WHEN 'edit' THEN can_edit WHEN 'delete' THEN can_delete ELSE false END
         FROM public.module_permissions
        WHERE user_id=_user_id AND company_id IS NULL AND module=_module LIMIT 1),
      false)
  END
$$;

-- Catálogo canónico dominio.acción → sistema existente (acción o módulo/nivel)
CREATE OR REPLACE FUNCTION public.permission_catalog()
RETURNS TABLE(permission text, domain text, legacy_action text, legacy_module text, legacy_level text)
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT * FROM (VALUES
    ('service.view','services',NULL,'shifts','view'),
    ('service.create','services','crear_turno','shifts','edit'),
    ('service.edit','services','editar_turno','shifts','edit'),
    ('service.publish','services','editar_turno','shifts','edit'),
    ('service.cancel','services','eliminar_turno','shifts','delete'),
    ('service.close','services','cerrar_turno','shifts','edit'),
    ('service.reopen','services','reabrir_turno','shifts','edit'),
    ('staffing.view','staffing',NULL,'shifts','view'),
    ('staffing.assign','staffing','asignar_turno','shifts','edit'),
    ('staffing.replace','staffing','asignar_turno','shifts','edit'),
    ('staffing.remove','staffing','asignar_turno','shifts','edit'),
    ('attendance.view','attendance',NULL,'timeclock','view'),
    ('time_entries.view','attendance',NULL,'timeclock','view'),
    ('time_entries.review','attendance','editar_clock','timeclock','edit'),
    ('time_entries.adjust','attendance','editar_clock','timeclock','edit'),
    ('time_entries.approve','attendance','aprobar_clock','timeclock','edit'),
    ('closeout.close_day','attendance','cerrar_dia','timeclock','edit'),
    ('closeout.reopen_day','attendance','reabrir_dia','timeclock','edit'),
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
    ('payroll.approve','payroll','aprobar_nomina','periods','edit'),
    ('payroll.export','payroll','exportar_nomina','summary','view'),
    ('reports.view','payroll','ver_reportes','reports','view'),
    ('users.manage','admin',NULL,NULL,NULL),
    ('roles.manage','admin',NULL,NULL,NULL),
    ('company.settings','admin','configurar_empresa',NULL,NULL),
    ('payroll.settings','admin','configurar_nomina',NULL,NULL)
  ) AS t(permission,domain,legacy_action,legacy_module,legacy_level)
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _company_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record; _is_admin boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO r FROM public.permission_catalog() c WHERE c.permission = _permission;
  IF NOT FOUND THEN RETURN false; END IF;

  _is_admin := public.is_global_owner(_user_id)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('developer','owner'))
    OR (_company_id IS NOT NULL AND public.is_company_owner(_user_id, _company_id))
    OR (_company_id IS NOT NULL AND public.has_exact_company_role(_user_id, _company_id, 'admin'));

  -- users.manage / roles.manage son exclusivos de administración de compañía
  IF r.legacy_action IS NULL AND r.legacy_module IS NULL THEN
    RETURN _is_admin;
  END IF;

  IF _is_admin THEN RETURN true; END IF;

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
END $$;

-- Acceso efectivo (consola + previsualización, sin impersonar)
CREATE OR REPLACE FUNCTION public.effective_access(_user_id uuid, _company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _perms jsonb; _mods jsonb; _acts jsonb; _role text;
BEGIN
  IF NOT (public.user_is_company_admin(auth.uid(), _company_id) OR auth.uid() = _user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT jsonb_object_agg(c.permission, public.has_permission(_user_id,_company_id,c.permission))
    INTO _perms FROM public.permission_catalog() c;

  SELECT jsonb_object_agg(mp.module, jsonb_build_object('view',mp.can_view,'edit',mp.can_edit,'delete',mp.can_delete))
    INTO _mods FROM public.module_permissions mp
   WHERE mp.user_id=_user_id AND (mp.company_id=_company_id OR mp.company_id IS NULL);

  SELECT jsonb_object_agg(ap.action, ap.granted)
    INTO _acts FROM public.action_permissions ap
   WHERE ap.user_id=_user_id AND ap.company_id=_company_id;

  SELECT cu.role INTO _role FROM public.company_users cu
   WHERE cu.user_id=_user_id AND cu.company_id=_company_id LIMIT 1;

  RETURN jsonb_build_object(
    'user_id',_user_id,'company_id',_company_id,'company_role',_role,
    'global_roles', COALESCE((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id=_user_id),'[]'::jsonb),
    'permissions', COALESCE(_perms,'{}'::jsonb),
    'modules', COALESCE(_mods,'{}'::jsonb),
    'actions', COALESCE(_acts,'{}'::jsonb)
  );
END $$;

-- ============================================================
-- FASE 7/14 — Escritura auditada de permisos
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_user_access(
  _user_id uuid,
  _company_id uuid,
  _actions jsonb DEFAULT '{}'::jsonb,   -- { "crear_turno": true, ... }
  _modules jsonb DEFAULT '{}'::jsonb,   -- { "shifts": {"view":true,"edit":true,"delete":false} }
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _before jsonb; _after jsonb; k text; v jsonb;
BEGIN
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_required'; END IF;
  IF NOT public.user_is_company_admin(auth.uid(), _company_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_users WHERE user_id=_user_id AND company_id=_company_id) THEN
    RAISE EXCEPTION 'target_not_member_of_company';
  END IF;

  SELECT jsonb_build_object(
    'actions', COALESCE((SELECT jsonb_object_agg(action,granted) FROM public.action_permissions
                          WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'modules', COALESCE((SELECT jsonb_object_agg(module, jsonb_build_object('view',can_view,'edit',can_edit,'delete',can_delete))
                           FROM public.module_permissions WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb)
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
    ON CONFLICT (user_id, company_id, module)
      DO UPDATE SET can_view=EXCLUDED.can_view, can_edit=EXCLUDED.can_edit,
                    can_delete=EXCLUDED.can_delete, updated_at=now();
  END LOOP;

  SELECT jsonb_build_object(
    'actions', COALESCE((SELECT jsonb_object_agg(action,granted) FROM public.action_permissions
                          WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb),
    'modules', COALESCE((SELECT jsonb_object_agg(module, jsonb_build_object('view',can_view,'edit',can_edit,'delete',can_delete))
                           FROM public.module_permissions WHERE user_id=_user_id AND company_id=_company_id),'{}'::jsonb)
  ) INTO _after;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _company_id, 'update', 'permissions', _user_id,
          jsonb_build_object('actor',auth.uid(),'target_user',_user_id,'company_id',_company_id,
                             'before',_before,'after',_after,'reason',_reason,'at',now()));

  RETURN _after;
END $$;

GRANT EXECUTE ON FUNCTION public.has_module_permission_in_company(uuid,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.permission_catalog() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_access(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_access(uuid,uuid,jsonb,jsonb,text) TO authenticated, service_role;