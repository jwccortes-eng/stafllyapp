# P0 — Reality Certification Failure: Duván / Quality Staff (AUDIT ONLY)

Usuario auditado: Duván Gallego `4338b336-0f65-4285-9d50-6abcc28e5645`
Empresa auditada: **Quality Staff by Keury** `00000000-0000-0000-0000-000000000001`
Fecha: 14 Ago 2026 · Sin cambios de datos, roles, RLS ni memberships.

## 1. Estado real medido

| Señal | Valor real |
|---|---|
| `company_users.role` (Quality) | `admin` |
| `company_users.operating_role_key` (Quality) | **NULL** |
| `company_users` (MyStaff) | `admin` + `time_closeout_admin` |
| Roles globales (`user_roles`) | `supervisor` |
| `is_global_owner` | false |
| `has_role(admin)` global | false |
| `has_permission(...)` en Quality | **0 / 41** (verificado: `service.create`, `workers.view`, … = false) |
| `has_module_permission(shifts/employees/clients, view)` | false |
| **`user_is_company_admin(user, Quality)`** | **TRUE** ← contradicción central |
| Filas `module_permissions` del usuario | 22 (11 con `company_id` Quality, 11 legacy `company_id IS NULL`) |
| Filas `action_permissions` del usuario | 43 |

**El motor nuevo dice 0/41. El motor legacy dice "admin de la empresa".**
Ambos siguen vivos y la mayoría de la base de datos escucha al legacy.

## 2. Causa raíz

`public.user_is_company_admin(_user, _company)` sigue siendo:

```sql
is_global_owner(_user)
OR is_company_owner(_user, _company)
OR has_company_role(_user, _company, 'admin')   -- ← company_users.role = 'admin'
```

Es decir: **el hardening cambió `has_permission`, pero no retiró la autoridad de
`company_users.role='admin'`**, que sigue siendo la autoridad efectiva de:

- **55 policies RLS en 27 tablas** (`user_is_company_admin` directo).
- **`publish_shift_draft()`** (SECURITY DEFINER): autoriza con
  `user_is_company_admin` → *publicar servicio es una escritura real permitida*.
- **`can_manage_shift_company()`** → usada por `assign_worker_to_shift()` y otras
  RPC SECURITY DEFINER; además acepta rol de compañía `manager`/`supervisor`.

A esto se suma un segundo bypass estructural: **106 policies en 76 tablas
autorizan solo por pertenencia** (`company_id IN user_company_ids(auth.uid())`),
sin ningún permiso. Membresía = permiso.

Y un tercero, de superficie: **`/app/shifts`, `/app/ops-center`, `/app/employees`,
`/app/timeclock`, `/app/documents`, `/app/clients`, `/app/notifications` y ~40
rutas más no tienen `PermissionGate`** en `src/App.tsx` (solo
`CompanyRequiredGuard`/`ModuleGate`). El mapa `nav-permissions.ts` solo apaga el
menú; la URL directa sigue abierta.

## 3. Matriz de superficies

Leyenda severidad: **S1** escritura real posible · **S2** lectura real de datos ·
**S3** UX leak (se ve, no opera).

