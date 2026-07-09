# STAFly Command Center — Sprint 52: Provisioning Report (HANDOFF OUT-OF-BAND)

**Fecha del handoff:** 2026-07-09
**Estado:** 🟡 **Handoff formal aceptado por el owner.** La ejecución sale del alcance del agente Lovable y pasa a owner + DevOps. Este proyecto Lovable **no** ejecuta ninguna acción de infraestructura mientras tanto (cero DB writes, cero migraciones, cero secrets escritos, cero cambios a `src/**`, cero cambios a payroll/auth/RLS/edge functions/tenants reales).
**Depende de:** owner del workspace + DevOps con acceso a Supabase (crear proyecto) y a Lovable Workspace Settings (crear segundo proyecto Lovable).

---

## 0. Formulario de completion (rellenar cuando termine la ejecución humana)

Marcar cada campo cuando el paso correspondiente del §2 esté cerrado. **No pegar secrets aquí** (ni project ref completo, ni URLs completas, ni anon key, ni service role, ni DB password).

- [ ] **Fecha de ejecución:** `YYYY-MM-DD`
- [ ] **Responsable:** `<nombre / handle interno>`
- [ ] **Últimos 4 chars del project ref staging:** `xxxx` (solo los últimos 4, para identificación)
- [ ] **Región Supabase staging:** `<región>` (debe coincidir con producción)
- [ ] **Fecha del deploy Lovable staging:** `YYYY-MM-DD HH:MM TZ`
- [ ] **Screenshot del badge visible en el nuevo preview URL:** adjuntar en `docs/demo/screenshots/sp52-badge-staging-desktop.png` y `sp52-badge-staging-mobile.png` — deben mostrar el chip amarillo "STAGING / DEMO · Synthetic data only. No production data." y **no** deben mostrar la URL productiva ni ningún dato real.
- [ ] **Pasos 1–6 del §2 completados sin incidentes:** sí / no (si no, describir en §6 "Incidentes de ejecución").
- [ ] **Side effects auditados (§2 Paso 4):** sí / no + lista de triggers/funciones neutralizados.

Hasta que este formulario esté rellenado y los dos screenshots existan en el repo, **Sprint 47 (seed) sigue prohibido** y **Sprint 46B (captura) sigue prohibido**.

---


---

## 1. Por qué el agente no puede completar Sprint 52 desde este proyecto

Este proyecto corre sobre **Lovable Cloud**, una única instancia Supabase managed. Las tools disponibles al agente en este contexto (`supabase--migration`, `supabase--insert`, `supabase--project_info`, etc.) operan **contra la DB actual**, que es la productiva con 8 tenants reales (confirmado en Sprint 48).

Concretamente:

| Acción requerida en Sprint 52 | Herramienta disponible al agente | Riesgo si se ejecuta |
|---|---|---|
| Crear nuevo proyecto Supabase `stafly-staging-demo` | ❌ No existe | N/A — imposible |
| Aplicar `supabase/migrations/**` contra el nuevo proyecto | Solo `supabase--migration` → apunta a **producción** | Escritura de schema en producción. **Prohibido.** |
| Configurar `VITE_APP_ENV=staging` + URL/anon key del nuevo proyecto en un build Lovable separado | ❌ No existe tool para editar env de otro proyecto Lovable | N/A — acción de Workspace UI |
| Guardar `SUPABASE_SERVICE_ROLE_KEY` staging fuera del repo | ❌ Service role staging no accesible desde aquí | N/A — vault externo |
| `supabase db dump --schema-only` desde prod → `supabase db push` a staging | ❌ Requiere CLI local con credenciales de ambos proyectos | N/A — flujo DevOps local |

Cualquier intento de "avanzar parcialmente" (por ejemplo, correr una migración "solo para verificar" o setear un secret placeholder en el proyecto actual) violaría al menos una de tus reglas explícitas: *no tocar producción, no ejecutar migraciones contra producción, no guardar secrets en repo, no mezclar tenants*.

**Decisión:** documentar el runbook exacto para ejecución humana y no tocar nada más.

---

## 2. Runbook out-of-band (para el owner del workspace + DevOps)

Ejecutar en este orden. **Nada de esto corre en el proyecto Lovable actual.**

### Paso 1 — Crear segundo proyecto Supabase (UI Supabase, cuenta del owner)

