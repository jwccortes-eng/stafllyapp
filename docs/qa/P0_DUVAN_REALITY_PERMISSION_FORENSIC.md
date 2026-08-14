# P0 — DUVÁN REALITY PERMISSION FORENSIC

Fecha: 2026-08-14 (UTC) · Modo: **solo auditoría** (no se modificó código, roles, overrides ni datos).
Usuario auditado: **Duván Gallego** — auth user `4338b336-0f65-4285-9d50-6abcc28e5645`.

---

## 1. Identidad y membresías (separadas por compañía)

### Quality Staff by Keury
| Campo | Valor |
|---|---|
| company_id | `00000000-0000-0000-0000-000000000001` (es el id REAL de Quality, no un placeholder) |
| employee_id | `4d603205-6937-4159-897e-b3fcd44fbf5f` (activo, `user_id` vinculado) |
| auth user_id | `4338b336-…5645` |
| membership (`company_users.id`) | `ffe9e812-f58e-4d78-9fee-fa7044cef3e3` |
| membership role | `admin` |
| **operating_role_key** | **NULL** |
| compañía activa | sí |
| scope efectivo | COMPANY para navegación; **ningún permiso concedido** (ver §3) |

### My Staff Solution LLC
| Campo | Valor |
|---|---|
| company_id | `37f92f75-7af4-4496-aa10-793e14b09ed9` |
| employee_id | `cad09ca0-065e-4e4b-a6ab-58582592c9cd` (activo, `user_id` vinculado) |
| membership | `004c4233-1073-47ee-a2a0-eb587d6507fc` |
| membership role | `admin` |
| **operating_role_key** | **`time_closeout_admin`** |
| compañía activa | sí |
| scope efectivo | COMPANY sobre horas/cierre |

Otros registros con el mismo apellido, sin `user_id` (no son sesión de Duván): `Daniela Gallego Villegas` (Quality) y `Duvan Gallego` (Parceros `0b58f1d4…`, sin membresía `company_users`).

**Rol global (`user_roles`): `supervisor`.** No da acceso de plataforma, pero **sí activa una rama legacy peligrosa** en RLS (§7).

---

## 2. Role truth (lo que resuelve el runtime)

| Compañía | resolve_operating_role (SQL) | resolveOperatingRoleKey (frontend) | Coinciden |
|---|---|---|---|
| Quality | `admin_unassigned` | `admin_unassigned` | Sí |
| MyStaff | `time_closeout_admin` | `time_closeout_admin` | Sí |

- MyStaff = **Time & Closeout Administrator**, como se espera.
- Quality = **operating_role_key NULL** → cae en el rol sintético de solo lectura `admin_unassigned`. **No hay rol operativo persistido en Quality.**

---

## 3. Effective permission dump (mismo resolver de la app + `public.has_permission`)

Frontend (`evaluatePermission`) y backend (`has_permission`) devuelven **exactamente lo mismo** en las 41 claves del catálogo, para ambas compañías.

### Quality Staff — TODO denegado (41/41 false)

Motivo: existen **overrides explícitos negativos por compañía** que ganan sobre el default del rol.

| permission | base role (`admin_unassigned`) | override (company `0000…0001`) | efectivo | razón |
|---|---|---|---|---|
| service.view | true | módulo `shifts.view = false` | **false** | override niega |
| service.create | false | `crear_turno = false` | false | ni rol ni override |
| service.edit / publish | false | `editar_turno = false` | false | override niega |
| service.cancel | false | `eliminar_turno = false` | false | override niega |
| service.close / reopen | false | `cerrar_turno` / `reabrir_turno = false` | false | override niega |
| staffing.view | true | `shifts.view = false` | false | override niega |
| staffing.assign/replace/remove | false | `asignar_turno = false` | false | override niega |
| attendance.view / time_entries.view | true | `timeclock.view = false` | false | override niega |
| time_entries.review / adjust | false | `editar_clock = false` | false | override niega |
| time_entries.approve | false | `aprobar_clock = false` | false | override niega |
| closeout.close_day / reopen_day | false | `cerrar_dia` / `reabrir_dia = false` | false | override niega |
| workers.view / edit / documents / invite | view: true | `employees.* = false` | false | override niega |
| clients.view/edit, locations.view/edit | view: true | `clients.*`, `locations.* = false` | false | override niega |
| documents.view / manage | view: true | `employees.* = false` | false | override niega |
| announcements.* | false | `*_anuncio = false` | false | override niega |
| payroll.view/manage/approve/export, reports.view | false | `ver_salarios`, `editar_nomina`, `aprobar_nomina`, `exportar_nomina`, `ver_reportes = false` | false | override niega |
| payroll.settings | false | `configurar_nomina = false` | false | override niega |
| company.settings, users.manage, roles.manage | false | `configurar_empresa = false` | false | OWNER_ONLY + override |

