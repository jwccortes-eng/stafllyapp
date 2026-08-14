# P0 — SEBASTIÁN DOMAIN BOUNDARY REMEDIATION

Fuente: `docs/qa/P0_SEBASTIAN_MYSTAFF_REALITY_CERTIFICATION.md` (veredicto previo 🔴 NO GO)
Fecha: 2026-08-14 · Alcance: separar SERVICES/SHIFTS de TIME & CLOSEOUT, PAYROLL y BILLING.

## 1. Diagnóstico confirmado

Sebastián Villegas (`e4793c12-…`) en My Staff Solution: `operating_role_key = shift_admin`,
16/41 permisos. El rol es correcto. El exceso de autoridad venía de dominios legacy:

| # | Autoridad legacy | Efecto |
|---|---|---|
| 1 | RLS de `time_entries` gobernada por `has_module_permission(..., 'shifts', 'edit'/'view')` | `service.edit` abría lectura y escritura de horas reales |
| 2 | `can_request_shift_correction` → `can_manage_shift_company` (`staffing.assign` OR `service.edit`) | corregir horas sin permiso de horas |
| 3 | `shift_attendance_confirmations` con módulo `shifts` + `has_role('admin')` | mutación de asistencia desde el dominio de servicios |
| 4 | `shift_closeout_can_admin` por membresía (`admin`/`manager`/`supervisor`) | cierre administrativo por tipo de membresía |
| 5 | Facturación (`invoices`, líneas, pagos, bitácora, bloques) con `SELECT` por `user_company_ids()` | lectura de billing por simple pertenencia |

## 2. Cambios aplicados (RLS y helpers — mínimos y explícitos)

### 2.1 `time_entries`

| Policy anterior | Autoridad anterior | Policy nueva | Permiso canónico |
|---|---|---|---|
| `Managers can view time_entries` | módulo `shifts:view` | `Time domain can view time_entries` | `time_entries.view` |
| `Managers can edit time_entries` | módulo `shifts:edit` | `Time domain can edit time_entries` | `time_entries.adjust` |
| `Managers can insert time_entries` | módulo `shifts:edit` | `Time domain can insert time_entries` | `time_entries.adjust` |
| `Company admins can manage time_entries` (ALL) | membresía + `has_role('admin')` | `Time domain can delete time_entries` | `time_entries.adjust` |

Se conservan intactas las políticas del trabajador (`Employees can view/insert/update own
time_entries`) y `Owners can manage all time_entries` (staff de plataforma).
Todas las nuevas policies mantienen el filtro de tenant `company_id IN user_company_ids(...)`.

### 2.2 `shift_attendance_confirmations`

Se retiran `Managers with shifts edit can manage attendance` y
`Admins can manage company attendance confirmations`; se crea
`Time domain can manage attendance confirmations` con `time_entries.review`.
Se conservan la política del trabajador y la del `shift_admin_id` del turno concreto.

### 2.3 `can_request_shift_correction`

Se elimina la rama `can_manage_shift_company(...)`. Queda:
`time_entries.review` OR `time_entries.adjust` OR ser el `shift_admin_id` designado del turno
(rama de propuesta operativa en campo; la aprobación sigue exigiendo permiso de horas en
`review_time_entry_correction`).

### 2.4 `shift_closeout_can_admin`

De membresía (`admin`/`manager`/`supervisor`) a: plataforma OR dueño de la compañía OR
`closeout.close_day` OR `closeout.reopen_day` OR `time_entries.approve`.

### 2.5 Billing

`SELECT` por membresía retirado en `invoices`, `invoice_lines`, `invoice_payments`,
`invoice_activity_log`, `billable_service_blocks`, `billable_service_block_entries`,
`billing_client_locations`. Ahora exigen `user_is_company_admin` (que tras el
endurecimiento previo significa **dueño de empresa o staff de plataforma**).
No se introdujeron claves de permiso nuevas (no existe dominio `billing.*` en el catálogo);
billing queda separado de payroll y no se concede a `shift_admin`.

## 3. Frontend

- `src/lib/shifts/shift-permissions.ts`: nueva constante `TIME_DOMAIN_WRITE_PERMISSIONS`.
- `ShiftAttendancePanel.tsx` y `MobileShiftOperationsSheet.tsx`: `canValidate` ahora exige
  además `canAny(["time_entries.review","time_entries.adjust","time_entries.approve"])`.
  Sin permiso → sin CTA de validación ni de corrección de horas.
