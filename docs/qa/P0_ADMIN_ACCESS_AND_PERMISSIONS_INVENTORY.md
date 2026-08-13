# P0 — ADMIN ACCESS & PERMISSIONS INVENTORY

Auditoría de solo lectura. No se modificó código, datos, RLS ni roles.
Fecha: 2026-08-13 · Alcance: sistema de permisos administrativos existente.

---

## 1. ROLES

### 1.1 Roles globales (`public.user_roles`, enum `app_role`)

| Rol | Propósito real | Definido en | Alcance |
|---|---|---|---|
| `developer` | Acceso total plataforma (staff Stafly) | enum `app_role` + `user_roles` | Global cross-tenant |
| `owner` | Dueño de plataforma | idem | Global cross-tenant |
| `founder` | Vistas finanzas/admin de plataforma (sin escritura payroll) | enum + `GLOBAL_CROSS_TENANT_ROLES` en `src/hooks/useAuth.tsx` | Global cross-tenant |
| `admin` | Admin (hoy se usa tanto global como por compañía) | enum + `user_roles` + `company_users.role` | **Ambiguo** (ver §7) |
| `manager` | Admin acotado por permisos | idem | Ambiguo |
| `supervisor` | Admin muy acotado | idem | Ambiguo |
| `employee` | Trabajador (portal) | enum + derivado de `employees.user_id` | Global |

Nota: `company_owner` **no existe en el enum** `app_role`; solo existe como string en `company_users.role` y en el tipo TS `AppRole` (`src/hooks/useAuth.tsx:14`).

### 1.2 Roles por compañía (`public.company_users`)
Columnas: `id, company_id, user_id, role (text), created_at`.
Valores observados en datos: `company_owner`, `admin`, `manager`, `employee`.
Es **text libre**, sin FK ni enum → no hay validación de valores.

### 1.3 Conjuntos de roles en frontend
`src/hooks/useAuth.tsx`:
- `ADMIN_ROLES = {developer, owner, company_owner, admin, manager, supervisor}`
- `GLOBAL_CROSS_TENANT_ROLES = {developer, owner, founder}`
`src/lib/roles.ts`: `ADMIN_LEVEL_ROLES = {developer, owner, company_owner, admin}`, `GATED_ADMIN_ROLES = {manager, supervisor}`.
`src/lib/shifts/shift-permissions.ts`: `SHIFT_MANAGER_GLOBAL = {developer, owner, founder}`.
→ Tres definiciones distintas de "quién es admin".

---

## 2. MEMBERSHIPS — flujo real

```text
auth.users
   │
   ├── public.user_roles (user_id → app_role)         ROL GLOBAL (cross-tenant)
   │
   ├── public.company_users (user_id + company_id → role text)   MEMBRESÍA + ROL POR COMPAÑÍA
   │
   ├── public.employees (user_id + company_id)        IDENTIDAD LABORAL (portal)
   │
   └── public.profiles (user_id)                      DATOS DE PERSONA
```

Resolución en `useAuth.fetchUserData()`:
1. lee `user_roles` → `allRoles` + `role` (mayor prioridad).
2. lee `company_users` → `companyRoles: {companyId: role}`.
3. lee `employees` activos → `allEmployeeIds`, añade rol `employee`.
4. `getRoleForCompany(companyId)` = rol global cross-tenant **o** `companyRoles[companyId]`.
5. `canAccessAdminForCompany(companyId)` = ese rol ∈ `ADMIN_ROLES`.

**Hallazgo crítico:** los permisos granulares solo se cargan si el rol *global* resuelto es `manager` o `supervisor` (`useAuth.tsx:246`). Si el usuario es `admin` en `company_users` pero no tiene `user_roles`, `permissions` y `actionPermissions` quedan **vacíos**; y si su rol global es `admin`, `hasActionPermission()` devuelve `true` para **todo** (líneas 688 y 700).

---

## 3. PERMISOS GRANULARES — SÍ EXISTEN (dos sistemas)

### 3.1 `module_permissions` (view/edit/delete por módulo)
Columnas: `user_id, module, can_view, can_edit, can_delete`. **NO tiene `company_id`** → es global por usuario, no por tenant.

Módulos definidos en UI (`src/pages/admin/Users.tsx:43`): `employees, periods, import, concepts, movements, summary, reports, shifts, timeclock, clients, locations, announcements, chat`.
Además el código consulta `payroll` (`useTodayHubPermissions.ts:85`) — módulo **no existe** en la lista de la UI.

