# P0 — SERVICE LOCATION FORENSIC AUDIT

**Turno:** `aa4ad840-ff44-40d2-81ab-564ec3fed633` · código `427` · estado `published`
**Modo:** SOLO LECTURA. Cero escrituras, cero fixes.
**Fecha:** 2026-08-11

---

## 1. Valores reales en base de datos

```sql
select id, shift_code, location_id, job_site_location_id, job_site_address,
       meeting_point_location_id, meeting_point, transportation_required, status
from scheduled_shifts where id = 'aa4ad840-ff44-40d2-81ab-564ec3fed633';
```

| Campo | Valor |
| --- | --- |
| `job_site_location_id` | **NULL** |
| `location_id` | **NULL** |
| `job_site_address` | **"3514 West 89th Street, Bloomington, Minnesota 55431, United States"** |
| `meeting_point_location_id` | **NULL** |
| `meeting_point` | **NULL** |
| `transportation_required` | **false** |
| `status` | `published` · `start_time` 01:20 · `end_time` 06:30 · `client_id` `051aa7b7…` |

**El turno SÍ tiene dirección en base de datos.** Es texto libre, no FK.

**¿Archivada o inactiva?** No aplica: no hay ninguna fila de `locations` / `locations_v2` referenciada. Se buscaron coincidencias por dirección y sólo existen registros de otra ciudad (Jackson Heights, NY) — ninguno corresponde a Bloomington, MN. No hay ubicación archivada ni desactivada detrás de este turno.

---

## 2. Qué consume cada pantalla

| Pantalla | Archivo | Función | Resolver | Campos leídos |
| --- | --- | --- | --- | --- |
| **Editor de Servicios** | `src/lib/shifts/pending-flags.ts` · `src/lib/shifts/service-publish-readiness.ts` (usados por `components/shifts/workspace/WorkspaceSummary.tsx`, `PendingBadgeRow.tsx`, `PrePublishDialog.tsx`) | `computeShiftPendingFlags`, `getServicePublishReadiness` | **propio** (duplica la prioridad, no llama a `resolveServiceLocation`) | `locationId`, `jobSiteLocationId`, `jobSiteAddress`, `meetingPoint`, `meetingPointLocationId`, `transportRequired` |
| **Service Command Center** (Copilot / Shifts) | `src/lib/shifts/service-copilot.ts`, `src/pages/admin/Shifts.tsx:2981,3011` | `buildServiceCopilot`, `getShiftLocationStatus` | `location-status` + flags booleanos precalculados en la página | los 5 campos + `transportation_required` (vía `meetingRequired`) |
| **Vista Operacional** (`/app/shift-ops`) | `src/pages/admin/ShiftOperations.tsx:610-614` | `getShiftOperationalStatus`, `getShiftMissingItems` (`src/lib/shifts/shift-operations-intelligence.ts`) | **propio, booleanos inline** | `location_id`, `job_site_location_id`, `job_site_address`, `meeting_point`, `meeting_point_location_id`. **NO lee `transportation_required` para el meeting point.** |
| **Vista Operacional móvil** | `src/components/shifts/mobile/MobileShiftOperationsSheet.tsx:293-303` | `getShiftLocationStatus` | `location-status` | los 5 campos |
| **Portal del trabajador** | `src/pages/portal/PortalShiftDetail.tsx` | `resolveServiceLocation` | **`src/lib/shifts/service-location.ts` (canónico)** | los 6 campos, con hidratación de `locations_v2`/`locations` |
| **Portal — tarjeta de turno** | `src/lib/shifts/smart-work-card.ts:299-311` | `buildSmartWorkCard` → `getShiftLocationStatus` | `location-status` | los 5 campos |
| **Live Map** | `src/hooks/useShiftLiveMap.tsx:71-125` | consulta + fallback manual | **propio** (reimplementa la cascada v2 → legacy → texto) | los 6 campos |
| **Clock In / geofence** | `src/hooks/useLocationTracking.tsx:151-168` | `insertEvent("entered_geofence" / "arrived_job_site")` | **ninguno**: exige un `target` con `latitude/longitude/geofence_radius_meters` | sólo el sitio estructurado. Texto libre = sin coords = **sin geofence** |
| **Daily Ops / colas** | `src/lib/operations/daily-ops-grouping.ts:156` | agrupación de acciones | **propio y defectuoso** | sólo `location_id`, `meeting_point_location_id`, `meeting_point`. **Ignora `job_site_location_id` y `job_site_address`.** |
| **Team Hub del turno** | `src/lib/shifts/team-hub-model.ts:248` | riesgo `no_location` | recibe `hasLocation` del llamador | depende del llamador |

---

## 3. Respuestas

**¿Todas leen exactamente el mismo resolver?**
**No.** Coexisten **cinco** implementaciones de "dónde ocurre el servicio":

