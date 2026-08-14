# P0 — OPERATIONAL SECURITY CERTIFICATION

**Fecha:** 2026-08-14 · **Tipo:** auditoría (sin cambios de código, permisos, RLS ni datos)
**Pregunta única:** ¿Cada rol operativo solo puede hacer aquello por lo que realmente es responsable?

**VEREDICTO: 🔴 NO GO** para certificación de roles operativos.
(Los Company Owners sí conservan el control correctamente; el problema es lo contrario:
todos los demás roles administrativos tienen, en la práctica, control de dueño.)

---

## 1. Hallazgo raíz (explica el caso Duván)

Duván **no** tiene un bug puntual: tiene, literalmente, membresía de administrador total.

Estado real en base de datos (lectura, sin modificar):

| Persona | Empresa | `company_users.role` | `operating_role_key` | Rol global (`user_roles`) |
|---|---|---|---|---|
| Jorge Cortés | MyStaff | `company_owner` | company_owner | admin |
| Keury Camilo | MyStaff | `company_owner` | company_owner | admin |
| Sebastián Villegas | MyStaff | **`admin`** | shift_admin | manager |
| Duván Gallego | MyStaff / Quality | **`admin`** | time_closeout_admin (MyStaff) · **NULL** (Quality) | supervisor |
| María Sanabria | MyStaff / Quality | **`admin`** | payroll_admin (MyStaff) · **NULL** (Quality) | manager |

El resolver (`permission-resolver.ts` y su espejo SQL `has_permission`) trata
`company_users.role = 'admin'` como **acceso total a la compañía**
(`COMPANY_FULL_ACCESS = {company_owner, admin}`). Con full access:

- todo permiso **sin** `legacyAction` y **sin** `legacyModule` devuelve `true` sin más
  → `users.manage`, `roles.manage`, `company.settings` (y equivalentes) quedan **concedidos
  a Duván, Sebastián y María**, en ambos tenants;
- el resto de permisos solo se niega si existe una **fila de override explícita en negativo
  para esa misma compañía**. Todo permiso sin fila = concedido.

Es decir: el modelo no es "rol operativo concede", es "admin lo puede todo y hay que
acordarse de negarlo permiso por permiso, empresa por empresa". Eso es una lista de
denegación incompleta por construcción.

### 1.1 Los overrides existentes están parcialmente inertes

Muchas filas `module_permissions` de estos usuarios apuntan a
`company_id = 00000000-0000-0000-0000-000000000001` (compañía placeholder que no
corresponde ni a MyStaff `37f92f75…` ni a Quality). El resolver solo mira la fila de la
compañía activa y, como fallback, `company_id IS NULL`. Esas filas **no niegan nada**:
son ruido que da falsa sensación de restricción en la consola.

### 1.2 `operating_role_key` no autoriza

El rol operativo explícito es hoy **puramente declarativo**: ni `evaluatePermission` ni
`has_permission` lo leen. Un `time_closeout_admin` y un `company_owner` con la misma
membresía `admin` obtienen exactamente el mismo acceso efectivo.

---

## 2. Hallazgo estructural: la capa de ruta no evalúa permisos

`src/App.tsx` — ~150 rutas bajo `/app`:

- **0 rutas** usan `PermissionGate`.
- Los únicos envoltorios son `CompanyRequiredGuard` (exige empresa seleccionada) y
  `ModuleGate` (exige **plan de facturación**, no permiso).
- `AdminLayout` deja entrar a todo el shell con `canAccessAdminForCompany`, cuyo
  `ADMIN_ROLES` incluye `developer, owner, company_owner, admin, manager, supervisor`.

Cobertura de autorización en pantalla:

| Métrica | Valor |
|---|---|
| Páginas en `src/pages/admin` | **122** |
| Páginas que llaman `usePermissions` | **16 (13%)** |
| Rutas con `PermissionGate` | **0** |
| Archivos que usan `PermissionGate` | 2 (el propio componente + AccessConsole) |

Pantallas sensibles **sin ninguna evaluación de permisos** (acceso por URL directa
para cualquiera que pase `canAccessAdminForCompany`, incluidos `manager` y `supervisor`):

