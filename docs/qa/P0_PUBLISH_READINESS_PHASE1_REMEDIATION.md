# P0 — PUBLISH READINESS REMEDIATION · PHASE 1

Fecha: 2026-08-18 · Alcance: publicación de servicios (draft → published)
Auditoría origen: `docs/qa/P0_PUBLISH_READINESS_SSOT_AUDIT.md`

## 1. Causa raíz

Tres reglas de readiness divergentes y una identidad de error equivocada:

1. El chip "Borradores listos para publicar" contaba `filteredShifts.filter(isDraftShift).length` — cantidad de borradores, no readiness.
2. "Publicar listos" iteraba todos los borradores del filtro y descubría blockers en el RPC.
3. `publish_shift_draft` exigía `assignments > 0` de forma universal, contradiciendo el modelo Claim/Open Staffing ya existente (`claimable`, pestaña "Disponibles", `resolveShiftCapacity`, `canAnnounceOpenShift`, notificaciones `shift_claimable`).
4. Segmentos con `status='cancelled'` conservaban `publication_status='draft'` y entraban al bulk.
5. El error se reportaba con `getShiftDisplayIdentity(...).primaryRef`, que para un segmento es el QK del servicio raíz → "QK-001651 falta assignments" cuando el raíz ya estaba publicado y el registro real era el segmento **QK-001657**.

## 2. Archivos modificados

- `src/lib/shifts/publish-readiness.ts` — **nuevo** adapter compartido (puro).
- `src/pages/admin/Shifts.tsx` — chip, publicación individual, bulk publish, identidad del error.
- `src/test/publish-readiness-phase1.test.ts` — **nuevo**, casos A–F.

## 3. Funciones / RPC modificados

- `public.publish_shift_draft(_shift_id uuid)` — guarda de estado terminal, rama Claim vs Direct, payload enriquecido (`staffing_mode`, `assigned_count`, `required_count`, `open_slots`). Se conservan permiso `service.publish`, tenant, `date`, `start_time`, `end_time` y la transición atómica.
- `resolveDraftPublishReadiness()` / `selectPublishableDrafts()` / `describePublishBlockers()` — espejo cliente exacto de esa regla. Reutiliza `resolveShiftCapacity` y `isCancelledOrArchivedShift`: **no** se creó un segundo modelo de capacidad.

## 4. Regla final · Direct Staffing (`claimable = false`)

Sin cambios de protección: requiere ≥ 1 asignación **activa** (se descartan `cancelled/canceled/removed/unassigned/replaced/rejected/declined` y `removed_at`). Antes el backend contaba `status <> 'cancelled'`, así que una asignación rechazada bastaba para publicar; ahora el vocabulario coincide con `getShiftStaffingMetrics`.

## 5. Regla final · Claim / Open Staffing (`claimable = true`)

Publica con 0/Y o X/Y. Único requisito de dotación: `slots > 0` (capacidad real). No exige asignación previa. La cobertura se devuelve en el payload y la calcula `resolveShiftCapacity` en el cliente.

## 6. Tratamiento de cancelled

Terminal en ambos lados. `status='cancelled'`, `publication_status in ('cancelled','archived')` o `deleted_at` → nunca ready, nunca en bulk, y el RPC rechaza con `missing:['cancelled'], terminal:true` aunque se le llame directo. **Cero migración de datos**: los 23 borradores técnicamente cancelados quedan intactos, solo dejan de ser publicables.

## 7. Comportamiento bulk

`selectPublishableDrafts` filtra publicados, locked, cancelados y BLOCKED. Solo los READY llegan al RPC, uno por uno, con aislamiento por servicio. Éxitos y fallos se reportan individualmente; los BLOCKED se informan aparte como aviso, no como error. Un fallo no cambia estado de otros, no genera estado fantasma, no notifica y no toca asignaciones.

## 8. Comportamiento individual

`executePublishShift` evalúa readiness antes del RPC y aborta con el motivo exacto. Se mantiene el doble cinturón: si el cliente estuviera desactualizado, el backend vuelve a rechazar.

## 9. Notification safety