1. `src/lib/shifts/service-location.ts` → `resolveServiceLocation` (**el canónico**, único que hidrata las FK y aplica `transportation_required`). Consumidor único: `PortalShiftDetail.tsx`.
2. `src/lib/shifts/location-status.ts` → `getShiftLocationStatus` (clasificación sin hidratar). Usado por Shifts, smart-work-card, sheet móvil.
3. `src/lib/shifts/pending-flags.ts` + `service-publish-readiness.ts` (editor).
4. Booleanos inline en `ShiftOperations.tsx:610-612` alimentando `shift-operations-intelligence.ts`.
5. Cascada duplicada dentro de `useShiftLiveMap.tsx`.

**¿Existe más de una fuente de verdad?**
La *fuente de datos* es una sola (las 6 columnas de `scheduled_shifts`). Lo que está multiplicado es la **capa de resolución**: cinco lecturas distintas de las mismas columnas, con reglas distintas. Por eso el mismo turno puede verse "completo" en una pantalla y "sin ubicación" en otra.

**¿El problema es de datos o de resolución?**
**De resolución.** El dato existe y es operativamente válido: `job_site_address` con dirección completa. Lo único que falta es su forma estructurada (sin FK no hay coordenadas → no hay mapa ni geofence), pero eso es una **degradación conocida y esperada** (`jobSiteKind: "manual"`, `tone: "warn"`), no una ausencia.

**¿La alerta "Falta ubicación" es correcta o es un falso positivo?**
**Falso positivo**, y su origen está localizado:

- `src/lib/operations/daily-ops-grouping.ts:156` evalúa
  `!s.location_id && !s.meeting_point_location_id && !s.meeting_point?.trim()`.
  **Nunca mira `job_site_address` ni `job_site_location_id`.** Con los datos de este turno la condición da `true` → emite `missing_location` con urgencia **high** y el texto "Sin ubicación ni punto de encuentro". Es incorrecto: el turno tiene dirección.
- El mismo defecto se propaga a `team-hub-model.ts:248` cuando el llamador calcula `hasLocation` con la misma regla incompleta.
- En contraste, `getShiftLocationStatus` clasifica correctamente este turno como `manual_address` / tono `warn` ("Dirección manual agregada · falta guardar como Job Site para mapa/geofence"), y `ShiftOperations.tsx:610` también resuelve `hasLocation = true`.

**¿La alerta "Sin punto de encuentro" debería mostrarse con `transportation_required = false`?**
**No.** La regla canónica está escrita en `service-location.ts:18`: *"El punto de encuentro SOLO es relevante si `transportation_required`."* Se respeta en:
- `service-location.ts:127` (`requiresMeetingPoint = Boolean(transportation_required)`)
- `pending-flags.ts:62` (`meetingMissing = v.transportRequired && …`)
- `service-publish-readiness.ts:210` (`if (v.transportRequired && !hasMeetingPoint)`)
- `service-copilot.ts:205` (`meetingDone = !meetingRequired || hasMeetingPoint`)
- `useShiftLiveMap.tsx:132`

Se **viola** en un único punto: `src/lib/shifts/shift-operations-intelligence.ts`, que nunca consulta `transportation_required`:
- **línea 198** → estado `published_needs_info`: *"Publicado pero falta punto de encuentro. El worker no sabrá dónde llegar."*
- **línea 247** → `MissingItem` `meeting_point`: *"Falta punto de encuentro"* con severidad `warn`
- **línea 165** → equivalente en borrador

Y `ShiftOperations.tsx:612-614` le pasa `hasMeetingPoint = false` sin condicionar por transporte. Con `transportation_required = false` este aviso es **falso positivo por diseño del helper**, no por los datos.

---

## 4. Causa raíz

> El turno tiene una dirección válida. Dos helpers que **no** consumen el resolver canónico la ignoran: `daily-ops-grouping` no mira `job_site_address`, y `shift-operations-intelligence` no mira `transportation_required`. La causa raíz es la fragmentación del resolver — cinco lecturas de las mismas seis columnas —, no la calidad del dato.

Consecuencia real y **legítima** (no es alerta falsa): sin FK a `locations_v2` no hay `latitude/longitude/geofence_radius_meters`, por lo que **Live Map no puede centrar el pin y Clock In no puede evaluar geofence** para este turno (`useLocationTracking.tsx:151-168` requiere `target` con coordenadas). Ese es el único síntoma con base técnica.

---

## 5. Evidencia mínima para reproducir (solo lectura)

```sql
-- 1) Estado real del turno
select location_id, job_site_location_id, job_site_address,
       meeting_point_location_id, meeting_point, transportation_required
from scheduled_shifts where id = 'aa4ad840-ff44-40d2-81ab-564ec3fed633';

-- 2) Confirmar que no hay ubicación archivada detrás
select id, name, address from locations      where address ilike '%89th%';
select id, name, formatted_address from locations_v2 where formatted_address ilike '%89th%';
-- → sólo direcciones de Jackson Heights, NY. Ninguna en Bloomington, MN.
```

Código: `daily-ops-grouping.ts:156`, `shift-operations-intelligence.ts:165,198,247`, `ShiftOperations.tsx:610-614`, frente a `service-location.ts:112-140` y `location-status.ts:66-120`.

**No se modificó ningún dato ni código.**
