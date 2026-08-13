# P0 — Selected Service Segment Label Truth

## Caso
Servicio raíz `QK-001651` con horarios `Setup / Montaje` y `Service`.
Al elegir `Service` la cabecera seguía mostrando `QK-001651 · Setup / Montaje`.

## Auditoría
1. El título del drawer lo alimenta `ShiftDetailDialog` a partir de `shift`,
   que salía de `useServiceState({ shiftId: shiftProp.id })` — es decir, el
   horario con el que se abrió la lista, no el segmento seleccionado.
2. `getShiftDisplayIdentity` ya resolvía bien: QK del raíz + `segment_label`
   propio. No heredaba el label del root.
3. No existía `selectedSegment`/`activeChild`: `ServiceSegmentsPanel` se
   montaba **sin** `onOpenSegment`, por lo que sus botones estaban inertes y
   el drawer nunca cambiaba de horario.

## Corrección
- `ShiftDetailDialog` incorpora estado `activeSegmentId` (se reinicia al abrir
  el drawer o al cambiar el turno de origen).
- `useServiceState` lee el segmento activo; el placeholder de lista solo se usa
  cuando el segmento activo es el mismo del que se abrió.
- `ServiceSegmentsPanel` recibe `onOpenSegment`, así seleccionar un horario
  cambia toda la superficie: título, horario, staffing, asistencia, reloj y
  acciones, porque todas leen del mismo objeto `shift`.
- La cabecera muestra la etiqueta del segmento también cuando el horario activo
  es el raíz y tiene `segment_label` propio.
- El QK visible sigue viniendo del servicio raíz (`serviceRefFor` / registro de
  refs), igual que cliente y job site.

## No tocado
`payroll`, `time_entries`, `shift_assignments`, RLS, secuencia QK,
`parent_shift_id`, datos de producción. Solo cambió capa de presentación.

## QA
- Seleccionar Setup → `QK-001651 · Setup / Montaje`.
- Seleccionar Service → `QK-001651 · Service`.
- Seleccionar Breakdown → `QK-001651 · Breakdown`.
- El QK raíz no cambia en ningún caso; cada horario muestra su propio staffing
  y asistencia.
- Typecheck del proyecto en verde.