Verificado antes de implementar: **no existe ningún trigger de BD que emita `shift_claimable`**. Los triggers de `scheduled_shifts` son numeración, jerarquía de segmentos, cancelación (`notify_employees_on_shift_change`, solo soft-delete), cambio material y versión. Las notificaciones de publicación y reclamo se emiten exclusivamente desde el cliente, dentro del bucle, **solo para el servicio efectivamente publicado por la acción actual**, con destinatarios filtrados por `company_id = selectedCompanyId` e `is_active`. Por tanto no hay broadcast retroactivo posible sobre los 8 borradores claimable existentes: nadie se notifica hasta que un operador los publica.

## 10. Censo (estado actual, sin modificar nada)

| Métrica | Valor |
|---|---|
| Total drafts | 108 |
| Cancelados que aún son `publication_status='draft'` | 23 |
| READY direct | 20 |
| BLOCKED direct por staffing | 57 |
| READY claimable con 0 asignaciones | 8 |
| READY claimable parcialmente cubiertos | 0 |
| BLOCKED claimable por capacidad (`slots=0`) | 0 |
| BLOCKED por fecha/horario faltante | 0 |

Antes del fix el chip decía **108**; ahora dice **28** (20 direct + 8 claim), que es exactamente lo que la acción puede publicar. Los 8 claimable eran **impublicables** antes de esta fase; todos pertenecen a un único tenant (Quality Staff).

## 11. QA results

Unitario (`bunx vitest run`, 19/19 verde, incluye la suite canónica de publication-truth):

| Caso | Escenario | Esperado | Resultado |
|---|---|---|---|
| A | direct, 0 asignaciones | BLOCKED | ✅ `assignments` |
| B | direct, ≥1 activa | READY | ✅ |
| C | claim, 0 asignaciones, slots>0 | READY | ✅ `open_slots=4` |
| C.1 | claim, slots=0 | BLOCKED | ✅ `capacity` |
| D | claim parcial 2/4 | READY + cobertura | ✅ `2 asignados / 2 abiertos` |
| E | `status=cancelled` + `publication_status=draft` | NO READY | ✅ terminal |
| F | bulk mezclado (ready direct, ready claim, blocked, cancelled, publicado, locked) | solo 2 intentos | ✅ |
| G | segmento hijo falla | identifica hijo + raíz | ✅ `QK-001657 (servicio QK-001651)` |

Backend: la equivalencia de la rama Claim/Direct/terminal se validó por consulta de censo sobre los 108 borradores reales (misma expresión SQL que la función). **No se publicó ningún borrador real como parte del QA** — la única publicación previa fue QK-001652, de la fase anterior.

## 12. Tenant isolation

`publish_shift_draft` sigue exigiendo `has_permission(actor, _shift.company_id, 'service.publish')` sobre la compañía del propio turno. Trabajadores sin ese permiso siguen sin poder publicar (rama `NOT_AUTHORIZED` intacta). Los destinatarios de notificación se acotan a `selectedCompanyId`.

## 13. Regresión payroll / time_entries / asignaciones

Cero escrituras sobre `shift_assignments`, `time_entries`, payroll, identidad, membresías, documentos, chat o RLS. La migración solo redefine una función; no se creó, alteró ni borró ninguna tabla, política ni trigger. Los servicios ya publicados no se tocan. Portal My Shifts y la pestaña "Disponibles" no cambian de contrato: leen `claimable` + `publication_status='published'` como siempre.

## 14. Deuda pendiente · SSOT Phase 2

1. Los requisitos de compañía (`require_client`, `require_location`, `require_shift_admin`, conductor, `max_shift_hours`, punto de encuentro) siguen viviendo **solo** en `getServicePublishReadiness` (editor) y no se evalúan en el backend. Moverlos exige censo previo: hoy hay publicaciones productivas que los violarían.
2. Falta el RPC `service_publish_readiness(_shift_id)` que devuelva `{ok, blockers, warnings, coverage}` y sea llamado tanto por `publish_shift_draft` como por la UI, dejando el adapter como espejo puro.
3. `require_shift_admin` sigue aplicándose como gate de bulk en el cliente, fuera del adapter.
4. Los 23 borradores cancelados deberían normalizarse a `publication_status='cancelled'` en una migración de higiene separada (hoy solo están neutralizados funcionalmente).

## 15. Veredicto

🟢 **GO** — Las tres divergencias demostradas están cerradas, el modelo Claim/Open Staffing queda operativo por primera vez (8 servicios desbloqueados), cancelado es terminal en ambos lados y los errores identifican el registro real. Sin riesgo de notificación retroactiva ni de estado fantasma. La deuda restante está acotada y documentada para Phase 2.