| Surface | Visible | Route accessible | Data returned | Action available | Mutation protected | Authority actualmente usada | Permiso esperado | Finding | Sev |
|---|---|---|---|---|---|---|---|---|---|
| Sidebar | Reducido ✔ | — | — | — | — | `usePermissions` + `nav-permissions` | correcto | Único punto ya migrado | OK |
| Router `/app/*` | — | **Sí (sin gate)** | depende RLS | — | — | `CompanyRequiredGuard` (solo empresa activa) | `PermissionGate` por ruta | Rutas abiertas por URL directa | S3→S1 |
| Home `/app/home` | Sí | Sí | Parcial (widgets) | — | — | Ninguna | neutra o `service.view` | Sin autoridad declarada | S3 |
| Command Center / `/app/ops-center` | Sí | **Sí, sin gate** | Lecturas directas a `scheduled_shifts`, `shift_assignments`, `time_entries`, `clock_alerts`, `employees`, `clients`, `notifications` | Resolver alerta, Reemplazar | Parcial | `OperationsCommandCenter.tsx` no llama `usePermissions` **en absoluto**; loaders disparan antes de validar | `service.view` + `staffing.assign` | Pantalla sin autorización; carga datos y luego "no hay nada" | S2 |
| `/app/shifts` (calendario) | Sí | **Sí, sin gate** | `scheduled_shifts` SELECT exige `has_module_permission(shifts,view)` = **false** → solo turnos donde él está asignado | Ver/abrir | — | RLS `has_module_permission` (ya correcta) | `service.view` | Shell y filtros se renderizan igual: *UX leak*; contenido operativo debe verificarse en runtime | S3 |
| CTA global “+ Crear” | Sí | — | — | Abre flujos | No | Sin chequeo de permiso | `service.create` | Botón sin autoridad | S3 |
| Modal “Nuevo servicio rápido” | Sí | — | Lee clients/locations (RLS `has_module_permission` → vacío) | Sí | **Parcial** | `Shifts.tsx` usa `can("service.edit")` solo para editar; el alta usa `insert` directo | `service.create` | Formulario abre; el INSERT sí lo frena RLS (`shifts.edit` false) | S3 |
| **Guardar borrador** | Sí | — | — | Sí | **Sí (RLS)** | `scheduled_shifts` INSERT exige `has_module_permission(shifts,edit)` = false | `service.create` | Falla en DB, no en UI | S3 |
| **Publicar servicio** | Sí | — | — | Sí | **NO** | RPC `publish_shift_draft` → `user_is_company_admin` = **TRUE** | `service.publish` | **Escritura real posible sobre cualquier servicio de Quality** | **S1** |
| **Reemplazar / asignar (Ops Center)** | Sí | — | — | Sí | **NO** | RPC `assign_worker_to_shift` → `can_manage_shift_company` → `user_is_company_admin` = TRUE | `staffing.assign` | **Asignación real posible** | **S1** |
| Invitar empleado | Sí | ruta con gate ✔ (`workers.invite`) | — | Sí | **NO** | `employee_invitations` INSERT/UPDATE = solo pertenencia | `workers.invite` | UI cerrada, DB abierta (API directa) | **S1** |
| Time Clock | Sí | Sin gate | `time_entries`/`clock_events` por membresía en varias policies | Ajustes | Mixto | `user_company_ids` + policies legacy | `time_entries.*` | Lectura real probable | S2 |
| Notification center (NO_SHOW_ALERT con nombres) | Sí | Sin gate | **Sí, datos reales** | Marcar leído | n/a | `useNotifications`: `isAdmin = role === 'admin' \|\| 'manager' …` (rol legacy) + RLS `recipient_id = auth.uid()` | `service.view` | Lee por destinatario; el fan-out le entrega nombres de workers y servicios de Quality | **S2** |
| Loaders/queries generales | — | — | — | — | — | Se ejecutan sin `status==='ready'` ni `can()` previo | gate antes de query | Patrón "cargar y luego negar" | S2 |

## 4. Inventario de bypasses residuales

**A. Autoridad legacy en DB (la más grave)**
1. `user_is_company_admin` acepta `company_users.role='admin'` → 55 policies / 27 tablas.
2. `can_manage_shift_company` acepta además rol de compañía `manager`/`supervisor`.
3. `publish_shift_draft` autoriza con `user_is_company_admin`.
4. 106 policies / 76 tablas autorizan por **pertenencia sola** (`user_company_ids`).
5. 47 policies / 41 tablas siguen usando `has_role(auth.uid(),'admin')` global (no aplica a Duván hoy — `supervisor` — pero es autoridad no-company-scoped viva).
6. Filas legacy `module_permissions.company_id IS NULL` (11 del usuario) siguen existiendo; el resolver ya las ignora, pero cualquier consulta legacy las vería.

**B. Frontend**
7. ~40 rutas de `/app/*` sin `PermissionGate` (incluye `shifts`, `ops-center`, `employees`, `timeclock`, `clients`, `documents`, `staffing-center`, `notifications`).
8. `OperationsCommandCenter.tsx`: cero uso de `usePermissions`.
9. `useNotifications.tsx:71`: `isAdmin` por rol legacy.
10. `Dashboard.tsx:763`, `AuditPanel.tsx:49`, `useDebugMode.tsx:29`, `DocumentIntakeCenter.tsx:93`, `Users.tsx:355`, `MobileShiftOperationsSheet.tsx:2006`: `role === 'admin'` residual.
11. `hasModuleAccess` / `hasActionPermission` legacy aún consumidos en 15+ pantallas (Clients, StaffingCenter, PayPeriods, PeriodSummary, Compensation*, TimesheetView, DayDetailView…).
12. CTAs globales (+ Crear, Nuevo servicio, Time Clock) sin `can()`.

**C. Multi-tenant**
- No se detectó contaminación desde MyStaff: `has_permission` es estrictamente por `company_id` y el override de MyStaff (`time_closeout_admin`) no aplica a Quality.
- La contaminación real es **por rol global `supervisor`** en `can_manage_shift_company` (rol de compañía) y por `has_role admin` en 41 tablas: rutas de autorización que no son company-scoped siguen existiendo aunque hoy no favorezcan a Duván.

## 5. Clasificación

