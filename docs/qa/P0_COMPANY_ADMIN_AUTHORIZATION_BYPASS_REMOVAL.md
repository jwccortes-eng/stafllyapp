# P0 — Remove `company_admin` as Authorization Bypass

Remediación de `docs/qa/P0_DUVAN_QUALITY_REALITY_CERTIFICATION_FAILURE.md`.
Fecha: 14 Ago 2026. Sin cambios de datos de negocio ni de roles de personas.

## 1. Qué cambió

### Base de datos (2 migraciones)

| Objeto | Antes | Ahora |
|---|---|---|
| `user_is_company_admin(user, company)` | global owner **OR company owner OR `company_users.role='admin'`** | global owner **OR** company owner. La etiqueta de membresía ya no autoriza |
| `user_belongs_to_company(user, company)` | no existía | **nuevo helper de pertenencia** (no autoriza nada; nombre honesto para los chequeos de contexto/tenant) |
| `can_manage_shift_company(company)` | admin de membresía + roles de compañía `manager`/`supervisor` + roles globales | `has_permission('staffing.assign')` **OR** `has_permission('service.edit')` |
| `publish_shift_draft(shift)` | `user_is_company_admin` | `has_permission('service.publish')` |
| `can_manage_service_intake_files(user, company)` | `user_is_company_admin` | `has_permission('service.create' \| 'service.edit')` |
| `admin_get_employees_with_fiscal(company)` | `user_is_company_admin` | `has_permission('workers.view')` |
| `can_request_shift_correction` / `list_shift_corrections` | `can_manage_shift_company` | además `time_entries.review` / `time_entries.adjust` (anti-regresión Time & Closeout) |
| `employee_invitations` (3 policies) | `company_id IN user_company_ids()` (pertenencia sola) | `workers.invite` para crear/editar; `workers.invite` o `workers.view` para ver |

Efecto de cascada: las **55 policies en 27 tablas** que llaman a
`user_is_company_admin` (facturación, compensación, reconciliación, W9, office
visits, historical payroll) quedaron corregidas **sin tocar ni una sola policy
ni un solo dato financiero** — cambió la función, no las reglas.

### Frontend

| Archivo | Cambio |
|---|---|
| `src/components/auth/RouteAuthorizationGate.tsx` (nuevo) | Guard de ruta por permiso efectivo, derivado del mapa canónico `nav-permissions`. Cubre subrutas (`/app/employees/:id`) por prefijo más largo |
| `src/components/AdminLayout.tsx` | Los 3 `Outlet` del shell (desktop, móvil, founder) van envueltos en el guard: **no hay URL directa que evada el menú** |
| `src/lib/auth/nav-permissions.ts` | +38 rutas mapeadas (ops-center, shift-ops, daily-ops, command-center, today, needs-attention, people, workforce, chat, billing, invoicing, reports, reconciliación, activity, assignment-overrides…), `routePermissionsFor()` con match por prefijo y `isPlatformOnlyPath()` |
| `src/lib/notifications/authorization.ts` (nuevo) | Mapa categoría de notificación → permiso mínimo para **recibirla** |
| `src/hooks/useNotifications.tsx` | Se retiró `role === 'admin' \|\| 'manager'`. La bandeja de empresa se abre por permiso efectivo; el fetch y el canal realtime filtran por categoría; sin permiso no entra, no suena y no cuenta |

Las CTAs de servicio (`+ Crear`, Nuevo servicio, Guardar borrador, Publicar,
Editar, Reemplazar) ya se resolvían con `can("service.edit" / "service.create")`
en `Shifts.tsx`, `MobileShiftsView.tsx` y `MobileQuickCreateShiftSheet.tsx`; con
`operating_role_key` NULL evalúan `false` y desaparecen.

## 2. QA real medido (SQL contra datos de producción, sin tocar roles)

**Duván / Quality Staff** (`operating_role_key = NULL`, `role = 'admin'`)

| Prueba | Resultado |
|---|---|
| `user_is_company_admin` | **false** (antes true) |
| `user_belongs_to_company` | true (la membresía sigue describiendo la relación) |
| permisos efectivos | **0 / 41** |
| `service.create` / `service.publish` / `staffing.assign` | false / false / false |
| `workers.invite` | false |
| `company.settings` / `users.manage` / `roles.manage` | false |
| `has_module_permission(shifts, view)` | false |
| Billing / invoicing / reconciliación (vía `user_is_company_admin`) | denegado |
| Rutas `/app/shifts`, `/app/ops-center`, `/app/employees`, `/app/timeclock`, `/app/billing` | bloqueadas por `RouteAuthorizationGate` |
| Notificaciones `no_show_alert` / cobertura / cierre | filtradas (exigen `attendance.view` / `time_entries.view` / `staffing.view`) |

**Duván / MyStaff** (`time_closeout_admin`)

