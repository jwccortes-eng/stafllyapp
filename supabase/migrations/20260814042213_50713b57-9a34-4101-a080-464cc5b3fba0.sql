-- =====================================================================
-- P0 — RETIRO DE BYPASSES LEGACY DE AUTORIZACIÓN
-- FASE 2: has_module_permission / has_action_permission company-scoped
-- FASE 3: RLS por permiso explícito (tiers 1-4)
-- FASE 4: owner y staff de plataforma conservan acceso total (via has_permission)
-- =====================================================================

-- ---------- FASE 2.1 — nueva firma company-scoped ----------
CREATE OR REPLACE FUNCTION public.has_module_permission(
  _user_id uuid, _company_id uuid, _module text, _permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.is_global_owner(_user_id) THEN true
    WHEN _company_id IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM public.permission_catalog() c
                 WHERE c.legacy_module = _module AND c.legacy_level = _permission)
      THEN EXISTS (
        SELECT 1 FROM public.permission_catalog() c
        WHERE c.legacy_module = _module AND c.legacy_level = _permission
          AND public.has_permission(_user_id, _company_id, c.permission)
      )
    -- Módulo fuera del catálogo canónico: dueño de la empresa u override
    -- explícito de ESA empresa. Nunca filas legacy company_id IS NULL.
    ELSE public.is_company_owner(_user_id, _company_id)
         OR COALESCE((
           SELECT CASE _permission
                    WHEN 'view' THEN can_view
                    WHEN 'edit' THEN can_edit
                    ELSE can_delete
                  END
           FROM public.module_permissions
           WHERE user_id = _user_id AND company_id = _company_id AND module = _module
           LIMIT 1), false)
  END
$function$;

-- ---------- FASE 2.2 — migrar policies 3-arg -> 4-arg ----------
DO $$
DECLARE
  p record;
  newq text;
  newc text;
  roles_txt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%has_module_permission(auth.uid(), ''%'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=p.tablename AND column_name='company_id'
    ) THEN
      RAISE NOTICE 'SKIP (sin company_id): %.%', p.tablename, p.policyname;
      CONTINUE;
    END IF;

    newq := replace(coalesce(p.qual,''), 'has_module_permission(auth.uid(), ',
                    'has_module_permission(auth.uid(), company_id, ');
    newc := replace(coalesce(p.with_check,''), 'has_module_permission(auth.uid(), ',
                    'has_module_permission(auth.uid(), company_id, ');
    roles_txt := array_to_string(p.roles, ', ');

    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
      p.policyname, p.tablename,
      CASE WHEN p.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      p.cmd, roles_txt,
      CASE WHEN p.qual IS NULL THEN '' ELSE 'USING (' || newq || ')' END,
      CASE WHEN p.with_check IS NULL THEN '' ELSE 'WITH CHECK (' || newc || ')' END
    );
  END LOOP;
END $$;

-- ---------- FASE 2.3 — firma legacy 3-arg: sin fallback global ----------
CREATE OR REPLACE FUNCTION public.has_module_permission(
  _user_id uuid, _module text, _permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- LEGACY EN RETIRO: sin contexto de empresa no se autoriza nada salvo staff
  -- de plataforma. Un rol global (supervisor/manager/admin) NO concede
  -- permisos dentro de una compañía.
  SELECT public.is_global_owner(_user_id)
$function$;

-- ---------- FASE 2.4 — has_action_permission company-scoped ----------
CREATE OR REPLACE FUNCTION public.has_action_permission(
  _user_id uuid, _company_id uuid, _action text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.is_global_owner(_user_id) THEN true
    WHEN _company_id IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM public.permission_catalog() c WHERE c.legacy_action = _action)
      THEN EXISTS (
        SELECT 1 FROM public.permission_catalog() c
        WHERE c.legacy_action = _action
          AND public.has_permission(_user_id, _company_id, c.permission)
      )
    ELSE public.is_company_owner(_user_id, _company_id)
         OR COALESCE((SELECT granted FROM public.action_permissions
                      WHERE user_id=_user_id AND company_id=_company_id AND action=_action
                      LIMIT 1), false)
  END
$function$;

-- ---------- FASE 3 — RLS: user_is_company_admin -> permiso explícito ----------
DO $$
DECLARE
  m record;
  p record;
  perm text;
  newq text;
  newc text;
  roles_txt text;
  sel_exists boolean;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      -- tier 1: personas, documentos, permisos
      ('module_permissions','roles.manage','roles.manage'),
      ('employees','workers.view','workers.edit'),
      ('employee_portal_modules','workers.view','workers.edit'),
      ('employee_documents','documents.view','documents.manage'),
      ('document_intake_batches','documents.view','documents.manage'),
      ('document_intake_items','documents.view','documents.manage'),
      ('document_review_events','documents.view','documents.manage'),
      ('job_applications','workers.view','workers.edit'),
      -- tier 2: configuración de empresa
      ('company_financial_policies','company.settings','company.settings'),
      ('front_desk_devices','company.settings','company.settings'),
      ('front_desk_case_sequences','company.settings','company.settings'),
      ('kiosk_devices','company.settings','company.settings'),
      ('shift_chat_config','service.view','company.settings'),
      -- tier 3: servicios / staffing / ubicaciones
      ('shift_assignment_admin_overrides','staffing.view','staffing.assign'),
      ('dispatch_logs','staffing.view','staffing.assign'),
      ('locations_v2','locations.view','locations.edit'),
      ('closure_quality_log','service.view','service.close'),
      -- tier 4: horas, asistencia y cierre
      ('location_presence','attendance.view','time_entries.review'),
      ('location_sessions','attendance.view','time_entries.review'),
      ('normalized_clock_rows','time_entries.view','time_entries.review')
    ) AS t(tbl, read_perm, write_perm)
  LOOP
    FOR p IN
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname='public' AND tablename = m.tbl
        AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%user_is_company_admin%'
    LOOP
      perm := CASE WHEN p.cmd = 'SELECT' THEN m.read_perm ELSE m.write_perm END;

      newq := regexp_replace(coalesce(p.qual,''),
        'user_is_company_admin\(auth\.uid\(\), ([^)]*)\)',
        'has_permission(auth.uid(), \1, ''' || perm || ''')', 'g');
      newc := regexp_replace(coalesce(p.with_check,''),
        'user_is_company_admin\(auth\.uid\(\), ([^)]*)\)',
        'has_permission(auth.uid(), \1, ''' || perm || ''')', 'g');
      roles_txt := array_to_string(p.roles, ', ');

      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
      EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
        p.policyname, p.tablename,
        CASE WHEN p.permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        p.cmd, roles_txt,
        CASE WHEN p.qual IS NULL THEN '' ELSE 'USING (' || newq || ')' END,
        CASE WHEN p.with_check IS NULL THEN '' ELSE 'WITH CHECK (' || newc || ')' END
      );

      -- Una policy ALL con permiso de escritura dejaría sin lectura a los roles
      -- de solo lectura: se añade una policy SELECT explícita equivalente.
      IF p.cmd = 'ALL' AND m.read_perm <> m.write_perm AND p.qual IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname='public' AND tablename=p.tablename
            AND policyname = p.policyname || ' (read)'
        ) INTO sel_exists;
        IF NOT sel_exists THEN
          EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO %s USING (%s)',
            p.policyname || ' (read)', p.tablename, roles_txt,
            regexp_replace(coalesce(p.qual,''),
              'user_is_company_admin\(auth\.uid\(\), ([^)]*)\)',
              'has_permission(auth.uid(), \1, ''' || m.read_perm || ''')', 'g'));
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;