`Users.tsx`, `Permissions.tsx`, `CompanyConfig.tsx`, `Billing.tsx`, `PlatformSettings.tsx`,
`Companies.tsx`, `PayPeriods.tsx`, `PayrollReviewQueue.tsx`, `PayrollMappings.tsx`,
`PayrollReconciliation*`, `PayrollPilotClose.tsx`, `Automations.tsx`, `Concepts.tsx`,
`InviteEmployees.tsx`, `Invoicing*`, `ActivityLog.tsx`, `Implementations.tsx`,
`MigrationCommandCenter.tsx`, `ImportWizard/ImportTimeClock/ImportPayrollExtras`,
`AdvancesLoans.tsx`, `ContractorW9.tsx`, `TaxForms1099.tsx`.

Único guardián real observado: `AccessConsole.tsx` (`can("roles.manage")`) — y ese permiso,
por §1, ya está concedido a los tres roles operativos.

---

## 3. Hallazgo de backend: bypass cross-tenant

```sql
user_is_company_admin(u, c) :=
  has_role(u,'admin')            -- rol GLOBAL, sin compañía
  OR is_company_owner(u,c)
  OR has_company_role(u,c,'admin')
```

Una fila `user_roles.role = 'admin'` (global, sin `company_id`) convierte al usuario en
administrador **de todas las compañías del ecosistema**. Hay cuentas con ese rol global que
no son staff de plataforma (p. ej. Edwin González en JKitchen, y dos cuentas técnicas en
MyStaff). Este predicado es el que autoriza `admin_set_user_access`, es decir:
**quien tenga `user_roles.admin` puede editar permisos y roles operativos en cualquier
tenant**.

Además existen **dos sobrecargas** de `admin_set_user_access` (5 y 6 argumentos). La de 5
argumentos no toca `operating_role_key`; una llamada mal tipada puede resolverse a la
versión antigua y guardar permisos sin registrar el cambio de rol.

Y sobre autorización propia: `admin_set_user_access` solo exige `user_is_company_admin(auth.uid())`.
Duván (membresía `admin`) puede **auto-concederse** cualquier override, incluido `aprobar_nomina`.
Ninguna verificación impide editar el propio registro.

---

## 4. Matriz por rol (acceso efectivo real, no el diseñado)

Leyenda: ✅ correcto · ⚠️ visible sin deber · ❌ puede ejecutar sin deber

### 4.1 Company Owner (Jorge / Keury)
Todo permitido. Anti-lockout activo (`users.manage`, `roles.manage`, `company.settings`
irrevocables). **✅ Correcto.** Único rol que hoy certifica.

### 4.2 Shift Administrator (Sebastián) — membresía `admin`

| Módulo | Visible | Abre | Edita | Debería | Correcto |
|---|---|---|---|---|---|
| Servicios / Calendario / Staffing / Cobertura | Sí | Sí | Sí | Sí | ✅ |
| Clientes / Job Sites | Sí | Sí | Sí (override `clients:edit` en MyStaff) | Sí | ✅ |
| Payroll (periodos, movimientos, conceptos, review queue) | Sí | Sí | **Sí — sin fila que lo niegue en `module_permissions` de la compañía activa** | No | ❌ |
| Payroll settings | Sí | Sí | `payroll.settings` = full access ⇒ concedido | No | ❌ |
| Usuarios / Roles / Permisos (`/app/users`, `/app/permissions`, AccessConsole) | Sí | Sí | Sí (`users.manage`/`roles.manage` = full access) | No | ❌ |
| Company Settings / CompanyConfig | Sí | Sí | Sí | No | ❌ |
| Integraciones / Import / Automations | Sí | Sí | Sí | No | ❌ |
| Billing / Invoicing | Sí | Sí | Sí | No | ❌ |

Sus overrides niegan `aprobar_nomina`, `crear_nomina`, `editar_nomina`, `exportar_nomina`,
`configurar_empresa`, `configurar_nomina` → esos concretos **sí** se bloquean.
Todo lo demás (usuarios, roles, permisos, facturación, integraciones, tenants) queda abierto.

### 4.3 Time & Closeout Administrator (Duván) — membresía `admin` en dos tenants

