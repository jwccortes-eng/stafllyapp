# Cierre QA — Multi-Driver (P0.3)

Fecha: 2026-08-01 · Ambiente: sandbox dev (localhost:8080) contra backend Lovable Cloud real
Evidencia automatizada: `src/test/driver-sync-roundtrip.test.ts` (7 casos), `driver-sync.test.ts` (3), `driver-plan.test.ts` (6) — 16/16 en verde.

## 1. Desktop — PASS
Superficie: `TransportationSection` → `MultiDriverPicker` (crear en `Shifts.tsx`, editar en `ShiftEditDialog.tsx`).

| Paso | Resultado |
|---|---|
| Seleccionar 5 conductores | 5 fichas, sin tope en el picker |
| Guardar | crear: `assignment_role` por persona en el alta; editar: `syncShiftDriverRoles` |
| Reabrir | `driverIdsFromAssignments` reconstruye la selección desde `shift_assignments` + legado |
| Editar a 3 | 2 filas pasan a `worker`, 0 borrados |
| Volver a 5 | 2 filas vuelven a `driver` |
| Duplicados | 0 (`new Set` en el sync + una fila por persona) |

## 2. Mobile — PARCIAL (crear PASS · editar FAIL por ausencia)
- **Crear** (`MobileQuickCreateShiftSheet.tsx`): soporta N conductores (`driver-plan.ts`, `assignmentRoleFor`, `primaryDriverId`). PASS.
- **Editar** (`MobileShiftEditSheet.tsx`): **no expone ningún campo de conductores** (0 coincidencias de `driver` en el archivo). Brecha exacta: al editar un turno desde móvil no se pueden ver ni cambiar los conductores; hay que usar desktop. No se creó arquitectura nueva; el arreglo sería montar `MultiDriverPicker` + `syncShiftDriverRoles` en ese sheet.
- **Team Hub móvil**: sólo filtra/etiqueta "Conductores", no asigna el rol.

## 3. Persistencia — PASS
- Cada conductor = una fila `shift_assignments` con `assignment_role='driver'`.
- `scheduled_shifts.driver_employee_id` = primer conductor (`wanted[0]`), sólo compatibilidad.
- `syncShiftDriverRoles` únicamente hace `UPDATE assignment_role` sobre filas del turno y del set esperado: **cero DELETE** (verificado en test).

### Queries de verificación
```sql
-- a) Conductores reales de un turno
select a.employee_id, e.first_name, e.last_name, a.assignment_role, a.status
from shift_assignments a join employees e on e.id = a.employee_id
where a.shift_id = '<SHIFT_ID>' and a.assignment_role = 'driver';

-- b) Duplicados por turno (debe devolver 0 filas)
select shift_id, count(*), count(distinct employee_id)
from shift_assignments
where assignment_role = 'driver' and status not in ('rejected','removed')
group by 1 having count(*) <> count(distinct employee_id);

-- c) Coherencia del legado (driver_employee_id sin asignación)
select s.id, s.shift_ref, s.driver_employee_id
from scheduled_shifts s
where s.driver_employee_id is not null
  and not exists (select 1 from shift_assignments a
                  where a.shift_id = s.id and a.employee_id = s.driver_employee_id);
```
Resultado hoy: (b) 0 filas. (c) 9 turnos históricos (QK-001380 … QK-001536) con `driver_employee_id` apuntando a alguien que nunca fue asignado — **dato legado previo a P0.3, no regresión**; no se corrigió por falta de mandato.

## 4. Usos de `driver_employee_id`
Sólo legado/display (leen el campo pero también consideran `assignment_role`):
- `src/pages/admin/ShiftOperations.tsx` — une legado + roles en un `Set`. Seguro.
- `src/lib/shifts/shift-operations-intelligence.ts` — idem (`driverIds` como Set). Seguro.
- `src/lib/shifts/driver-sync.ts` — escribe el legado a propósito.

Asumen un único conductor (candidatos a migrar, **no modificados por falta de evidencia de impacto**):
- `src/hooks/useTodayOperations.tsx` — `primary_driver_id` y `capacity_total` se calculan con el legado cuando no hay `rides`; con 5 conductores y 0 rides la capacidad se subestima.
- `src/pages/admin/Shifts.tsx` — validación previa acepta `driverEmployeeId` suelto (sólo fallback).
- `src/components/shifts/ShiftRidesPanel.tsx` — un `driver_id` por ride (modelo correcto, no es el legado).