### My Staff Solution — 11 permisos concedidos

| permission | base role (`time_closeout_admin`) | override | efectivo | razón |
|---|---|---|---|---|
| service.view | true | ninguno | **true** | rol concede |
| attendance.view | true | ninguno | **true** | rol concede |
| time_entries.view | true | ninguno | **true** | rol concede |
| time_entries.review | true | `editar_clock = true` | **true** | rol + override |
| time_entries.adjust | true | `editar_clock = true` | **true** | rol + override |
| time_entries.approve | true | `aprobar_clock = true` | **true** | rol + override |
| closeout.close_day | true | `cerrar_dia = true` | **true** | rol + override |
| closeout.reopen_day | true | `reabrir_dia = true` | **true** | rol + override |
| service.close | true | `cerrar_turno = true` | **true** | rol + override |
| service.reopen | true | `reabrir_turno = true` | **true** | rol + override |
| workers.view | true | ninguno | **true** | rol concede |
| service.create / edit / publish / cancel | false | `crear_turno`/`editar_turno`/`eliminar_turno = false` | false | rol no concede |
| staffing.view / assign / replace / remove | false | ninguno / `asignar_turno` ausente | false | rol no concede |
| payroll.view/manage/approve/export/settings | false | `*_nomina = false` | false | rol no concede |
| reports.view | false | ninguno | false | rol no concede |
| clients.*, locations.*, documents.*, workers.edit/invite/documents, announcements.* | false | ninguno | false | rol no concede |
| users.manage, roles.manage, company.settings | false | — | false | OWNER_ONLY |

**Autorización declarada = correcta.** El problema está en las capas que NO consultan este resolver (§4, §5, §7).

---

## 4. Runtime UI (sesión de Duván, membresía `admin` en ambas compañías)

`AdminSidebar` decide visibilidad con `isAdminLevelRole(getRoleForCompany(companyId))`, que incluye `admin` → **todos los enlaces de compañía se muestran** en Quality y MyStaff (`isLinkVisible`: `if (isAdminRole) return true`). `AdminLayout` solo verifica `canAccessAdminForCompany` (también membresía `admin`).

| Superficie | VISIBLE | OPENABLE | WRITE ACTIONS visibles | BACKEND ALLOWS | EXPECTED |
|---|---|---|---|---|---|
| Sidebar completo | Sí (ambas) | — | — | — | Quality: solo lo permitido (hoy nada) · MyStaff: Horas/Cierre |
| Command Center | Sí | Sí | acciones de turno | parcial (RLS por membresía) | MyStaff sí, Quality no |
| Services | Sí | Sí | Crear/Editar/Publicar visibles | **RLS permite INSERT/UPDATE** (§7) | oculto crear/editar en ambas |
| Team | Sí | Sí | Crear/Editar persona | **RLS permite (employees ALL)** | Quality: oculto · MyStaff: solo lectura |
| Clients | Sí | Sí | Crear/Editar | RLS `clients` ALL requiere `has_role(admin)` global → no; `billing_clients` sí vía `user_is_company_admin` | oculto en ambas |
| Job Sites (`locations_v2`) | Sí | Sí | Crear/Editar | **RLS permite** (`user_is_company_admin`) | oculto en ambas |
| Attendance / Time Clock | Sí | Sí | revisar/ajustar | Sí | correcto en MyStaff, **no** en Quality |
| Closeout | Sí | Sí | cerrar/reabrir | Sí | correcto en MyStaff, **no** en Quality |
| Payroll (rutas gated) | Enlace visible | **No** (PermissionGate) | — | No | debería estar oculto, no bloqueado |
| Users | Enlace visible | No (`users.manage`) | — | `company_users` ALL para admin no privilegiado → **RLS sí permite** | oculto |
| Permissions | Enlace visible | No (`roles.manage`) | — | `admin_set_user_access` exige owner → no | oculto |
| Operating Model / Access Console | Enlace visible | No | — | No | oculto |
| Company Settings | Enlace visible | No (`company.settings`) | — | parcial | oculto |
| Billing | Enlace visible | No (`company.settings`) | — | `invoices`/`billing_clients` **RLS permite** | oculto |
| Integrations / Payroll Settings | Enlace visible | No | — | No | oculto |
| Reports | Enlace visible | Sí (sin gate) | export | lectura por RLS | oculto (sin `reports.view`) |

