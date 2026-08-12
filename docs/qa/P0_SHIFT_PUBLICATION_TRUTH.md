# P0 — SHIFT PUBLICATION TRUTH

Fuente única de verdad para Draft · Assigned · Published · Visible · Notified · Cupo.

Origen: `docs/qa/P0_WILLIAM_RODRIGUEZ_PORTAL_FORENSIC_AUDIT.md`.

## 1. ¿Qué resolver quedó como fuente única?

`src/lib/shifts/publication-truth.ts` → `resolveShiftPublicationTruth(...)`.

Es puro (sin DB, sin escrituras) y reutiliza los predicados base ya existentes
(`shift-guards.ts`) y las métricas de dotación (`staffing-metrics.ts`), de modo
que no se creó una tercera lógica paralela sino un único punto de entrada.

Devuelve:

| Campo | Significado |
|---|---|
| `state` | Estado canónico (ver abajo) |
| `shift_status` | Estado operativo crudo |
| `is_published` / `is_cancelled` | Ciclo de vida |
| `assignment_exists`, `assignment_status` | `none · draft_reservation · active · rejected · removed` |
| `visible_to_worker` | Regla única de visibilidad del portal |
| `notification_eligible`, `notification_status` | `not_eligible · not_sent · sent` |
| `capacity_status` | `required_count · assigned_count · confirmed_count · open_slots · is_full` |
| `worker_action_available` | Puede aceptar / rechazar / fichar |
| `open_call_available` | Convocatoria abierta válida ("turno disponible") |
| `admin_label`, `admin_blocking_reason` | Copy canónico + por qué el worker no lo ve |

Estados canónicos: `DRAFT`, `ASSIGNED_INTERNAL`, `PUBLISHED`,
`VISIBLE_TO_WORKER`, `NOTIFIED`, `ACCEPTED`, `REJECTED`, `CLOCKED_IN`,
`CLOCKED_OUT`, `CLOSED`, `CANCELLED`.

Guardias derivadas (no duplicar en pantallas):
`canAnnounceOpenShift(...)`, `canNotifyAssignedWorker(...)`, `resolveShiftCapacity(...)`.

Regla dura: "existe assignment" **nunca** equivale a "el worker lo ve".

## 2. ¿Qué superficies tenían lógica paralela?

| Superficie | Lógica paralela encontrada | Estado |
|---|---|---|
| `ShiftActionBar` (admin, Service Command Center / shift-ops) | Inferencia local `status === "draft"` y badge que mostraba el estado crudo | Migrado a `admin_label` + motivo de bloqueo |
| `MyShifts` (portal, pestaña Disponibles) | Query sin filtro de `publication_status`; cupo calculado a mano | Migrado a `canAnnounceOpenShift` |
| `EmployeeDashboard` (portal, contador de disponibles) | Mismo cálculo de cupo duplicado y sin ciclo de vida | Migrado a `canAnnounceOpenShift` |
| `MyShifts` (turnos asignados) | Ya usaba filtros canónicos (`deleted_at`, `is_draft_reservation`) | Sin cambios, coherente con el resolver |
| Notificaciones / convocatoria | La elegibilidad se decidía en cada emisor | Guardias únicas expuestas (`canNotifyAssignedWorker`, `canAnnounceOpenShift`) |

## 3. ¿William queda explicado correctamente?

Sí. Con el resolver, sus casos se cuentan igual en las cuatro superficies:

- **A. Assignment interno + Draft** → `ASSIGNED_INTERNAL`; admin lee
  “Asignado internamente · pendiente de publicar” con el motivo
  “El turno sigue en borrador: la persona todavía no puede verlo”;
  portal no lo muestra; notificación `not_eligible`.
- **B. Publicado** → `VISIBLE_TO_WORKER`; el portal lo muestra.
- **C. Publicado + notificado** → `NOTIFIED`; admin lee “Publicado · notificado”.
- **D. Cupo lleno** → `open_call_available = false`; no hay aviso de turno disponible.

Ya no puede ocurrir la pregunta “yo lo asigné, ¿por qué él no lo ve?”: la
respuesta viaja en `admin_blocking_reason`.

## 4. ¿Cuántos falsos “asignados” desaparecen?

Todos los que provenían de inferencia local: cualquier turno con
`publication_status = 'draft'` o con reserva de borrador deja de rotularse
“Asignado” en la barra de acciones admin y pasa a “Asignado internamente ·
pendiente de publicar”. El conteo exacto depende del volumen vivo de
borradores por empresa; el modo de fallo queda cerrado estructuralmente.

## 5. ¿Cuántos avisos de turno disponible inválidos desaparecen?

Desaparecen tres familias completas:

1. turnos en borrador o cancelados/archivados que llegaban a la lista
   “Disponibles” por tener `status='open'` y `claimable=true`
   (la query previa **no** filtraba `publication_status`);
2. turnos con cupo ya cubierto (ahora `open_slots <= 0` corta el aviso);
3. turnos ofrecidos a personas no elegibles (`workerEligible = false`).

## 6. ¿Se tocó algún dato real?

No. Cero migraciones, cero escrituras, cero cambios en auth, RLS, payroll,
`time_entries`, identity resolver, Internal IDs, `scheduled_shifts` schema ni
assignments históricos. Solo lógica de lectura y presentación.

## QA

`src/test/shift-publication-truth.test.ts` — 11 casos, todos en verde:
borrador con assignment, publicado con assignment, publicado sin notificar,
publicado + notificado, aceptado, rechazado, reserva de borrador, cupo lleno,
convocatoria con cupos, cancelado, worker no elegible, fichaje/cierre.
Suites relacionadas (`shift-guards`, `staffing-metrics`) siguen en verde.
Typecheck del proyecto limpio.