### 3.2 `action_permissions` (acción booleana, por compañía)
Columnas: `user_id, company_id, action, granted`. Sí es tenant-scoped.

Acciones definidas en `src/pages/admin/Permissions.tsx` (ACTION_GROUPS):
- **Turnos:** `crear_turno`, `editar_turno`, `eliminar_turno`, `asignar_turno`, `cerrar_turno`, `reabrir_turno`
- **Reloj:** `editar_clock`, `aprobar_clock`, `cerrar_dia`, `reabrir_dia`
- **Nómina:** `crear_nomina`, `editar_nomina`, `aprobar_nomina`, `exportar_nomina`, `ver_salarios`, `ver_reportes`
- **Feed:** `publicar_anuncio`, `editar_anuncio`, `eliminar_anuncio`, `fijar_anuncio`
- **Compensación:** `manage_compensation`, `import_payroll_compensation`, `approve_compensation_changes`, `view_compensation_history`, `edit_compensation_matrix`, `edit_compensation_analysis`
- **Configuración:** `configurar_empresa`, `configurar_nomina`

Acciones presentes en datos pero **no editables en la UI**: `approve_reconciliation_period`, `publish_reconciliation_period`, `reopen_reconciliation_period`, `edit_closed_period`, `view_period_audit`.
Acciones consumidas en código pero **inexistentes en UI y datos** (siempre falsas para manager/supervisor): `aprobar_novedades` (`Movements.tsx:59`), `reabrir_periodo` (`PayPeriods.tsx:160`), `alerta_no_clock` / `alerta_fuera_geofence` (solo en plantilla).

### 3.3 Plantillas (`role_templates`) — existen, 4 del sistema
| Plantilla | Acciones |
|---|---|
| Supervisor de Turnos | crear/editar/eliminar/asignar/cerrar/reabrir turno |
| Supervisor de Reloj | editar_clock, aprobar_clock, cerrar_dia, reabrir_dia, alerta_no_clock, alerta_fuera_geofence |
| Gestor de Nómina | crear/editar/aprobar/exportar nómina, ver_salarios, ver_reportes |
| Administrador de Empresa | configurar_empresa, ver_reportes, ver_salarios, exportar_nomina |

RPC `apply_role_template(_user_id,_company_id,_template_id,_replace)` existe y escribe en `action_permissions`.

---

## 4. RUTAS PROTEGIDAS

No hay guard por permiso a nivel de router. Las rutas `/app/*` se protegen en 3 capas:

```text
ruta /app/*  →  AdminLayout  →  canAccessAdminForCompany(selectedCompanyId)   (acceso admin sí/no)
             →  CompanyRequiredGuard                                          (hay compañía seleccionada)
             →  ModuleGate moduleKey="x"                                      (PLAN de facturación, no permisos)
             →  chequeo dentro de la página (role === 'owner' || hasModuleAccess(...))
```

| Ruta | Guard de router | Permiso real |
|---|---|---|
| `/app/shifts` | CompanyRequiredGuard | dentro de la página: `hasModuleAccess("shifts","edit")` para editar; **ver** no está gateado |
| `/app/employees` | CompanyRequiredGuard | ninguno específico; sidebar filtra por `hasModuleAccess("employees","view")` |
| `/app/clients` | CompanyRequiredGuard + ModuleGate(clients) | `hasModuleAccess("clients","edit"/"delete")` |
| `/app/locations` | CompanyRequiredGuard + ModuleGate(locations) | `hasModuleAccess("locations","edit"/"delete")` |
| `/app/periods`, `/summary`, `/reports`, `/movements`, `/import` | CompanyRequiredGuard + ModuleGate(plan) | acciones sueltas: `aprobar_nomina`, `reabrir_periodo`(inexistente) |
| `/app/payroll-settings` | CompanyRequiredGuard | `hasActionPermission("configurar_nomina")` para editar |
| `/app/users` | CompanyRequiredGuard | chequeo interno de rol |
| `/app/permissions` | CompanyRequiredGuard | `role ∈ {owner, developer, admin}` (`Permissions.tsx:239`) |
| `/app/settings` | ninguno | página de plataforma |
| `/app/admin` (hub) | ninguno | `role ∈ {owner, developer}` (`AdminHub.tsx:47`) |

**Nada impide entrar por URL directa** a una página cuyo módulo esté apagado para un manager: el sidebar la oculta (`AdminLayout.tsx:252`, `AdminSidebar.tsx:239`) pero no hay redirect. La protección efectiva de datos queda en RLS.

---

## 5. UI EXISTENTE

