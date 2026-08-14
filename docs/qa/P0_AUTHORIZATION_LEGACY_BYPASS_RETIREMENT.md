# P0 — Retiro de bypasses legacy de autorización

Objetivo: `operating_role_key` + `has_permission` como única autoridad
company-scoped. Deny by default. Owner de empresa y staff de plataforma
conservan acceso total.

## Fase 1 — Sidebar / Layout / superficies (frontend)

- `src/lib/auth/nav-permissions.ts`: mapa canónico ruta → permisos.
- `AdminSidebar.tsx`, `AdminLayout.tsx`: visibilidad por `usePermissions`
  (`canAny`), sin `role === "admin"`.
- `useAuth.tsx`: `hasModuleAccess` / `hasActionPermission` endurecidos
  (sin bypass de admin, sin filas `company_id IS NULL`).
- `CommandPalette.tsx`: visibilidad por permiso efectivo (`isNavItemVisible`),
  sin acceso ciego por rol.
- `useTodayHubPermissions.ts`: capacidades del Command Center derivadas de
  `can()` (staffing.assign, service.close, closeout.close_day,
  time_entries.*, workers.edit), fail-closed mientras carga.

## Fase 2 — Funciones de autorización en base de datos

- Nueva firma `has_module_permission(user, company, module, permission)`:
  resuelve por catálogo canónico → `has_permission`; fuera del catálogo, solo
  dueño de empresa u override explícito de ESA empresa.
- Firma legacy de 3 argumentos: ya no autoriza nada salvo staff de plataforma
  (fin del bypass de roles globales supervisor/manager/admin).
- `has_action_permission(user, company, action)` con la misma regla.
- Todas las policies que usaban la firma sin empresa fueron reescritas para
  pasar el `company_id` de la fila (o el de su registro padre en
  `import_rows` → `imports`, `concept_employee_rates` → `concepts`).
  **Legacy 3-arg en RLS: 0.**

## Fase 3 — RLS por permiso explícito

Migradas de `user_is_company_admin` a `has_permission` (39 policies):

| Tier | Tablas | Lectura / Escritura |
|---|---|---|
| 1 Personas y documentos | employees, employee_portal_modules, employee_documents, document_intake_batches, document_intake_items, document_review_events, job_applications, module_permissions | workers.view/edit, documents.view/manage, roles.manage |
| 2 Configuración | company_financial_policies, front_desk_devices, front_desk_case_sequences, kiosk_devices, shift_chat_config | company.settings |
| 3 Servicio y staffing | shift_assignment_admin_overrides, dispatch_logs, locations_v2, closure_quality_log | staffing.view/assign, locations.view/edit, service.close |
| 4 Horas y asistencia | location_presence, location_sessions, normalized_clock_rows | attendance.view, time_entries.view/review |

Las policies `ALL` con permisos de lectura y escritura distintos recibieron una
policy `SELECT` adicional para no dejar sin lectura a los roles de solo lectura.

**Pendiente (fase 5, no migrado a propósito):** 27 tablas de nómina,
facturación, compensación y reconciliación siguen con `user_is_company_admin`.
Se dejan intactas para no arriesgar datos financieros en producción; requieren
un pase dedicado con QA de payroll.

## Fase 4 — Owner

`has_permission` concede acceso total al `company_owner` en su empresa y al
staff de plataforma (`developer` / `owner`), con `users.manage`, `roles.manage`
y `company.settings` irrevocables (anti-lockout). No se tocó.

## Fase 5 — Reality QA: Duván Gallego (`4338b336…5645`)

Permisos efectivos medidos con `has_permission` en base de datos:

- **Quality Staff: 0 / 41.** `operating_role_key` NULL ⇒ sin sidebar admin,
  sin rutas operativas, sin escritura en `employees` ni configuración.
- **MyStaff: 11 / 41** — `service.view`, `service.close`, `service.reopen`,
  `closeout.close_day`, `closeout.reopen_day`, `time_entries.view/review/
  adjust/approve`, `attendance.view`, `workers.view`.
  Sin nómina, sin facturación, sin `users.manage`, sin `roles.manage`,
  sin `company.settings`, sin `service.create/edit/publish`.

Coincide con la responsabilidad declarada (tiempo y cierre). El bypass por rol
global `supervisor` queda cerrado: ya no existe ruta de autorización sin
empresa.

## Veredicto

🟢 **GO** para los tiers 1–4. 🟡 Pendiente el pase financiero (27 tablas).
