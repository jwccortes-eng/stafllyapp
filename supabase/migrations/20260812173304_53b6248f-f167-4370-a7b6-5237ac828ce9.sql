DO $$
DECLARE
  qs uuid := '00000000-0000-0000-0000-000000000001'; -- Quality Staff by Keury
  ms uuid := '37f92f75-7af4-4496-aa10-793e14b09ed9'; -- My Staff Solution LLC
  u_sebastian uuid := 'e4793c12-8571-4d7d-bfcb-38391e12168d';
  u_maria     uuid := '96d4a770-87ce-484e-8cbc-97fb827bd561';
  u_duvan     uuid := '4338b336-0f65-4285-9d50-6abcc28e5645';
  c uuid;
  u uuid;
  a text;
  m text;
  shift_admin_true text[] := ARRAY['crear_turno','editar_turno','eliminar_turno','asignar_turno'];
  shift_admin_false text[] := ARRAY['cerrar_turno','reabrir_turno','editar_clock','aprobar_clock','cerrar_dia','reabrir_dia','crear_nomina','editar_nomina','aprobar_nomina','exportar_nomina','ver_salarios','configurar_empresa','configurar_nomina'];
  closeout_true text[] := ARRAY['cerrar_turno','reabrir_turno','editar_clock','aprobar_clock','cerrar_dia','reabrir_dia'];
  closeout_false text[] := ARRAY['crear_turno','editar_turno','eliminar_turno','crear_nomina','editar_nomina','aprobar_nomina','exportar_nomina','ver_salarios','configurar_empresa','configurar_nomina'];
BEGIN
  -- 1. Company membership (per-tenant only; no platform roles touched)
  FOREACH c IN ARRAY ARRAY[qs, ms] LOOP
    FOREACH u IN ARRAY ARRAY[u_sebastian, u_maria, u_duvan] LOOP
      IF EXISTS (SELECT 1 FROM public.company_users WHERE company_id = c AND user_id = u) THEN
        UPDATE public.company_users SET role = 'admin' WHERE company_id = c AND user_id = u;
      ELSE
        INSERT INTO public.company_users (company_id, user_id, role) VALUES (c, u, 'admin');
      END IF;
    END LOOP;
  END LOOP;

  -- 2. Module visibility (module_permissions is per user, applies in both companies)
  -- Shift administrator: full operational modules, no payroll modules.
  FOREACH m IN ARRAY ARRAY['shifts','employees','clients','locations','import','announcements'] LOOP
    INSERT INTO public.module_permissions (user_id, module, can_view, can_edit, can_delete)
    VALUES (u_sebastian, m, true, true, false)
    ON CONFLICT (user_id, module) DO UPDATE SET can_view = true, can_edit = true, can_delete = false, updated_at = now();
  END LOOP;

  -- Closeout administrators: operational read + shift/time edit, no payroll modules.
  FOREACH u IN ARRAY ARRAY[u_maria, u_duvan] LOOP
    INSERT INTO public.module_permissions (user_id, module, can_view, can_edit, can_delete)
    VALUES (u, 'shifts', true, true, false)
    ON CONFLICT (user_id, module) DO UPDATE SET can_view = true, can_edit = true, can_delete = false, updated_at = now();
    FOREACH m IN ARRAY ARRAY['employees','clients','locations'] LOOP
      INSERT INTO public.module_permissions (user_id, module, can_view, can_edit, can_delete)
      VALUES (u, m, true, false, false)
      ON CONFLICT (user_id, module) DO UPDATE SET can_view = true, can_edit = false, can_delete = false, updated_at = now();
    END LOOP;
  END LOOP;

  -- 3. Action permissions per company
  FOREACH c IN ARRAY ARRAY[qs, ms] LOOP
    FOREACH a IN ARRAY shift_admin_true LOOP
      INSERT INTO public.action_permissions (user_id, company_id, action, granted)
      VALUES (u_sebastian, c, a, true)
      ON CONFLICT (user_id, company_id, action) DO UPDATE SET granted = true, updated_at = now();
    END LOOP;
    FOREACH a IN ARRAY shift_admin_false LOOP
      INSERT INTO public.action_permissions (user_id, company_id, action, granted)
      VALUES (u_sebastian, c, a, false)
      ON CONFLICT (user_id, company_id, action) DO UPDATE SET granted = false, updated_at = now();
    END LOOP;

    FOREACH u IN ARRAY ARRAY[u_maria, u_duvan] LOOP
      FOREACH a IN ARRAY closeout_true LOOP
        INSERT INTO public.action_permissions (user_id, company_id, action, granted)
        VALUES (u, c, a, true)
        ON CONFLICT (user_id, company_id, action) DO UPDATE SET granted = true, updated_at = now();
      END LOOP;
      FOREACH a IN ARRAY closeout_false LOOP
        INSERT INTO public.action_permissions (user_id, company_id, action, granted)
        VALUES (u, c, a, false)
        ON CONFLICT (user_id, company_id, action) DO UPDATE SET granted = false, updated_at = now();
      END LOOP;
    END LOOP;
  END LOOP;

  -- 4. Audit trail
  FOREACH c IN ARRAY ARRAY[qs, ms] LOOP
    FOREACH u IN ARRAY ARRAY[u_sebastian, u_maria, u_duvan] LOOP
      INSERT INTO public.activity_log (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (c, u, 'update', 'company_users', u,
        jsonb_build_object('ticket','operational-admin-access-2026-08-12','role','admin','scope','operational_admin_access'));
    END LOOP;
  END LOOP;
END $$;