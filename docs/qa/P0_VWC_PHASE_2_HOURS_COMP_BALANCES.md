# P0 — Versioned Write Contract · Fase 2

Horas reales, compensación y saldos monetarios entran al mismo carril de escritura.

## Carriles

| Carril | Definición | Implementación |
| --- | --- | --- |
| 1. Creación | Idempotente | `insert` con `intent_key` cuando aplica |
| 2. Edición de atributos | PATCH parcial + `expected_version` | `versionedWrite()` → `versioned_update_*` |
| 3. Transición de estado | RPC transaccional o compare-and-set sobre el estado previo | RPC / `.eq("status", "pending")` |
| 4. Saldos y acumulados | Aritmética atómica en SQL, con bloqueo de fila | `applyAdvanceBalanceDelta()` → `apply_advance_balance_delta` |

## Editores críticos migrados

| Superficie | Tabla | Carril |
| --- | --- | --- |
| `MobileShiftEditSheet.tsx`, `Shifts.tsx`, `ShiftOperations.tsx` | `scheduled_shifts` | 2 (Fase 1) |
| `EmployeeDayDetailDrawer.tsx` | `time_entries` | 2 |
| `useCompensation.tsx` | `compensation_profiles` | 2 |
| `CompensationEditDialog.tsx` | `compensation_profiles` | 2 |
| `EmployeeCompensationTab.tsx` (inferencia, confirmación manual, siembra) | `compensation_profiles` | 2 |
| `CompensationValidation.tsx` (siembra, confirmación, inferencia) | `compensation_profiles` | 2 |
| `useCompensationAdoption.tsx` (archivado del perfil vigente) | `compensation_profiles` | 2 |
| `AdvanceLoanDetailDrawer.tsx` (movimientos de saldo) | `employee_financial_records` | 4 |
| `advance-deduction-engine.ts` (deducción de nómina) | `employee_financial_records` | 4 |

La lista blanca de `versioned_update_compensation_profile` se amplió con:
`is_active`, `effective_to`, `inferred_hourly_rate`, `inferred_hourly_source`,
`inferred_hourly_confidence`, `hourly_rate_last_verified_at`,
`previous_inferred_rate`, `confirmed_by`, `confirmed_at`.

## Excepciones documentadas

Se mantienen fuera del carril 2 porque no son edición administrativa de atributos:

- `TimesheetView.tsx` y `DayDetailView.tsx`: aprobación/rechazo por lote, compare-and-set sobre `status = pending` (carril 3).
- `PortalClock.tsx`: fichaje del propio trabajador, creación y cierre de su entrada activa (carriles 1 y 3).
- `hours-approval.ts`, `ImportTimeClock.tsx`, `ImportWizard.tsx`: transiciones e importaciones auditadas.
- `AdvanceLoanDetailDrawer.tsx`: aprobar, pausar y cancelar son transiciones de estado; los saldos ya usan el carril 4.

## Comportamiento ante conflicto

- Servicios: el operador puede conservar sus cambios sobre la versión vigente.
- Horas y dinero: "Conservar mis cambios" está deshabilitado por defecto. La única salida segura es recargar y revisar el valor vigente.
- Toda escritura queda registrada en `versioned_write_audit` con `before_values` / `after_values`, y los movimientos de saldo con `before_balance`, `delta` y `after_balance`.

## Guardián

`src/test/versioned-write.test.ts` falla si aparece un `.update()` directo sobre
`scheduled_shifts`, `time_entries`, `compensation_profiles` o
`employee_financial_records` fuera de las excepciones listadas. La lista sólo puede reducirse.