| Módulo | Visible | Abre | Edita | Debería | Correcto |
|---|---|---|---|---|---|
| Clock / Attendance / Closeout / Incidencias / Evidencias | Sí | Sí | Sí | Sí | ✅ |
| Crear clientes / Job Sites | Sí | Sí | **Sí** (override `clients/locations` solo `view`, pero `clients.edit` cae en full access porque la fila existe con `can_edit=false`… en **Quality** las filas están en la compañía placeholder ⇒ **no niegan nada**) | No | ❌ |
| Usuarios / Roles / Permisos | Sí | Sí | Sí (sin mapeo legacy ⇒ full access) | No | ❌ |
| Company Settings | Sí | Sí | Sí | No | ❌ |
| Payroll (approval, configuración, lotes) | Sí | Sí | En **MyStaff** parcialmente negado por override; en **Quality** `operating_role_key = NULL` y overrides apuntando al placeholder ⇒ **abierto** | No | ❌ |
| Integraciones / Billing / Tenant settings / Companies | Sí | Sí | Sí | No | ❌ |
| Import / Migration / Activity Log | Sí | Sí | Sí | No | ❌ |

### 4.4 Payroll Administrator (María) — membresía `admin`

| Módulo | Visible | Abre | Edita | Debería | Correcto |
|---|---|---|---|---|---|
| Payroll / Lotes / Novedades / Validaciones | Sí | Sí | Sí | Sí | ✅ |
| Crear / publicar servicios | Sí | Sí | Negado por overrides `crear_turno=false`, `editar_turno=false` en MyStaff; **abierto en Quality** (`shifts:v1e1d0` sin scope de compañía correcto) | No | ⚠️/❌ |
| Usuarios / Roles / Permisos / Company Settings | Sí | Sí | Sí | No | ❌ |
| Integraciones / Import | Sí | Sí | Sí (`import:v1e1d0`) | No | ❌ |

### 4.5 Worker
`AdminLayout` niega `/app` sin rol administrativo → redirige a `/portal`.
Portal gobernado por `PortalModuleGuard` + `usePortalModules`. **✅ Correcto**, sin hallazgos.

---

## 5. Riesgos

### 🔴 Críticos
1. **`company_users.role = 'admin'` = dueño de facto.** Tres roles operativos tienen acceso
   total por defecto; la restricción depende de filas de negación manuales e incompletas.
2. **`users.manage`, `roles.manage`, `company.settings` no son restringibles.** Sin mapeo
   legacy, el resolver devuelve `full` directamente. Duván, Sebastián y María pueden
   administrar usuarios, roles y permisos.
3. **Escalada de privilegios por auto-servicio.** `admin_set_user_access` no impide que el
   actor se edite a sí mismo; cualquiera con membresía `admin` puede concederse
   `aprobar_nomina` y borrar el rastro operativo (queda en `activity_log`, pero post-hoc).
4. **Bypass cross-tenant.** `user_is_company_admin` acepta `user_roles.role='admin'` global:
   administra cualquier compañía del ecosistema.
5. **Rutas sin autorización.** 0/150 rutas con `PermissionGate`; `/app/permissions`,
   `/app/users`, `/app/company-config`, `/app/billing`, `/app/payroll-*` son alcanzables por
   URL directa para `manager` y `supervisor`.
6. **Overrides escritos contra una compañía placeholder** (`00000000-…-0001`): la consola
   muestra restricciones que el motor ignora. Falsa sensación de seguridad.

### 🟠 Medios
7. `ADMIN_ROLES` incluye `manager` y `supervisor` → shell administrativo completo y menú
   visible para roles que no deberían verlo.
8. `ModuleGate` es gate de **plan**, no de permiso; hoy se usa como si fuera seguridad.
9. Doble sobrecarga de `admin_set_user_access` (5 vs 6 args): riesgo de guardar permisos sin
   persistir el rol operativo.
10. `operating_role_key` es NULL en Quality Staff para Duván y María: el modelo operativo
    declarado no cubre el segundo tenant.

