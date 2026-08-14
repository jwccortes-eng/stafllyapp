# P0 — REALITY CERTIFICATION: SEBASTIÁN / MYSTAFF

**Modo:** AUDIT ONLY — no se implementaron fixes, no se modificaron datos, permisos, membresías ni configuración.
**Fecha:** 2026-08-14 (UTC)
**Fuente previa:** `docs/qa/P0_COMPANY_ADMIN_AUTHORIZATION_BYPASS_REMOVAL.md`

---

## VEREDICTO FINAL

# 🔴 NO GO

Sebastián tiene un rol operativo coherente (`shift_admin`) y el motor de permisos
responde correctamente, pero **la capa de datos (RLS) y el frontend legacy le
conceden más autoridad que `has_permission`**: puede leer y escribir
`time_entries` (horas reales que alimentan nómina) sin ningún permiso de
`time_entries.*`, y sigue siendo tratado como "admin de compañía" por un helper
de frontend basado en `company_users.role`.

---

## 1. Identidad y membresía resuelta

| Campo | Valor |
|---|---|
| Persona | Sebastian Villegas |
| `user_id` | `e4793c12-8571-4d7d-bfcb-38391e12168d` |
| Email | `svmarin111@gmail.com` |
| Empleado MyStaff | `7f78e03a-66ab-4c9a-95d3-1c3b9766dc08` (sin `user_id` vinculado) |
| Empleado Quality | `3bccba54-4e14-4898-98f4-b24cd58b260c` (vinculado al `user_id`) |
| MyStaff `company_id` | `37f92f75-7af4-4496-aa10-793e14b09ed9` (My Staff Solution LLC) |
| Quality `company_id` | `00000000-0000-0000-0000-000000000001` (Quality Staff by Keury) |
| `company_users.role` | `admin` (en ambas compañías) |
| `operating_role_key` | **`shift_admin`** (en ambas compañías) |
| Roles globales (`user_roles`) | **ninguno** (`has_role(...,'admin')=false`, `is_global_owner=false`) |
| `is_company_owner` | `false` |
| `user_is_company_admin` (MyStaff) | **`false`** ✅ (bypass cerrado) |

> Observación (no bloqueante, P2): el registro de empleado de MyStaff no tiene
> `user_id`; su identidad de portal está anclada al registro de Quality.

## 2. Rol operativo

`shift_admin` → allowlist canónica `SERVICE_OPS` (`src/lib/auth/role-model.ts`,
espejo de `public.operating_role_permissions()`): operación de servicios y
staffing. **No incluye** horas, cierre, nómina, usuarios, roles, ajustes de
empresa ni facturación.

## 3. Permisos efectivos — **16 / 41** en MyStaff

Concedidos (vía `public.has_permission`):

`announcements.edit`, `announcements.pin`, `announcements.publish`,
`clients.view`, `documents.view`, `locations.edit`, `locations.view`,
`service.create`, `service.edit`, `service.publish`, `service.view`,
`staffing.assign`, `staffing.remove`, `staffing.replace`, `staffing.view`,
`workers.view`.

Denegados (25): `announcements.delete`, `attendance.view`, `clients.edit`,
`closeout.close_day`, `closeout.reopen_day`, `company.settings`,
`documents.manage`, `payroll.approve`, `payroll.export`, `payroll.manage`,
`payroll.settings`, `payroll.view`, `reports.view`, `roles.manage`,
`service.cancel`, `service.close`, `service.reopen`, `time_entries.adjust`,
`time_entries.approve`, `time_entries.review`, `time_entries.view`,
`users.manage`, `workers.documents`, `workers.edit`, `workers.invite`.

## 4. Overrides company-scoped (persistidos, no modificados)

**MyStaff** — `module_permissions`: `shifts` v/-/-, `clients` v/-/-,
`employees` v/-/-, `locations` v/e/-, `announcements` v/e/-.
`action_permissions`: `crear_turno`, `editar_turno`, `asignar_turno` = true;
todo lo de nómina/reloj/empresa = false.