**Defecto de producto confirmado:** el menú administrativo completo se muestra y varias rutas responden con pantalla de bloqueo. Viola la regla UX de permisos.

---

## 5. Direct URL test (evaluación con el estado real de Duván)

| Ruta | route visible | route loads | data loads | write succeeds |
|---|---|---|---|---|
| `/app/permissions` | sí (menú) | **no** — `PermissionGate roles.manage` | no | no (`admin_set_user_access` → `not_authorized`) |
| `/app/users` | sí | **no** — `users.manage` | no | **DB sí permitiría** (`company_users` policy "Company admins manage non-privileged users") |
| `/app/company-config` | sí | no — `company.settings` | no | no |
| `/app/billing` | sí | no — `company.settings` | no | **DB sí permitiría** en `invoices`, `invoice_lines`, `billing_clients` |
| `/app/payroll-*` | sí | no — `payroll.manage` / `payroll.settings` | no | no |
| `/app/integrations`, `/app/payroll-settings` | sí | no | no | no |
| `/app/reports` | sí | **sí** (sin `PermissionGate`) | sí | export sin `reports.view` |

Todas las pantallas administrativas visibles que terminan en bloqueo cuentan como defecto.

---

## 6. Action test (evaluación de autorización, sin escrituras)

| Acción | Quality (FE / BE `has_permission`) | MyStaff (FE / BE) | ¿RLS lo permitiría? |
|---|---|---|---|
| Crear servicio | no / no | no / no | **SÍ** — `Managers can insert scheduled_shifts` (§7) |
| Editar servicio | no / no | no / no | **SÍ** — misma policy |
| Publicar servicio | no / no | no / no | **SÍ** (UPDATE) |
| Crear/editar persona | no / no | no / no | **SÍ** — `Company admins can manage employees` |
| Cambiar rol de usuario | no / no | no / no | **SÍ** en `company_users` (no privilegiados) |
| Cambiar permisos | no / no | no / no | no (`admin_set_user_access` exige owner) |
| Aprobar payroll | no / no | no / no | no (policies exigen owner/plataforma) |
| Cambiar company settings | no / no | no / no | parcial (tablas de config con `user_is_company_admin`) |
| Cerrar/reabrir turno y día, ajustar/aprobar horas | no / no | **sí / sí** | sí |

---

## 7. Fallbacks detectados (causa raíz del exceso)

1. **`operating_role_key` NULL en Quality** → `admin_unassigned`. Hoy no concede nada porque hay overrides negativos, pero el rol operativo de Quality **no está declarado**.
2. **Navegación basada en rol de membresía**: `AdminSidebar` + `src/lib/roles.ts` (`isAdminLevelRole` incluye `admin`) y `AdminLayout`/`canAccessAdminForCompany`. No consumen `usePermissions`. Es la causa directa de "parece tener más privilegios".
3. **RLS no usa el resolver**: **0 de 721 policies** de `public` referencian `has_permission`. 47 tablas siguen autorizando por `user_is_company_admin(auth.uid(), company_id)`, que devuelve true para **membresía `admin`**.
4. **Fallback legacy en `has_module_permission`**: para usuarios con `user_roles` `manager`/`supervisor` (Duván es **supervisor global**) consulta `module_permissions` **ignorando `company_id`**. Duván conserva filas legacy con `company_id IS NULL` y `shifts: view+edit = true` → **puede INSERT/UPDATE `scheduled_shifts` en cualquiera de sus compañías**, incluida Quality donde tiene 0 permisos. Es el bypass más grave.
5. **`has_action_permission`** trata `user_roles.role='admin'` como acceso total (no aplica a Duván hoy, pero es la misma clase de fallback).
6. **Rutas sin gate**: `/app/reports` y otras superficies operativas siguen abiertas por layout.
7. **Componentes que no consumen `usePermissions`**: `src/lib/shifts/shift-permissions.ts` (`canManageShifts` → `canAccessAdminForCompany`), `ShiftDetailDialog`, `LiveShiftBoard`, `ShiftOpsBlocks`, `Employees`, `DocumentsCenter`, `LocationProfile`, `AdminSummaryCard`, entre otros (~40 archivos con chequeo por rol).
8. **Sesión/caché**: `useAuth` carga `companyOperatingRoles`, `module_permissions` y `action_permissions` al montar la sesión. No hay caché persistente de permisos, pero una pestaña abierta desde antes del hardening conserva el estado anterior hasta recargar.

