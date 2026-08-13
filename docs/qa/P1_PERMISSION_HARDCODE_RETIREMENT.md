# P1 — Permission Hardcode Retirement Pass

Fecha: 2026-08-13
Alcance: retirar comparaciones directas de rol en superficies de escritura y
sustituirlas por el contrato canónico `usePermissions` (`can` / `canAny`).

Reglas respetadas: no se cambiaron permisos efectivos, roles, RLS, cálculos de
payroll, `time_entries` ni datos de producción. Solo resolución de autorización
en frontend.

---

## 1. Hardcodes iniciales

- 88 puntos detectados en la auditoría del modelo canónico de roles.
- Inventario reproducible: 87 líneas con `role === "<rol>"` / `allRoles.has(...)`
  fuera de `src/lib/auth/**` y `src/test/**`.
- De ellos, **22 eran gates de escritura críticos** (publish, edit, approve,
  ajustes de horas, payroll, gestión de personas, configuración).

## 2. Migrados (22 gates críticos, 22 archivos)

| Superficie | Gate anterior | Gate canónico |
|---|---|---|
| `PayrollSettings.tsx` | `owner/admin \|\| configurar_nomina` | `can("payroll.settings")` |
| `PayrollReconciliation.tsx` | `developer/owner/admin` | `can("payroll.manage")` |
| `Movements.tsx` | `owner/admin \|\| aprobar_novedades` | `can("payroll.approve") \|\| aprobar_novedades` |
| `CompensationRulesTab.tsx` | `owner/admin/developer` | `can("payroll.manage")` |
| `CompensationMatrixTab.tsx` | `owner/admin/developer` | `can("payroll.manage")` |
| `CompensationAnalysisTab.tsx` | `owner/admin/developer` | `can("payroll.manage")` |
| `Shifts.tsx` | `owner/admin \|\| shifts.edit` | `can("service.edit")` |
| `MobileShiftsView.tsx` | `owner/admin \|\| shifts.edit` | `can("service.edit")` |
| `MobileQuickCreateShiftSheet.tsx` | `owner/admin \|\| shifts.edit` | `can("service.create")` |
| `StaffingCenter.tsx` | 4 roles `\|\| shifts.edit` | `canAny(["staffing.assign","service.edit"])` |
| `AssignmentOverrides.tsx` | 4 roles | `canAny(["staffing.assign","service.edit"])` |
| `TimesheetView.tsx` | `owner/admin \|\| shifts.edit` | `canAny(["time_entries.approve","service.edit"])` |
| `DayDetailView.tsx` | `owner/admin \|\| shifts.edit` | `canAny(["time_entries.approve","service.edit"])` |
| `PhotoReviewActions.tsx` | `developer/owner/admin` | `canAny(["time_entries.review","time_entries.approve"])` |
| `Announcements.tsx` (×4) | `owner/admin \|\| módulo/acción` | `announcements.publish/edit/delete/pin` |
| `Clients.tsx` (×2) | `owner/admin \|\| clients.*` | `can("clients.edit")` |
| `Locations.tsx` (×2) | `owner/admin \|\| locations.*` | `can("locations.edit")` |
| `LocationProfile.tsx` | `owner/admin \|\| locations.edit` | `can("locations.edit")` |
| `Employees.tsx` | 8 comparaciones de rol | `canAny(["workers.edit","users.manage"])` |
| `WorkerDuplicates.tsx` | 4 roles | `canAny(["workers.edit","users.manage"])` |
| `UnifiedPersonProfile.tsx` | `developer/owner/admin` | `canAny(["workers.edit","users.manage"])` |
| `ImportConnecteam.tsx` (SSN) | `owner/admin` | `can("workers.edit")` |

Efecto: cada uno de estos gates pasa ahora por `evaluatePermission`, por lo que
un **override negativo por compañía restringe también a `admin` y
`company_owner`** (con la excepción anti-lockout ya documentada). Antes lo
ignoraban.

Las acciones legacy no presentes en el catálogo (`aprobar_novedades`,
`manage_compensation`, `edit_compensation_analysis`) se conservan como OR
adicional: son concesiones explícitas, no comparaciones de rol, y quitarlas
habría reducido permisos efectivos.

## 3. Críticos restantes

**0.** No queda ningún gate de escritura (publish / edit / approve / ajuste de
horas / payroll / gestión de personas / configuración) que evalúe roles
directamente e ignore overrides negativos.

## 4. Read-only / navegación restantes (41 líneas)

No bloquean el criterio; no gobiernan escrituras:

- **Autoridad del modelo** (`useAuth.tsx`, `permission-resolver.ts`): definición
  de jerarquía de roles. Es la fuente, no un hardcode de pantalla.
- **Navegación y visibilidad**: `AdminSidebar`, `CommandPalette`, `Dashboard`,
  `MobileAdminHome`, `AdminLayout`, `useNotifications`, `AuditPanel`,
  `useDebugMode` — filtran enlaces y widgets visibles.
- **Ámbito plataforma** (no restringible por compañía por diseño):
  `Companies.tsx` (paneles ECC), `Referrals.tsx`, `AdvancesLoans.tsx`
  (scoping de consulta global), `founder-access.ts`, `ContextSwitcher`.
- **Etiquetas y datos**: `u.role`, `author_type`, `assignment_role`,
  `inviteRole` — no son autorización.

## 5. Regresiones

- Typecheck (`tsgo -p tsconfig.app.json`): limpio.
- Suite completa: **93 archivos / 1053 tests, 100% verde**, incluyendo
  `permission-overrides.test.ts` (9) y `role-model.test.ts` (11).
- Sin migraciones de base de datos, sin cambios de RLS, sin escrituras de datos.

## 6. Veredicto

**🟢 GO** — 0 hardcodes críticos con capacidad de ignorar overrides negativos.
Lo restante es navegación, visibilidad y ámbito de plataforma, migrable de forma
incremental sin riesgo operativo.