**Quality** — `shifts` v/e/-, `clients` v/-/-, `locations` v/-/-,
`employees` -/-/-, `announcements` -/-/-; acciones equivalentes.

**Filas legacy `company_id IS NULL`** (shifts, employees, clients, locations,
import, announcements, reports, timeclock, chat en v/e): **verificado que ya no
autorizan** — `has_permission` y `has_module_permission/4` las ignoran.

## 5. Matriz Expected vs Actual

Leyenda de "Authority": `has_permission` = correcto; otras fuentes = fuga.

| Superficie | Permiso esperado | Efectivo | UI | Ruta | Datos | Acción | Mutación | Authority | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| Home | — (neutra) | n/a | Sí | Sí | propia | — | — | membership | PASS |
| Command Center / Ops Center | `service.view` | ✅ | Sí | Sí | Sí | Sí | — | has_permission | PASS |
| Services — ver / detalle | `service.view` | ✅ | Sí | Sí | Sí | — | — | has_permission | PASS |
| Services — crear | `service.create` | ✅ | Sí | Sí | Sí | Sí | Sí | has_permission | PASS |
| Services — editar / guardar borrador | `service.edit` | ✅ | Sí | Sí | Sí | Sí | Sí | has_permission | PASS |
| Services — publicar | `service.publish` | ✅ | Sí | Sí | Sí | Sí | Sí | `publish_shift_draft` → has_permission | PASS |
| Services — duplicar | `service.create`+`edit` | ✅ | Sí | Sí | Sí | Sí | Sí | has_permission | PASS |
| Services — cancelar | `service.cancel` | ❌ | No | — | — | No | No | has_permission | PASS |
| Services — cerrar / reabrir | `service.close`/`reopen` | ❌ | No | — | — | No | No | has_permission | PASS |
| Staffing — asignar / quitar / reemplazar | `staffing.*` | ✅ | Sí | Sí | Sí | Sí | Sí | `can_manage_shift_company` → has_permission | PASS |
| Notificar asignados / chat de servicio | operacional | parcial | Sí | Sí | Sí | Sí | Sí | `ShiftChatPanel` usa `canAccessAdminForCompany` (rol) | ⚠️ FAIL (P1) |
| Claim / Reclamo de turno | `can_request_shift_correction` | ❌ esperado | — | — | Sí | **Sí** | **Sí** | `can_manage_shift_company` (service.edit) | 🔴 FAIL (P0-2) |
| Time Clock (`/app/timeclock`) | `time_entries.view`/`attendance.view` | ❌ | No | **Bloqueada** | **Sí (RLS)** | — | **Sí (RLS)** | `has_module_permission('shifts','view/edit')` | 🔴 FAIL (P0-1) |
| Attendance | `attendance.view` | ❌ | No | Bloqueada | Sí (RLS vía shifts) | — | — | módulo shifts | 🔴 FAIL (P0-1) |
| Hours / correcciones de horas | `time_entries.adjust/review` | ❌ | No | Bloqueada | Sí | Sí (API) | **Sí** | RLS `Managers can edit time_entries` | 🔴 FAIL (P0-1) |
| Closeout / Daily Close | `closeout.close_day` | ❌ | No | Bloqueada | — | No | No | has_permission | PASS |
| Payroll (periodos, movimientos, conceptos) | `payroll.view` | ❌ | No | Bloqueada | No (module rows en false) | No | No | has_module_permission por compañía | PASS |
| Ready for Pay / aprobación | `payroll.approve` | ❌ | No | Bloqueada | No | No | No | has_permission | PASS |
| Invoices / Billing (datos) | `payroll.view` | ❌ | No | Bloqueada | **Sí (SELECT membresía)** | No | No | `user_company_ids` | ⚠️ FAIL (P1) |
| Team / Workers | `workers.view` | ✅ | Sí | Sí | Sí | — | — | has_permission | PASS |
| Editar trabajador | `workers.edit` | ❌ | No | Sí (misma ruta) | lectura | No | No | has_permission | PASS |
| Invitar trabajador | `workers.invite` | ❌ | No | Bloqueada | — | No | No | RLS `employee_invitations` | PASS |
| Emergency Worker (alta rápida) | `workers.edit`/`invite` | ❌ | **Sí** | Sí (dentro de servicios) | Sí | **Sí** | RPC | `canAccessAdminForCompany` (rol) | ⚠️ FAIL (P1) |
| Documents | `documents.view` | ✅ | Sí | Sí | Sí | — | No (manage ❌) | has_permission | PASS |
| Document Intake | `documents.manage` | ❌ | No | Bloqueada | — | No | No | has_permission | PASS |
| Compliance Center | `documents.view` | ✅ | Sí | Sí | Sí | — | — | has_permission | PASS |
| Applications | `workers.view` | ✅ | Sí | Sí | Sí | — | — | has_permission | PASS |
| Messages / Announcements | `announcements.*` | ✅ (edit/pin/publish) | Sí | Sí | Sí | Sí | Sí | has_permission | PASS |
| Notifications | filtro por permiso | parcial | Sí | Sí | solo propias + operativas permitidas | — | — | `useNotifications` + RLS (`has_role admin` = false) | PASS |
| Live Map | `attendance.view` | ❌ | No | Bloqueada | — | — | — | has_permission | PASS |
| Front Desk | `attendance.view`/`workers.view` | ✅ (workers.view) | Sí | Sí | Sí | Sí | Sí | has_permission | PASS (esperado) |
| Users | `users.manage` | ❌ | No | Bloqueada | No | No | No | owner-only | PASS |
| Roles / Permissions | `roles.manage` | ❌ | No | Bloqueada | No | No | No | owner-only + `admin_set_user_access` | PASS |
| Company Settings | `company.settings` | ❌ | No | Bloqueada | No | No | No | owner-only | PASS |
| Billing / Integrations | `company.settings` | ❌ | No | Bloqueada | parcial (invoices SELECT) | No | No | membresía | ⚠️ FAIL (P1) |