---

## 8. Comparación con el modelo esperado

### MY STAFF — Duván
- Rol esperado: **Time & Closeout Administrator**
- Rol real: **`time_closeout_admin`** ✅
- Permisos esperados: service.view, attendance.view, time_entries.view/review/adjust/approve, closeout.close_day/reopen_day, service.close/reopen, workers.view
- Permisos efectivos: exactamente esos 11 ✅
- **Excesos**: ninguno en el resolver. Excesos reales: menú administrativo completo visible; RLS permite escribir `scheduled_shifts` (fallback §7.4), `employees`, `company_users` (no privilegiados), `invoices`/`billing_clients`, `locations_v2`.

### QUALITY STAFF — Duván
- Rol esperado según dato persistido: **ninguno (`operating_role_key` NULL)**
- Rol real: `admin_unassigned` (solo lectura), anulado por overrides negativos
- Permisos efectivos: **0 de 41**
- **Excesos**: sidebar administrativo completo visible; y a nivel RLS puede escribir `scheduled_shifts`, `employees`, `locations_v2`, `billing_clients`, `invoices` y `company_users` no privilegiados **sin tener ni un permiso concedido**.

---

## CIERRE OBLIGATORIO

1. **Quality:** `operating_role_key = NULL` (membresía `admin`).
2. **MyStaff:** `operating_role_key = time_closeout_admin`.
3. **Permisos efectivos:** Quality **0/41**; MyStaff **11/41** (ver §3).
4. **Excesos:** en autorización declarada, ninguno. En realidad operativa: visibilidad de todo el menú admin en ambas compañías y capacidad de escritura vía RLS sobre servicios, personas, ubicaciones, facturación y membresías no privilegiadas.
5. **Origen del exceso:** **no viene del rol ni de los overrides** — viene de (a) navegación por rol de membresía (`isAdminLevelRole`/`canAccessAdminForCompany`), (b) RLS legacy `user_is_company_admin` en 47 tablas, (c) el fallback `has_module_permission` que ignora `company_id` y se dispara por su rol global `supervisor` + filas legacy `company_id IS NULL`.
6. **¿Frontend y `has_permission` coinciden?** Sí: 41/41 claves idénticas en ambas compañías. La divergencia real es **resolver vs RLS**, no FE vs BE.
7. **¿Puede ejecutar escrituras fuera de responsabilidad?** **Sí.** Al menos INSERT/UPDATE de `scheduled_shifts` en ambas compañías (incluida Quality con 0 permisos), y gestión de `employees`, `locations_v2`, `billing_clients`/`invoices` y `company_users` no privilegiados.
8. **¿Los 17 tests cubrían este usuario?** **No.** Son unitarios sobre el resolver puro; no cubren estas dos membresías reales, ni RLS, ni el fallback de `has_module_permission`, ni la visibilidad del sidebar.
9. **¿Relogin?** Recarga sí (el estado de autorización se recompone al montar la sesión); relogin completo no es necesario. Toda pestaña abierta desde antes del hardening debe recargarse.
10. **Veredicto para Duván: 🔴 NO GO.** La autorización declarada es correcta, pero la superficie visible y la capa RLS todavía le conceden alcance de administrador de compañía en Quality y MyStaff.

### Remediación propuesta (no ejecutada)
1. Migrar `AdminSidebar`, `AdminLayout` y `src/lib/roles.ts` a `usePermissions` (ocultar módulo cuando no haya ningún permiso dentro).
2. Sustituir `user_is_company_admin` por `has_permission` en las policies de escritura (47 tablas).
3. Eliminar el fallback sin `company_id` de `has_module_permission` y `has_action_permission`, y depurar las filas legacy `company_id IS NULL`.
4. Declarar el `operating_role_key` de Duván en Quality.
5. Añadir tests de realidad por usuario/compañía (FE + `has_permission` + RLS con `set local role`).