| Ruta | Estado | Qué permite | Qué falta |
|---|---|---|---|
| `/app/permissions` | Funcional | Elegir usuario `manager`/`admin` de la compañía, activar/desactivar las 28 acciones agrupadas, aplicar plantillas, guardar en `action_permissions` con `company_id` + log de actividad | No muestra las 5 acciones de reconciliación; no permite crear plantillas; no cubre `module_permissions`; no valida que el usuario tenga rol global manager/supervisor (sin él los permisos **no se leen**) |
| `/app/users` | Funcional | Asigna rol, compañías, y edita `module_permissions` (view/edit/delete por módulo) | El upsert es `onConflict: "user_id,module"` → **sin compañía**: cambiar un módulo afecta todas las compañías del usuario |
| `/app/admin` | Funcional | Hub owner/developer | — |

---

## 6. BACKEND — cómo se valida

```text
JWT (auth.uid())
   │
   ├── has_role(uid, app_role)             → user_roles, con jerarquía implícita
   ├── is_global_owner(uid)                → 187 políticas RLS
   ├── is_company_owner(uid, company)      → 49 políticas
   ├── has_company_role(uid, company, rol) → company_users (+ bypass company_owner y global owner), 22 políticas
   ├── user_is_company_admin(uid, company) → has_role('admin') OR is_company_owner OR has_company_role('admin'), 88 políticas
   ├── has_module_permission(uid, module, perm) → 84 políticas   ⚠ SIN company_id
   ├── has_action_permission(uid, company, action) → 33 políticas ✅ con company_id
   └── can_manage_shift_company(company)   → 5 políticas
```

Semántica de `has_action_permission`: `developer|owner|admin` (global) ⇒ true siempre; `company_owner` ⇒ true siempre; `manager|supervisor` (global) ⇒ lee `action_permissions`; cualquier otro ⇒ false.
Semántica de `has_module_permission`: idéntica, pero el fallback de `company_owner` **no comprueba de qué compañía** (`EXISTS ... role='company_owner'` sin `company_id`).

No hay claims JWT personalizados ni middleware: todo se resuelve con funciones `SECURITY DEFINER` invocadas desde RLS y desde el cliente.

---

## 7. DUPLICIDADES DETECTADAS

1. **Dos fuentes de rol:** `user_roles` (global) y `company_users.role` (por compañía), sin contrato único. `admin` significa cosas distintas en cada una.
2. **Dos sistemas de permisos:** `module_permissions` (view/edit/delete, sin compañía) y `action_permissions` (booleano, con compañía). Se administran en pantallas distintas (`/app/users` vs `/app/permissions`).
3. **`company_owner` fantasma:** existe como string en `company_users` y en el tipo TS, no en el enum `app_role`.
4. **Tercera capa no-permiso:** `ModuleGate` bloquea por **plan de facturación** (`company_modules`/`useSubscription`) usando las mismas claves de módulo → un usuario puede tener permiso y aun así ver "upgrade".
5. **Hardcode disperso:** ~30 sitios con `role === "owner" || role === "admin" || hasModuleAccess(...)`. Cada pantalla define su propia regla.
6. **Tres definiciones de "admin"** en frontend (`ADMIN_ROLES`, `ADMIN_LEVEL_ROLES`, `SHIFT_MANAGER_GLOBAL`).
7. **Puerta de carga rota:** `useAuth` solo carga permisos si el rol global es `manager|supervisor`; para todos los demás son arrays vacíos o bypass total.
8. **Acciones huérfanas:** `aprobar_novedades`, `reabrir_periodo` se consultan pero no se pueden otorgar desde ninguna UI.

---

## 8. CASO REAL — permisos efectivos hoy

