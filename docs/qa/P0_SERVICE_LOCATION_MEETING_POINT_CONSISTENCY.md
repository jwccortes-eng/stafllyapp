# P0 — Consistencia entre Lugar del servicio y Punto de encuentro

Fecha: 2026-08-05 · Alcance: UI + validación de publicación (sin payroll, assignments, RLS ni tenants).

## 1. Modelo real reconstruido

| Concepto | Campos en `scheduled_shifts` | Uso |
| --- | --- | --- |
| Lugar del servicio (Job Site) | `location_id` (FK legado a `locations`), `job_site_location_id` (FK a `locations_v2`), `job_site_address` (texto libre) | Worker portal, mapas, fichaje y geofence (solo con FK), notificaciones |
| Punto de encuentro | `meeting_point` (texto), `meeting_point_location_id` (FK a `locations_v2`) | Convocatoria del equipo y transporte |

- Obligatorio para publicar: **lugar del servicio**, cuando `shifts_config.require_location` está activo. El punto de encuentro nunca es obligatorio y **nunca** satisface el requisito de lugar.
- Mapa y geofence sólo funcionan con un lugar guardado (`location_id` / `job_site_location_id`). Con dirección libre se emite un aviso no bloqueante.
- Validador que generaba “Pendiente antes de publicar: Ubicación”: `validateForPublish()` en `src/pages/admin/Shifts.tsx` (exigía `location_id` e ignoraba `job_site_location_id` y `job_site_address`).

### Causa raíz de la contradicción
1. Los *signals* del formulario daban por satisfecha la ubicación si había cualquier texto en `meeting_point` → “Todo en orden”.
2. El validador de publicación exigía exclusivamente `location_id` → “Pendiente: Ubicación”.
3. Resumen, confirmación y preview usaban la palabra ambigua “Ubicación”/“Job site”, y el punto de encuentro aparecía en el slot del lugar del trabajo.

## 2. Estado canónico único

`src/lib/shifts/service-publish-readiness.ts` → `getServicePublishReadiness(service)`.

Puro, sin acceso a base de datos. Devuelve `blockers`, `warnings`, `canPublish`, `hasJobSite`, `jobSiteKind`, `hasMeetingPoint`, `jobSiteEqualsMeetingPoint`, `canReuseMeetingAsJobSite`.

Consumidores (todos alimentados por la misma función):
- Panel lateral: `ShiftSummaryPanel` (`publishBlockers`) vía `WorkspaceSummary`.
- Confirmación: `PrePublishDialog` (`blockers`) vía `buildPrePublishReview`.
- Botón Publicar y toast de error: `handleCreate` en `Shifts.tsx` y el flujo de publicación de borradores.
- Worker preview: `WorkerPreviewCard`.

Reglas de estado:
- “Todo en orden — listo para publicar” sólo aparece con cero bloqueos.
- Con bloqueos, la confirmación muestra “No se puede publicar todavía” y el CTA queda deshabilitado.

## 3. Lenguaje

- “Lugar del servicio” — dónde se realizará el trabajo (obligatorio).
- “Punto de encuentro” — dónde se reúne el equipo.
- Eliminadas las etiquetas “Ubicación”, “Job site”, “Meeting” y “Dirección del trabajo” de las superficies operativas.

## 4. Doble captura

Cuando hay punto de encuentro y falta el lugar del servicio, la tarjeta de punto de encuentro ofrece la acción explícita **“Usar este punto también como lugar del servicio”**. No hay copia silenciosa en ningún camino.

## 5. Navegación al error

Bloqueo de lugar → mensaje “Falta definir el lugar del servicio” + CTA “Completar lugar” en panel lateral, confirmación y toast. `focusServiceSection()` desplaza y enfoca la tarjeta anclada en `service-job-site-section`.

## 6. QA

| Caso | Escenario | Resultado |
| --- | --- | --- |
| A | Sólo punto de encuentro | Bloqueo “Falta definir el lugar del servicio”; panel, confirmación y publicar coinciden |
| B | Sólo lugar del servicio (dirección libre) | Publicable; aviso no bloqueante de mapa/geofence |
| C | Lugar guardado + punto de encuentro distinto | Publicable; ambas filas visibles y diferenciadas |
| D | Mismo texto en ambos | Se conservan ambos; no hay copia automática |
| E | Reutilizar punto como lugar | La acción explícita rellena `job_site_address`; el bloqueo desaparece |
| F | Publicar borrador existente sin lugar | La confirmación bloquea y ofrece el CTA |

Typecheck del proyecto en verde.

## Confirmación

El Lugar del servicio y el Punto de encuentro son conceptos distintos, se muestran con lenguaje inequívoco y todas las superficies utilizan el mismo estado canónico de publicación.
