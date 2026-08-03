# P0 — VWC FASE 3D. Asignaciones y estados compartidos

Fuente: `docs/qa/P0_VWC_PHASE_3_HIGH_RISK_MATRIX.md` (H08 y relacionados).
Alcance: estado de asignación, respuesta del worker, confirmación, retiro, reemplazo,
roles (driver / captain / líder). **No** se tocó `time_entries`, fichajes, payroll,
compensación ni compliance policy.

---

## 1. Principio aplicado

Las transiciones de estado **no** usan PATCH genérico. Todas viajan por una sola RPC
transaccional:

```
versioned_assignment_transition(
  p_assignment_id, p_company_id, p_transition,
  p_expected_status, p_expected_version,
  p_reason, p_target_employee_id, p_role, p_surface, p_intent_key, p_status
) → jsonb
```

Transiciones soportadas: `accept`, `reject`, `confirm`, `set_status`, `remove`,
`replace`, `set_role` (+ alias `set_role_driver`, `set_role_worker`, `set_captain`).

Contrato de respuesta (idéntico en toda la app):
`status`, `success`, `conflict`, `reason`, `transition`, `previous_status`, `final_status`,
`previous_version`, `final_version`, `row`, `replacement_assignment_id`,
`coverage_after {required, assigned_active, confirmed}`, `driver_impact`, `captain_impact`,
`payroll_protected`, `next_action`, `replayed`.

Reglas fail-closed:
- `expected_version` distinto → `conflict / stale_version`, no se escribe nada.
- `expected_status` distinto → `conflict / stale_status`, no se escribe nada.
- `company_id` distinto → `denied / tenant_mismatch`.
- Sin permiso (no manager y no dueño de la asignación) → `denied / forbidden`.
- `intent_key` repetido → replay del resultado anterior, sin efectos nuevos.

La RPC **reutiliza** las funciones canónicas existentes (`remove_worker_from_shift`,
`worker_respond_to_shift_assignment`, `set_shift_assignment_state`,
`assign_worker_to_shift`): no se duplicó ninguna regla de negocio.

## 2. Esquema

`shift_assignments` ahora tiene `version`, `updated_at`, `updated_by`, `removed_by`,
`removed_at`, `replaced_by_assignment_id`, con el trigger común `bump_row_version()`
(el mismo de servicios, horas, compensación y configuración).

## 3. Superficies migradas

| Superficie | Antes | Ahora |
|---|---|---|
| `src/pages/portal/MyShifts.tsx` | RPC + **fallback `.update()` directo** | `versionedAssignmentTransition` (`accept` / `reject`). Fallback eliminado |
| `src/pages/admin/ShiftOperations.tsx` | `.update({assignment_role})` + `.insert()` | `set_role` versionado + alta por `assign_worker_to_shift` |
| `src/pages/admin/Shifts.tsx` (mover worker) | `delete()` + `insert()` (podía dejar a la persona sin turno) | alta idempotente en destino → retiro versionado en origen |
| `src/lib/shifts/driver-sync.ts` | `.update()` masivo de roles + campo legado | una transición versionada por persona; el campo legado lo sincroniza la RPC |
| `src/components/shifts/ShiftDetailDialog.tsx` | `.update({status})` y confirmar-todos por `.update()` | `set_status` / `confirm` versionados con conteo de bloqueados |
| `src/components/shifts/ReplacementSuggestionDialog.tsx` | `insert()` directo | `assign_worker_to_shift` (idempotente, con elegibilidad) |

Cliente único: `src/lib/data/assignment-write.ts` (`versionedAssignmentTransition`,
`assignmentConflictCopy`). Misma auditoría (`versioned_write_audit`), mismo lenguaje de
conflicto.

## 4. QA ejecutado (RPC real, datos reales, revertidos)

| Caso | Resultado |
|---|---|
| A promueve driver desde su versión | `applied` v2→v3, `driver_impact=promoted`, cobertura 13/23 |
| B guarda otro rol desde la versión vieja | `conflict / stale_version` (esperaba 2, real 3) — el cambio de A permanece |
| B recarga y reaplica | `applied` v3→v4, sin pérdida |
| `set_status` sin estado destino | `invalid / status_required` |
| `confirm` | `applied` v4→v5, `final_status=confirmed`, confirmados 1 |
| `confirm` repetido con el mismo `intent_key` | replay, **sin** nueva escritura ni nueva fila de auditoría |
| `remove` | `applied`, `final_status=removed`, cobertura baja a 12/23 |
| **REMOVED vs ACCEPTED**: confirmar con el estado viejo tras el retiro | `conflict / stale_status` — el retiro no se revierte |
| **ACCEPTED vs REMOVED** (equivalente): aceptar con estado viejo | bloqueado por `expected_status` |
| Multi-tenant: misma asignación con `company_id` de otra empresa | `denied / tenant_mismatch`, auditado |
| Usuario sin permisos de gestión | `denied / forbidden`, auditado |

Todos los registros quedaron en `versioned_write_audit` con `entity='shift_assignments'`,
`entity_id`, `company_id`, actor, versiones esperada/real, `conflict_type`, `surface`,
`intent_key`, `reason`, antes y después. Los datos de prueba se restauraron y las filas de
auditoría de QA se eliminaron.

## 5. Guardianes

`src/test/versioned-write.test.ts` (32/32 en verde) ahora impide:
- cualquier `.update()` directo sobre `shift_assignments` (salvo excepciones de asistencia),
- cualquier `.delete()` sobre `shift_assignments`,
- altas fuera de la lista conocida y auditada,
- que el portal del worker recupere el fallback directo,
- que mover a alguien retire antes de crear.

## 6. Excepciones restantes

- **Validación de asistencia** (`attendance_status`) en `AttendanceValidator.tsx`,
  `ShiftAttendancePanel.tsx` e `ImportSchedule.tsx`: estado adyacente al fichaje, migra en 3E.
- **Altas masivas**: importaciones, duplicado de turnos, auto-dispatch y alta con slot de rol
  tipado siguen insertando (creación, no transición); se mantienen auditadas.

## 7. Confirmación

**Las asignaciones y estados compartidos ya no pueden sobrescribirse, revivirse ni revertirse
silenciosamente.** Cero cambios en horas, fichajes, payroll, compensación, permisos, roles de
plataforma, RLS ni activación de empresas.