| Persona | user_id | Rol global | Membresías | module_permissions | action_permissions |
|---|---|---|---|---|---|
| **Jorge Cortes** | 9bb72088… | `admin` | Quality Staff: `company_owner` · My Staff Solution: `admin` | ninguno | ninguno **pero irrelevante: rol global `admin` ⇒ bypass total en UI y RLS** |
| **Keury Camilo** | 85000c53… | `admin` | Quality: `company_owner` · MyStaff: `company_owner` · Parceros: `manager` | ninguno | 38 filas granted (herencia histórica) — igualmente bypass total por rol global `admin` |
| **María Llivichuzca** | 846e29dc… | `employee` | ninguna | ninguno | ninguno → **sin acceso admin** |
| **Sebastián Villegas** | e4793c12… | `manager` | Quality: `admin` · MyStaff: `admin` | shifts(v,e) · employees(v,e) · clients(v,e) · locations(v,e) · import(v,e) · announcements(v,e) · chat(v,e) · reports(v) · timeclock(v) · periods/concepts/movements/summary: nada | ✅ crear_turno, editar_turno, eliminar_turno, asignar_turno · ❌ cerrar_turno, reabrir_turno, todo clock, toda nómina, configurar_empresa, configurar_nomina, ver_salarios |
| **Duván Gallego** (ficha operativa, 4338b336…) | — | `supervisor` | Quality: `admin` · MyStaff: `admin` | shifts(v,e) · reports/timeclock/announcements/chat/employees/clients/locations (solo v) · import/periods/concepts/movements/summary: nada | ✅ aprobar_clock, editar_clock, cerrar_dia, reabrir_dia, cerrar_turno, reabrir_turno · ❌ crear_turno, editar_turno, eliminar_turno, toda nómina, configuración |
| Duván Gallego (segunda cuenta, 623062a7…) | — | `manager` | **ninguna membresía** | 13 módulos (mayoría solo view) | ninguno |

Nota importante para Sebastián y Duván: al ser `admin` en `company_users`, `canAccessAdminForCompany` les da entrada al panel, pero como su rol **global** es `manager`/`supervisor`, sus permisos granulares sí se aplican. Es una combinación frágil: si alguien les diera `user_roles.role = 'admin'`, obtendrían bypass total.

También existe otra cuenta Duván sin membresías: sus 13 `module_permissions` no aplican a ninguna compañía.

---

## 9. CAPACIDAD ACTUAL — ¿se puede hacer hoy sin escribir código?

**SÍ.** De hecho ya está configurado casi exactamente así para Sebastián Villegas.

Procedimiento (solo UI):
1. Entrar como Jorge/Keury a `/app/users`, editar a Sebastián y dejar en `module_permissions`: `shifts` = view + edit; apagar `periods`, `summary`, `concepts`, `movements`, `reports` (o dejar solo view).
2. Ir a `/app/permissions`, seleccionar la compañía, seleccionar a Sebastián y activar `crear_turno`, `editar_turno`, `asignar_turno`; dejar en off `configurar_empresa`, `configurar_nomina`, `crear_nomina`, `editar_nomina`, `aprobar_nomina`, `exportar_nomina`, `ver_salarios`. Guardar.
3. Verificar que su rol global sea `manager` o `supervisor` (si fuera `admin` global, ningún permiso se aplicaría).

Con dos matices honestos:
- **"Publicar turnos" no existe** como permiso. No hay `publicar_turno` en el catálogo; la publicación va incluida en `editar_turno` / `hasModuleAccess("shifts","edit")`.
- **"Roles" no es un permiso**: `/app/permissions` se gatea por `role ∈ {owner, developer, admin}` global y `/app/admin` por `{owner, developer}`, así que Sebastián queda fuera automáticamente. Correcto por accidente, no por diseño.
- Los módulos se guardan **sin `company_id`**: apagar `periods` a Sebastián lo apaga en Quality y en MyStaff a la vez.

---

## 10. RECOMENDACIÓN (sin arquitectura nueva)

### ¿Qué porcentaje ya existe?
**≈70%.**
- Modelo de datos: 85% (roles, membresías, dos tablas de permisos, plantillas, RPC).
- Enforcement backend: 80% (296 políticas RLS ya usan los helpers).
- UI de administración: 70% (dos pantallas funcionales, pero divididas).
- Contrato único / consistencia: 25%.

### ¿Qué falta realmente?
1. **Un solo resolver de permisos** en frontend (hoy hay ~30 hardcodes y 3 definiciones de admin).
2. **`company_id` en `module_permissions`** — es la única brecha de tenancy real del sistema.
3. **Cerrar el bypass de carga** en `useAuth` (permisos solo se leen para manager/supervisor global).
4. **Catálogo único de acciones** compartido por UI, código y plantillas (hoy hay acciones consultadas que nadie puede otorgar).
5. **Guard de ruta por permiso** (hoy solo se oculta el enlace).
6. Faltan permisos que el negocio ya pide: publicar turno, revisar time entries, gestionar documentos.

### ¿Qué se reutiliza tal cual?
- `action_permissions` + `has_action_permission` (ya tenant-scoped, ya en 33 políticas).
- `role_templates` + `apply_role_template`.
- La pantalla `/app/permissions` como superficie única de administración.
- `user_roles` / `company_users` como capa de rol; no hace falta ningún rol nuevo.

**Conclusión:** no se necesita un sistema nuevo. Se necesita consolidar el que ya existe: un catálogo, un resolver, y `company_id` en `module_permissions`.