### 🟡 Menores
11. `AccessConsole.tsx:651` sigue comparando `target.role === "admin"` para decidir UI.
12. `MobileAdminHome.tsx` usa `isAdminLevelRole(role)` para mostrar acciones.
13. `LocationProfile`, `DocumentsCenter`, `DocumentIntakeCenter`, `ClientProfile`,
    `ShiftClosureCard`, `ShiftAttendancePanel`, `ShiftDetailDialog`, `Employees` deciden
    escritura con `canAccessAdminForCompany` (rol) en vez de `can()` (permiso).
14. Command Center, Calendario, buscador y drawers móviles heredan la visibilidad del rol:
    ninguna de sus acciones resolutivas consulta `usePermissions`.

### ✅ Pantallas correctamente protegidas
`AccessConsole` (gate por `roles.manage`), `PayrollSettings` (`payroll.settings` para editar),
`Shifts`, `MobileShiftsView`, `StaffingCenter`, `Clients`, `Locations`, `Movements`,
`Employees`, `UnifiedPersonProfile`, `WorkerDuplicates`, `Announcements`,
`ImportConnecteam`, `AssignmentOverrides`, `PayrollReconciliation`, `LocationProfile`
(16 de 122) y todo el Portal del trabajador.

---

## 6. Respuestas de certificación

| Pregunta | Respuesta |
|---|---|
| ¿Puede Duván hacer algo fuera de su responsabilidad? | **Sí.** Usuarios, roles, permisos, company settings, integraciones, billing, companies; y en Quality Staff también payroll y clientes. |
| ¿Puede Sebastián modificar algo de Payroll? | **Sí.** Sus overrides niegan 6 acciones de nómina, pero periodos, conceptos, movimientos, review queue, mappings y `payroll.settings` quedan abiertos. |
| ¿Puede María intervenir en Operación? | **Parcialmente.** Bloqueada por override en MyStaff (crear/editar turno); **abierta en Quality Staff**. Ve y abre toda la operación en ambos. |
| ¿Los Company Owners conservan el control? | **Sí.** Anti-lockout correcto en frontend y backend. |
| ¿Existe alguna ruta que ignore `usePermissions`? | **Sí: todas.** 0 rutas con `PermissionGate`; 106 de 122 páginas admin no llaman `usePermissions`. |
| ¿Existe alguna pantalla que use `role === "admin"`? | **Sí.** `AccessConsole.tsx:651` y, de forma equivalente, 40+ archivos vía `canAccessAdminForCompany` / `isAdminLevelRole`. |
| ¿Hay botones visibles que deberían ocultarse? | **Sí.** Guardar/Eliminar/Crear/Invitar/Exportar/Importar en Users, Permissions, CompanyConfig, Billing, Payroll y todos los Import*. Es defecto de producto, no solo de backend. |
| ¿Existe bypass entre compañías? | **Sí.** `user_is_company_admin` acepta el rol global `admin`; además los overrides escritos contra la compañía placeholder no restringen en ningún tenant. |
| ¿UI y backend muestran el mismo modelo? | **Sí — y ese es el problema.** El espejo es fiel: ambos conceden todo a `role='admin'`. La divergencia real es entre el **modelo declarado** (operating roles) y el **modelo aplicado** (membresía). |
| ¿Listo para certificación de producción? | **No.** |

---

## 7. Condición para pasar a 🟡 / 🟢 (no ejecutado — solo auditoría)

1. Sacar a Duván, Sebastián y María de `company_users.role = 'admin'` (usar una membresía
   no-full-access) **o** dejar de tratar `admin` como full access y derivar el acceso de
   `operating_role_key` + overrides.
2. Hacer `users.manage`, `roles.manage`, `company.settings` permisos evaluables (mapeo real),
   no atajos de `full`.
3. Restringir `user_is_company_admin` al ámbito de compañía; separar staff de plataforma.
4. Prohibir la auto-edición en `admin_set_user_access` y eliminar la sobrecarga de 5 args.
5. Envolver las rutas `/app` sensibles con `PermissionGate` y migrar los 40+ gates de
   escritura de rol a `can()`.
6. Limpiar los overrides apuntados a la compañía placeholder.

**Ninguna de estas acciones se ejecutó.** Este documento es únicamente diagnóstico:
no se modificó Auth, RLS, Payroll, Time Entries, Shift Assignments, Scheduled Shifts,
Operating Roles, Overrides ni datos de producción.