- **11 / 41** exactos, sin cambios: `service.view`, `service.close`,
  `service.reopen`, `closeout.close_day`, `closeout.reopen_day`,
  `time_entries.view/review/adjust/approve`, `attendance.view`, `workers.view`.
- Correcciones de marcaciones: **conservadas** (`can_request_shift_correction`
  ahora acepta `time_entries.review/adjust`).
- `staffing.assign`: false — correcto, nunca estuvo en su allowlist.

**Owners** — sin regresión: los 10 `company_owner` (Jorge, Keury y demás)
mantienen `user_is_company_admin = true` y **41 / 41** permisos, con
`users.manage`, `roles.manage` y `company.settings` irrevocables.
(`85000c53` en Quality mide 36/41 por overrides explícitos previos de esa
empresa, no por este cambio.)

**Cross-tenant** — `service.close` de MyStaff no autoriza nada en Quality:
`has_permission(duván, Quality, 'service.close') = false`.

## 3. Blast radius aceptado

10 membresías con `role='admin'` y `operating_role_key` NULL pierden autoridad
(Quality 3, MyStaff 2, QA Testing 1, Sandbox 2, Stafly Demo 1, Parceros 1 como
`manager`). Es exactamente el resultado buscado: sin rol operativo no hay
permisos. Se resuelve asignándoles rol operativo en `/app/permissions`, no
reabriendo el bypass.

## 4. Cierre obligatorio

1. **¿`company_users.role='admin'` concede aún autoridad operacional?** No. Ni en `user_is_company_admin`, ni en `can_manage_shift_company`, ni en publicación, asignación, invitación o intake.
2. **¿Qué función reemplaza los chequeos de solo pertenencia?** `public.user_belongs_to_company(user, company)`.
3. **¿Cuántos consumidores de `user_is_company_admin`?** 69: 14 funciones + 55 policies RLS (27 tablas).
4. **¿Cuántos migrados?** Los 69 quedan corregidos: 5 funciones reescritas a permiso explícito y 64 consumidores (9 funciones + 55 policies) corregidos por cascada al endurecer la función; +3 policies de `employee_invitations` migradas de pertenencia a `workers.invite`; +2 funciones de corrección de horas ajustadas para no regresionar.
5. **¿Cuáles permanecen y por qué?** Las **106 policies en 76 tablas** que autorizan solo por pertenencia (`user_company_ids`) siguen vivas: migrarlas en masa es el pase RLS dedicado, no este P0. En Quality no habilitan las acciones certificadas aquí, pero sí lecturas operativas de segunda línea (`shift_notes`, `shift_timeline`, `staffing_requests`, `clock_alerts`). También siguen 47 policies con `has_role(auth.uid(),'admin')` global (Duván no lo tiene).
6. **¿Duván Quality puede crear un servicio?** No — `service.create` false, INSERT bloqueado por RLS y CTA oculta.
7. **¿Publicar?** No — `publish_shift_draft` exige `service.publish`; lanza `insufficient_privilege`.
8. **¿Asignar / reemplazar?** No — `can_manage_shift_company` false ⇒ `assign_worker_to_shift`, `remove_worker_from_shift`, `set_shift_assignment_state`, `cancel_shift` responden `forbidden`.
9. **¿Invitar?** No — `workers.invite` false en ruta, en UI y en RLS.
10. **¿Billing?** No — ruta con permiso `company.settings` y tablas de facturación dependientes de `user_is_company_admin`, ahora false.
11. **¿Recibe notificaciones que no le corresponden?** No en cliente: la bandeja exige permiso y cada categoría operativa se filtra en fetch y en realtime. **Pendiente backend:** el *fan-out* sigue creando la fila con `recipient_id` = usuario; el filtrado es de entrega, no de generación. Se cierra en el pase de destinatarios por permiso.
12. **¿Duván MyStaff conserva Time & Closeout?** Sí, 11/41 exactos, incluidas correcciones de marcación.
13. **¿Owners con full access?** Sí, 41/41 y anti-lockout intacto.
14. **¿Cambios en payroll / time_entries?** Ninguno. No se tocó dato, ni cálculo, ni policy de nómina, horas, turnos, asignaciones, pagos ni documentos.
15. **¿Quedan P0 de autorización fuera de las 27 tablas financieras?** Sí, dos: (a) las 106 policies de pertenencia sola; (b) el fan-out de notificaciones por permiso en el backend.

## 5. Veredicto

# 🟡 GO WITH CONDITIONS

El bypass central está eliminado: `company_users.role='admin'` ya no autoriza
nada, y la cadena `membership → operating_role_key → allowlist → overrides →
has_permission` es la única autoridad company-scoped. Duván en Quality queda en
deny total en las 10 superficies certificadas y MyStaff conserva su allowlist
exacta.

**Condiciones para GO pleno:**
1. Pase RLS de pertenencia → permiso en las 106 policies restantes.
2. Fan-out de notificaciones filtrado por permiso en el productor.
3. Asignar `operating_role_key` a las 10 membresías `admin` sin rol operativo.