- **Solo UX leak (no hay dato ni escritura):** sidebar residual en otras vistas, CTA “+ Crear”, “Nuevo servicio”, “Guardar borrador”, modal de creación rápida, shell de `/app/shifts`.
- **Lectura real:** notification center (NO_SHOW_ALERT con PII de workers), Ops Center sobre tablas con policies de pertenencia (`shift_notes`, `shift_timeline`, `staffing_requests`, `clock_alerts`), Time Clock, tablas financieras/reconciliación legibles vía `user_is_company_admin` (`compensation_profiles`, `historical_payroll_entries`, `payroll_rate_snapshots`, `billing_clients`, `employee_financial_records`).
- **Escritura real posible:** `publish_shift_draft`, `assign_worker_to_shift` (y demás RPC con `can_manage_shift_company`), `employee_invitations`, `notifications` INSERT, `shift_notes`/`shift_timeline`/`staffing_requests`/`request_candidates`/`service_categories`, `invoices`/`invoice_lines`/`invoice_payments`, `billing_clients`, `contractor_w9`, `reconciliation_*`, `employee_financial_*`, `office_visits`, `client_messages`.
- **Dependientes de RLS legacy:** las 27 tablas de `user_is_company_admin` + las 76 de pertenencia sola.

## 6. Plan mínimo de remediación (no ejecutado)

1. **Retirar `has_company_role(...,'admin')` de `user_is_company_admin`**: dejar solo owner de empresa + staff de plataforma. Un solo cambio corta los 3 vectores S1 principales.
2. **`can_manage_shift_company`** → `has_permission(auth.uid(), _company_id, 'staffing.assign')` (y `service.publish` donde corresponda); quitar `manager`/`supervisor` de compañía y roles globales no-owner.
3. **`publish_shift_draft`** → exigir `has_permission(..., 'service.publish')`.
4. **Pase RLS pertenencia→permiso** en las 76 tablas, por tiers (servicio → personas → finanzas), respetando la congelación financiera vigente.
5. **`PermissionGate` en todas las rutas `/app/*`** usando `navPermissionsFor()` como fuente única (evita duplicar el mapa).
6. **Gate antes de query**: en Ops Center / Home / Shifts, no montar loaders hasta `status==='ready' && can(...)`.
7. **Retirar `role === 'admin'`** de `useNotifications`, `Dashboard`, `AuditPanel`, `useDebugMode`, `DocumentIntakeCenter`, `Users`, `MobileShiftOperationsSheet`; sustituir `hasModuleAccess`/`hasActionPermission` por `can()`.
8. **Backfill de `operating_role_key`** para los 9 admins con NULL (decisión de negocio, no técnica) antes de apretar, o quedarán en 0 permisos.

**Blast radius:** el paso 1 afecta a **todos** los `company_users.role='admin'` sin `operating_role_key` (9 usuarios) en 27 tablas + publicación/asignación de servicios. Los pasos 2–3 afectan a cualquier supervisor/manager que hoy asigne personal. El paso 4 toca reconciliación y facturación (alto riesgo, requiere QA de payroll). Los pasos 5–7 son frontend, riesgo bajo, reversibles.

**Archivos / objetos a modificar:** `user_is_company_admin`, `can_manage_shift_company`, `publish_shift_draft`, `cancel_shift` y demás RPC SECURITY DEFINER con autoridad legacy; 55+106 policies; `src/App.tsx`, `src/pages/admin/OperationsCommandCenter.tsx`, `src/pages/admin/Home.tsx`, `src/pages/admin/Shifts.tsx`, `src/hooks/useNotifications.tsx`, `src/hooks/useAuth.tsx`, `src/pages/admin/Dashboard.tsx`, `src/components/audit/AuditPanel.tsx`, `src/hooks/useDebugMode.tsx`, `src/pages/admin/DocumentIntakeCenter.tsx`.

**QA posterior:** (a) matriz `has_permission` 41×rol para Duván en Quality y MyStaff por separado; (b) intento real de `publish_shift_draft` y `assign_worker_to_shift` como Duván en Quality → debe fallar `42501`; (c) recorrido por URL directa de las 12 superficies de esta matriz; (d) regresión de owner y de `time_closeout_admin` en MyStaff (no debe perder cierre ni horas); (e) verificación de que ningún job/edge function con service-role sustituya el permiso perdido.

## 7. Verdicto

# 🔴 NO GO — Duván / Quality Staff

`has_permission = 0/41` es cierto y a la vez irrelevante: la aplicación real no
pregunta por ese motor en la mayoría de sus caminos. Mientras
`company_users.role='admin'` siga siendo autoridad en `user_is_company_admin`,
Duván conserva **capacidad de escritura real** en Quality Staff (publicar
servicios, asignar personal, invitar, facturación y reconciliación) y **lectura
real** de datos de personas y finanzas. La regla objetivo
*NO permission → NO menu → NO route → NO data → NO action → NO mutation*
se cumple hoy solo en el primer eslabón.