## 6. Cadena de seguridad (5 niveles)

- **UI:** correcta en sidebar/CTAs (todo por `can()` / `nav-permissions`), salvo los
  componentes que aún usan `canAccessAdminForCompany` (P1-2).
- **Router:** `RouteAuthorizationGate` + `routePermissionsFor` con match por prefijo:
  todas las rutas de horas, nómina, usuarios, roles y empresa quedan bloqueadas. PASS.
- **Lectura de datos:** FAIL en `time_entries` (módulo `shifts.view`) e `invoices`
  (SELECT solo por membresía).
- **Acciones:** correctas en servicios/staffing; fuga en correcciones de horas.
- **Mutación/RLS/RPC:** FAIL en `time_entries` INSERT/UPDATE.

## 7. Rutas accesibles (efectivas)

`/app` home, `/app/command-center`, `/app/today`, `/app/needs-attention`,
`/app/ops`, `/app/ops-center`, `/app/daily-ops`, `/app/shifts`, `/app/shift-ops`,
`/app/shift-requests`, `/app/service-requests`, `/app/comparison`,
`/app/staffing-center`, `/app/staffing-requests`, `/app/ai-workforce`,
`/app/employees`, `/app/people`, `/app/workers`, `/app/workforce`,
`/app/directory`, `/app/applications`, `/app/referrals`, `/app/requests`,
`/app/documents`, `/app/w9`, `/app/1099`, `/app/compliance-center`,
`/app/clients`, `/app/locations`, `/app/client-experience`, `/app/announcements`,
`/app/chat`, `/app/quality`, `/app/front-desk`, `/app/backfill-shift`,
`/app/bulk-import-shifts`, `/app/import-schedule`.

Bloqueadas: timeclock, attendance, live-map, kiosk, daily-close, todas las de
payroll/periodos/reportes, validation-center, users, permissions, admin,
company-config, billing, invoicing, activity, y todas las `platformOnly`.

## 8. Datos accesibles