## 5. Casos
| Caso | Resultado |
|---|---|
| 0 conductores | PASS — legado a `null`, sin promociones |
| 1 conductor | PASS |
| 5 conductores | PASS |
| Conductor repetido | PASS — deduplicado, 1 fila |
| Conductor removido/rechazado | PASS — no se promueve (filtro de estados activos) |
| Retry | PASS — idempotente |
| Doble submit | PASS — segunda pasada 0 promoted / 0 demoted |
| Cambio de tenant | PASS — sync sólo por `shift_id`, RLS de `shift_assignments` aísla compañías |
| documents_pending | PASS — el rol no cruza la política de asignación |
| Conflicto operativo | PASS — no bloquea; se avisa "X de N conductores" sin impedir guardar |

## 6. Seguridad — PASS
Sin escrituras a payroll, `time_entries` ni asistencia; sin `DELETE`; sin cruce de tenants; sólo `assignment_role` y el campo legado.

## Veredicto
**Listo para publicar en Desktop.** Móvil: crear PASS, editar sin superficie de conductores (brecha conocida, no bloqueante porque desktop cubre la edición). Recomendado siguiente sprint: `MultiDriverPicker` en `MobileShiftEditSheet` y `useTodayOperations` leyendo drivers desde `shift_assignments`.

---

# Cierre P0.3.1 — Misma verdad multi-driver en todas las superficies

## 1. Editar conductores desde móvil — CERRADO
`MobileShiftEditSheet.tsx` ya montaba `ShiftFormFields` (layout `stack`), que incluye
`TransportationSection` → `MultiDriverPicker`. Faltaban las dos piezas que lo hacían inútil:
- **Hidratación**: el formulario nacía con `driverIds` derivado sólo del campo legado. Ahora usa
  `driverIdsFromAssignments(assignments, shift.id, driver_employee_id)` — misma función que desktop.
- **Persistencia**: al guardar se llama a `syncShiftDriverRoles(shift.id, driverIds)`, exactamente
  igual que `ShiftEditDialog`. Si sólo cambian los conductores (sin tocar columnas del turno) el
  guardado ya no dice "Sin cambios": sincroniza roles y confirma.
Fallo de sincronización → aviso `notifyWarning` ("El turno se guardó, pero los conductores no"),
nunca silencioso. Cero `DELETE`, cero escrituras en horas/fichajes/payroll.

## 2. `useTodayOperations` ya no asume un solo conductor — CERRADO
- La consulta de asignaciones trae `assignment_role`.
- `ShiftTransportInfo` expone `driver_ids: string[]` (verdad) y conserva `primary_driver_id`
  sólo como compatibilidad.
- Conductores = filas `assignment_role='driver'` + legado + conductores de `shift_rides`.
- `capacity_total` sin rides pasó de `capacity` (1 vehículo) a `capacity × nº conductores`.
  Con 5 conductores y 0 rides la capacidad ya no se subestima ni dispara `capacity_short` falso.

## 3. Reparación histórica — EJECUTADA Y AUDITADA
Tabla `legacy_driver_backfill_audit` (RLS por empresa) con el veredicto por turno.
Universo real: 13 turnos vivos (los otros 10 del recuento inicial eran turnos borrados).

| Resultado | Turnos | Criterio |
|---|---|---|
| `repaired` | 2 (QK-001524, QK-001536) | la persona no tenía **ninguna** ficha en el turno → se creó la ficha `driver` |
| `manual_review` | 11 | ambiguo: no se tocó nada |

Motivos de los 11 manuales:
- 8 · la persona ya está en el equipo con **otro rol** (`staff`, `shift_admin`, `check_in_admin`,
  o `removed`). Cambiar el rol es una decisión operativa, no una migración.
- 3 · bloqueado por la regla de solapamiento (`prevent_overlapping_shift_assignments`):
  QK-001387, QK-001504, QK-001522. Se respetó la regla; no se forzó.

Garantías de la reparación:
- Idempotente (índice único parcial sobre `repaired`, y sólo inserta si no existe fila).
- Aviso al trabajador **silenciado** durante el backfill (`trg_notify_on_shift_assignment`
  deshabilitado y rehabilitado en la misma transacción): son turnos pasados, nadie recibe
  notificaciones falsas.
- Fichas creadas en `pending` con `response_required=false`: no se inventa historial de aceptación.
- Cero UPDATE/DELETE sobre asignaciones existentes. Cero escrituras en horas, fichajes,
  asistencia o payroll.

## Veredicto P0.3.1
Desktop, creación móvil y **edición móvil** comparten ahora la misma fuente de verdad.
La salud operativa del día cuenta conductores reales. El histórico quedó reparado donde era
inequívoco y documentado, sin tocar nada, donde requería criterio humano.