- Región: la misma que el proyecto productivo (para latencia comparable en QA).
- Nombre: `stafly-staging-demo`.
- Plan: el mínimo que soporte auth + RLS (free tier suele bastar para demo).
- Guardar en vault/1Password: `project_ref`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DB_PASSWORD`. **Ninguno de estos valores va al repo.**

### Paso 2 — Schema-only sync desde producción (CLI local del owner, terminal segura)

```bash
# 1) Dump schema-only del proyecto productivo (SIN datos)
supabase db dump \
  --db-url "postgresql://postgres:<PROD_DB_PASSWORD>@db.jplhtputzixwqarqlrth.supabase.co:5432/postgres" \
  --schema-only \
  --exclude-schema storage \
  --exclude-schema auth \
  --exclude-schema realtime \
  --exclude-schema supabase_functions \
  --exclude-schema vault \
  -f /tmp/stafly-schema-only.sql

# 2) Revisión manual del dump: buscar y eliminar cualquier COPY, INSERT,
#    ALTER USER, o referencia a auth.users. Debe quedar SOLO DDL.
grep -Ei '^(COPY|INSERT|ALTER USER|CREATE USER)' /tmp/stafly-schema-only.sql
# Debe devolver vacío. Si no, editar a mano.

# 3) Aplicar contra el proyecto staging (usar la password del proyecto NUEVO)
psql "postgresql://postgres:<STAGING_DB_PASSWORD>@db.<STAGING_REF>.supabase.co:5432/postgres" \
  -f /tmp/stafly-schema-only.sql

# 4) Borrar el dump local
shred -u /tmp/stafly-schema-only.sql
```

Si el dump incluye `finance_*`, `historical_payroll_entries`, `reconciliation_*`, `contractor_w9`, `tax_forms_1099`, `passport_*` u otras tablas con PII: mantener la estructura pero confirmar que **no** vienen datos (schema-only ya lo garantiza; verificar con `SELECT count(*)` post-aplicación → todo debe dar `0`).

### Paso 3 — Verificar estructura mínima en staging

Conectado al proyecto staging:

```sql
-- RLS activo en tablas sensibles
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles','user_roles','companies','shifts','time_entries','shift_assignments','scheduled_shifts')
ORDER BY tablename;
-- Todas deben mostrar rowsecurity = true

-- Funciones críticas presentes
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('has_role','has_company_role');
-- Deben aparecer las dos

-- Cero filas en tablas sensibles (schema-only aplicado correctamente)
SELECT 'profiles' AS t, count(*) FROM public.profiles
UNION ALL SELECT 'companies', count(*) FROM public.companies
UNION ALL SELECT 'time_entries', count(*) FROM public.time_entries
UNION ALL SELECT 'shift_assignments', count(*) FROM public.shift_assignments;
-- Todos = 0
```

### Paso 4 — Neutralizar side effects externos en staging

Revisar en la DB staging (mismo cliente psql):

```sql
-- Triggers que llamen edge functions, envíen webhooks, notificaciones, emails, SMS, pagos
SELECT n.nspname, c.relname AS table, t.tgname AS trigger, p.proname AS function
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE NOT t.tgisinternal AND n.nspname = 'public'
ORDER BY c.relname, t.tgname;
```

Para cada trigger o función que dispare side effects externos (Stripe, Resend, Twilio, webhooks a partners, notificaciones push, generación de facturas, etc.):

- **Opción A (preferida):** desactivar en staging vía `ALTER TABLE ... DISABLE TRIGGER <name>`.
- **Opción B:** reemplazar la función por un stub `RETURN NEW;` **solo en staging**.
- **Opción C:** dejar activa pero apuntar las claves de servicios externos a sandbox keys (Stripe test, Resend sandbox domain, Twilio test creds). Nunca claves productivas.

Además, en Supabase → Project Settings → Auth:
- Deshabilitar email confirmations reales (usar el mailer de sandbox).
- Deshabilitar signups públicos si no son necesarios para la demo.
- Configurar redirect URLs solo a los hosts del build Lovable staging.

### Paso 5 — Crear segundo proyecto Lovable apuntado a staging

Desde Lovable Workspace (UI, owner):

1. Crear proyecto nuevo o duplicar este, marcándolo como **staging/demo**.
2. En **Project Settings → Environment Variables** del proyecto staging:
   - `VITE_APP_ENV=staging`
   - `VITE_SUPABASE_URL=<staging URL>`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<staging anon key>` (la anon key es publishable, va en el bundle; la service role **nunca**).
   - `VITE_SUPABASE_PROJECT_ID=<staging ref>`
3. En **Workspace Settings → Build Secrets** (si aplica): NO agregar service role.
4. Deploy y abrir el preview URL del proyecto staging.

### Paso 6 — QA visual del badge (Sprint 50)

En el proyecto Lovable staging recién desplegado:

- [ ] Desktop 1280×800 → chip amarillo "STAGING / DEMO · Synthetic data only. No production data." visible abajo-centro.
- [ ] Mobile 390×844 → mismo chip, no tapa bottom nav ni CTAs.
- [ ] Consola → `[stafly-build] supabaseUrl` muestra la URL del proyecto **staging** (NO `jplhtputzixwqarqlrth`).
- [ ] Producción (build actual): chip **no** visible.

Si algún check falla: revisar `VITE_APP_ENV` en env vars del proyecto staging antes de continuar.

### Paso 7 — Desbloquear Sprint 47 (seed demo)

Recién en este momento se puede correr el runbook Sprint 47 (`STAFly_COMMAND_CENTER_SPRINT_47_DEMO_TENANT_RUNBOOK.md`), **exclusivamente** contra el nuevo proyecto Supabase staging, para crear:

- `admin.demo@example.com` (via `auth.admin.createUser` con la service role staging, jamás la productiva).
- Tenant `STAFly Demo Hospitality Ops` con `is_demo=true`.
- 8 workers `Demo <rol> <n>` con emails `@example.com`.
- 5 venues demo.
- 9 turnos con los IDs sintéticos (`SHIFT_DEMO_FUTURE`, `SHIFT_DEMO_INPROGRESS`, …, `SHIFT_DEMO_MISSING_INFO`).

---

## 3. Reporte final (estado real)

- **Supabase project creado:** ❌ No. Requiere acción humana (Paso 1).
- **Project ref/URL staging:** N/A — todavía no existe.
- **Build Lovable separado configurado:** ❌ No. Requiere acción humana (Paso 5).
- **Env vars configuradas:** ❌ No.
- **Migraciones aplicadas:** ❌ No en staging (no existe). ❌ **No corridas contra producción** (prohibido).
- **RLS verificado:** ❌ Pendiente hasta que exista staging (Paso 3).
- **`has_role` / `has_company_role` verificados:** ❌ Pendiente (Paso 3).
- **Side effects externos revisados:** ❌ Pendiente (Paso 4).
- **Badge visible desktop/mobile:** ✅ Ya verificado en Sprint 50 sobre el build actual (fallback por hostname). En staging se re-verifica tras Paso 5.
- **Producción no tocada:** ✅ Confirmado. Cero writes, cero migraciones, cero cambios a schema/RLS/auth/payroll/edge functions/tenants reales.
- **Cero datos reales leídos o expuestos:** ✅ Confirmado.
- **Cero secrets en repo:** ✅ Confirmado. No se agregó ningún valor real de service role, anon key staging ni DB password.
- **Cero service role en frontend:** ✅ Confirmado.

---

## 4. Riesgos pendientes

1. **Dependencia humana:** sin owner ejecutando Pasos 1–5, todos los sprints downstream (46B, 51 captura real, deck comercial) siguen bloqueados.
2. **Side effects sin auditar:** hasta el Paso 4, no sabemos qué triggers de `public.*` disparan servicios externos. Si el seed demo se corre antes del Paso 4, un trigger podría enviar emails/SMS reales o crear cobros Stripe con datos ficticios. **Bloqueante para Sprint 47.**
3. **Confusión de proyectos Lovable:** dos proyectos con el mismo look pueden confundirse. Mitigación: badge amarillo (Sprint 50) + nomenclatura clara del proyecto staging + acceso restringido.
4. **Deriva de schema:** el dump se hace una vez. Cambios de schema en prod deberán re-sincronizarse a staging periódicamente para que la demo siga fiel. Recomendado: script CI que corra `supabase db diff` prod↔staging semanalmente y avise si hay drift.
5. **Auth staging:** si el mailer de sandbox no está configurado, `admin.demo@example.com` no recibirá invite mail y el Sprint 47 se atasca en el login. Verificar en Paso 4.

---

## 5. Próximo paso recomendado

**Acción humana (owner + DevOps):** ejecutar Pasos 1–6 de §2 en una sesión dedicada de ~2 horas. Al terminar, actualizar este documento marcando cada paso como completado y adjuntando (sin secrets):

- Fecha de creación del proyecto Supabase staging.
- Últimos 4 caracteres del project ref staging (para identificación, no el ref completo).
- Fecha/hora del deploy del proyecto Lovable staging.
- Screenshot del badge amarillo visible en el nuevo preview URL (con badge, sin URL productiva visible).

Una vez completado, desbloquear en este orden:

1. **Sprint 47** (seed demo sintético en staging).
2. **Sprint 46B** (capturar los 10 PNGs listados en `STAFly_COMMAND_CENTER_SPRINT_51_DEMO_VENDIBLE.md` §4).
3. **Ensamblado del deck comercial** con el guion de 3 min (`SPRINT_51 §6`).