- `GenerateBillingBlockButton.tsx`: solo se renderiza con acceso total de compañía
  (dueño/plataforma), espejo de la RLS de billing.
- Navegación: `/app/billing` ya exigía `company.settings` (owner-only). Sin cambios.

Regla aplicada: sin permiso → sin menú → sin ruta → sin datos → sin acción → sin mutación.
La autoridad final sigue siendo RLS.

## 4. QA — permisos efectivos (`has_permission`, post-fix)

My Staff Solution (`37f92f75-…`):

| Permiso | Sebastián | Duván |
|---|---|---|
| service.view / create / edit / publish | ✅ | ❌ (solo view) |
| staffing.view / assign / replace / remove | ✅ | ❌ |
| time_entries.view / review / adjust / approve | ❌ | ✅ |
| closeout.close_day / reopen_day | ❌ | ✅ |
| service.close / reopen | ❌ | ✅ |
| payroll.* / company.settings / roles.manage | ❌ | ❌ |

Totales: **Sebastián 16/41** (MyStaff), **Duván 11/41** (MyStaff, `time_closeout_admin`),
**Owner 41/41**. Sin cambios en roles, plantillas ni overrides.

Matriz de QA solicitada:

| Área | Sebastián | Resultado |
|---|---|---|
| Servicios: ver / crear / editar / publicar | esperado PASS | PASS |
| Staffing: asignar / reemplazar / resolver cobertura | esperado PASS | PASS |
| Time entries: ver | DENY (no tiene `time_entries.view`; ve contexto de horario del servicio, no horas reales) | documentado |
| Time entries: ajustar / aprobar / corregir | DENY | DENY (RLS + RPC + UI) |
| Closeout administrativo | DENY | DENY |
| Payroll | DENY | DENY |
| Billing | DENY | DENY (RLS + UI) |
| Users / roles / settings | DENY | DENY |

## 5. Payroll

Sin cambios: no se tocaron cálculos, ni la lectura de horas por payroll, ni datos de
`time_entries`, `shift_assignments`, `scheduled_shifts`, pagos ni periodos. Ninguna
sentencia de la migración modifica filas.

## Cierre obligatorio

1. **¿Puede Sebastián editar time_entries?** No. UPDATE/INSERT/DELETE exigen `time_entries.adjust`.
2. **¿Puede corregir horas?** No. `can_request_shift_correction` ya no acepta `can_manage_shift_company`.
3. **¿Puede aprobar horas?** No. Ni `time_entries.approve` ni `shift_closeout_can_admin`.
4. **¿Puede acceder a billing?** No. Lectura restringida a dueño/plataforma; CTA oculto.
5. **¿Qué consumers de `can_manage_shift_company` fueron corregidos?** `can_request_shift_correction`. Los demás (`cancel_shift`, `remove_worker_from_shift`, `assign_worker_to_shift`, `set_shift_assignment_state`, `versioned_assignment_transition`, `resolve_shift_request`, preferencias de cliente, emergency worker) son dominio de servicio y se conservan; ninguno muta horas (`cancel_shift` y `remove_worker_from_shift` solo **leen** `time_entries` para fail-closed).
6. **¿Qué RLS de `time_entries` cambió?** Las 4 políticas de manager/admin listadas en 2.1; las del trabajador y de plataforma quedan igual.
7. **¿Duván conserva sus 11/41 y corrección de horas?** Sí: 11/41 y `time_entries.review/adjust/approve` + `closeout.*` → conserva corrección, aprobación y cierre.
8. **¿Owners conservan 41/41?** Sí (verificado en Quality Staff: 41/41).
9. **¿Payroll quedó intacto?** Sí.
10. **¿Queda algún bypass donde shifts otorgue autoridad sobre time_entries?** No en `time_entries` ni en asistencia/cierre. Persiste la rama `shift_admin_id` (administrador designado del turno concreto) para **proponer** correcciones, sujeta a revisión con permiso de horas.
11. **¿Queda algún P0 de Sebastián?** No. Condición abierta (P1): 100+ tablas secundarias siguen con `SELECT` por membresía (`user_company_ids`), fuera de horas/billing/payroll.

## VEREDICTO

🟡 **GO WITH CONDITIONS** — la frontera de dominio queda cerrada para horas, cierre y
facturación; queda como P1 la migración del resto de `SELECT` por membresía en tablas
secundarias.