Servicios, asignaciones, clientes (lectura), ubicaciones (lectura/edición),
personas (lectura, incluida PII de contacto vía `workers.view`), documentos
(lectura), anuncios. **Fuera de allowlist pero accesibles:** `time_entries`
(lectura y escritura) e `invoices` (lectura).

## 9. Mutaciones accesibles

Permitidas y correctas: crear/editar/publicar/duplicar servicios, asignar,
reemplazar y quitar trabajadores, editar ubicaciones, publicar anuncios.
**Indebidas:** insertar/editar `time_entries`, solicitar correcciones de horas,
crear personas vía Emergency Worker.

## 10. Bypasses legacy encontrados

### 🔴 P0-1 — `time_entries` gobernado por el módulo `shifts`
`public.permission_catalog()` mapea `shifts/edit` a `service.edit|create|publish|
staffing.*` y `shifts/view` a `service.view|staffing.view`. Las políticas
`Managers can view/insert/edit time_entries` usan
`has_module_permission(...,'shifts','view'|'edit')`, por lo que **`service.edit`
concede escritura sobre las horas reales**. Verificado:
`has_module_permission(sebastián, MyStaff,'shifts','edit') = true` pese a que su
override de MyStaff tiene `shifts.can_edit = false` y a que no posee ningún
`time_entries.*`. Impacto directo sobre nómina (que se calcula con horas reales).

### 🔴 P0-2 — `can_request_shift_correction`
Devuelve `true` por `can_manage_shift_company` (= `staffing.assign OR
service.edit`), abriendo el flujo de corrección de horas a un rol sin
`time_entries.review/adjust`.

### ⚠️ P1-1 — `invoices_select_company_members`
SELECT autorizado solo por `user_company_ids`: cualquier miembro lee facturación.

### ⚠️ P1-2 — `canAccessAdminForCompany` (`src/hooks/useAuth.tsx:709`)
Sigue devolviendo `true` para `company_users.role='admin'`. Consumido por ~20
archivos (`EmergencyWorkerDialog`, `ShiftChatPanel`, `PayrollReviewQueue`,
`AdminSummaryCard`, `Employees`, `ShiftDetailDialog`, `ShiftClosureCard`,
`ShiftAttendancePanel`, `LocationProfile`, `MobileShiftOperationsSheet`, …).
La ruta bloquea las pantallas de nómina, pero los componentes embebidos en
superficies permitidas siguen habilitando controles administrativos.

### ⚠️ P1-3 — chequeos por rol residuales
`src/components/audit/AuditPanel.tsx:49`, `src/pages/admin/Dashboard.tsx:763`,
`src/pages/admin/DocumentIntakeCenter.tsx:93`, `src/hooks/useDebugMode.tsx:29`.

### ⚠️ P2 — `has_role(auth.uid(),'admin')` en RLS
Políticas `ALL` sobre `scheduled_shifts`, `shift_assignments`, `time_entries`,
`pay_periods`, `movements`, `notifications`, `historical_payroll_entries`.
**No afecta a Sebastián** (no tiene rol global `admin`), pero es una vía paralela
a `has_permission`.

### ⚠️ P2 — 228 políticas / 108 tablas con autorización solo por membresía
(`user_company_ids`) frente a 42 políticas ya migradas a `has_permission`.

### ✅ Cerrados y verificados
`user_is_company_admin` (false para Sebastián), `has_module_permission/3`
(solo staff de plataforma), `has_action_permission` con compañía,
filas legacy `company_id IS NULL` (ignoradas), `admin_set_user_access`
(solo dueño/plataforma, con anti-autoescalada), `admin_get_employees_with_fiscal`
(`workers.view`), `publish_shift_draft` y `assign_worker_to_shift`
(`can_manage_shift_company` → `has_permission`).

## 11. Verificación cross-tenant

Misma persona, misma membresía `admin`, mismo `operating_role_key`, **autoridad
distinta por compañía** gracias a los overrides company-scoped:

| Permiso | MyStaff | Quality |
|---|---|---|
| `service.close` / `service.reopen` | ❌ | ✅ |
| `workers.view` | ✅ | ❌ |
| `documents.view` | ✅ | ❌ |
| `announcements.edit/pin/publish` | ✅ | ❌ |
| `locations.edit` | ✅ | ❌ |
| Total | **16/41** | **12/41** |

No hay mezcla de autoridad entre tenants: cada evaluación resuelve con
`user_id + company_id`. ✅ PASS.

## 12. Riesgos

1. Integridad de nómina: las horas reales son mutables por un rol de servicios (P0-1/P0-2).
2. Confidencialidad financiera: facturación legible por cualquier miembro (P1-1).
3. Deriva UI↔motor: el flag de rol en frontend reintroduce autoridad visual (P1-2/P1-3).
4. Superficie amplia de RLS solo-membresía (P2), pendiente de la migración global.

## 13. Hallazgos por severidad

- **P0:** P0-1 (`time_entries` vía módulo `shifts`), P0-2 (`can_request_shift_correction`).
- **P1:** P1-1 (invoices), P1-2 (`canAccessAdminForCompany`), P1-3 (chequeos por rol).
- **P2:** `has_role('admin')` en RLS, 228 políticas solo-membresía, empleado de MyStaff sin `user_id`.

## 14. Qué NO se tocó

Auth, RLS (solo lectura de catálogo), payments, bookings, chat, payroll,
`time_entries`, `shift_assignments`, `scheduled_shifts`, closeouts, documentos,
edge functions, tenants, datos de producción, campañas y lógica de partners.
No se cambió `operating_role_key`, `company_users.role`, overrides, membresías,
permisos ni ningún dato de Sebastián.

## 15. QA ejecutado

Solo lectura: identidad y membresías; `has_permission` sobre los 41 permisos del
catálogo en ambas compañías; `user_is_company_admin`, `is_global_owner`,
`is_company_owner`, `has_role`, `has_module_permission/3` y `/4`,
`has_action_permission`; overrides persistidos; `permission_catalog()` y su
mapeo legacy; definiciones de RPC (`publish_shift_draft`,
`assign_worker_to_shift`, `can_manage_shift_company`,
`can_request_shift_correction`, `admin_set_user_access`,
`admin_get_employees_with_fiscal`); políticas RLS de las tablas críticas;
inventario de bypasses en frontend (`rg`); mapa `nav-permissions` y
`RouteAuthorizationGate`.
QA desktop y móvil por análisis de código: sidebar, header, botón Crear, URLs
directas, drawer de servicio, Command Center, notificaciones, quick actions,
menú "…", bottom sheets y navegación móvil comparten los mismos gates `can()`,
salvo los componentes de P1-2.

---

## Respuestas explícitas

| Pregunta | Respuesta |
|---|---|
| ¿Puede crear servicios? | **Sí** (`service.create`) |
| ¿Editarlos? | **Sí** (`service.edit`) |
| ¿Publicarlos? | **Sí** (`service.publish`) |
| ¿Duplicarlos? | **Sí** |
| ¿Asignar trabajadores? | **Sí** (`staffing.assign`) |
| ¿Reemplazarlos? | **Sí** (`staffing.replace`/`remove`) |
| ¿Invitar trabajadores? | **No** por invitación formal; **sí** puede crear personas por Emergency Worker (P1-2) |
| ¿Modificar horas? | **No debería, pero SÍ puede** a nivel de datos (P0-1/P0-2) |
| ¿Aprobar closeout? | **No** |
| ¿Acceder a payroll? | **No** (salvo lectura de `invoices`, P1-1) |
| ¿Aprobar payroll? | **No** |
| ¿Administrar users? | **No** |
| ¿Administrar roles/permisos? | **No** |
| ¿Company settings? | **No** |
| ¿Billing / integrations? | **No** en UI; lectura parcial de facturación en datos (P1-1) |
| ¿Permisos de otro tenant? | **No**, autoridad separada por compañía |
| ¿Bypass que ignore `operating_role_key` + `has_permission`? | **Sí**: P0-1, P0-2, P1-1, P1-2, P1-3 |
