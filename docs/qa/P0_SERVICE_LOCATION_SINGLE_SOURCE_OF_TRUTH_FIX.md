# P0 — SERVICE LOCATION SINGLE SOURCE OF TRUTH (FIX)

Fuente: `docs/qa/P0_SERVICE_LOCATION_FORENSIC_AUDIT.md`
Estado: **IMPLEMENTADO** · Solo lectura sobre datos (cero migraciones, cero escrituras)

## 1. Modelo canónico

Un único resolver: `src/lib/shifts/service-location.ts`.

`ServiceLocationTruth` separa tres preguntas que antes se mezclaban:

| Dimensión | Campo | Regla |
|---|---|---|
| A. Destino operativo | `destinationStatus` / `destinationSource` | `job_site_location_id` → `location_id` → `job_site_address`. Si existe cualquiera → `RESOLVED`. |
| B. Readiness geoespacial | `geospatialStatus`, `hasCoordinates`, `mapReady` | `COORDINATES` / `ADDRESS_ONLY` / `UNKNOWN` / `NONE`. Solo `COORDINATES` habilita mapa y geocerca. |
| C. Punto de encuentro | `meetingPointRequired`, `meetingPointMissing` | `meetingPointRequired = transportation_required === true`. Sin transporte nunca falta. |

Prioridad dura corregida: una FK declarada gana sobre el texto libre aunque la fila no esté hidratada en esa pantalla.

## 2. Resolvers paralelos eliminados

| Superficie | Antes | Ahora |
|---|---|---|
| `pages/admin/Shifts.tsx` | cascada inline | `getShiftLocationStatus` canónico |
| `MobileShiftOperationsSheet.tsx` | `noLocation` inline | `destinationStatus` |
| `lib/operations/daily-ops-grouping.ts` | ignoraba `job_site_address` | `resolveShiftLocationTruth` |
| `lib/shifts/shift-operations-intelligence.ts` | `ctx.hasLocation/hasMeetingPoint` | verdad derivada del turno; `ctx` heredado ignorado |
| `pages/admin/ShiftOperations.tsx` | 3 booleanos inline | sin booleanos |
| `lib/shifts/pending-flags.ts` | `hasManualAddress` / `hasStructuredJobsite` | verdad canónica |
| `lib/shifts/build-pre-publish-review.ts` | duplicaba la cascada | verdad canónica |
| `lib/shifts/service-publish-readiness.ts` | cascada propia | delega al resolver |
| `hooks/useShiftLiveMap.tsx` | cascada + falso "free-text venue" | expone `locationTruth` |
| `components/shifts/ShiftLiveMapPanel.tsx` | "No job site set" | distingue "Dirección sin coordenadas" |
| `lib/shifts/location-status.ts` | lógica propia | shim deprecado que reexporta |

## 3. Falsos positivos cerrados

- **"Falta ubicación"** en Daily Ops: una dirección de texto libre ahora cuenta como destino.
- **"Sin punto de encuentro"**: solo aparece con `transportation_required = true`.
- **Live Map**: ya no dice "sin job site" cuando hay dirección; explica que faltan coordenadas y ofrece convertirla en Job Site.

## 4. Limitación real preservada

Sin coordenadas (`ADDRESS_ONLY`) el mapa en vivo y la geocerca del clock siguen deshabilitados, con copy único (`geospatialHint`). No es una alerta de error: es una capacidad no disponible.

## 5. QA — Turno 427 (`aa4ad840-ff44-40d2-81ab-564ec3fed633`)

Datos: `job_site_address` con dirección completa, FKs en NULL, `transportation_required = false`.

`src/test/service-location-ssot.test.ts` (7/7 en verde):

- destino `RESOLVED` con fuente `free_text`
- `geospatialStatus = ADDRESS_ONLY`, `mapReady = false`
- `meetingPointMissing = false`
- Operaciones: **sin** `job_site`, **sin** `meeting_point`; solo aviso informativo `job_site_coordinates`
- Editor: `jobsite_unsaved` en lugar de `jobsite_missing`
- Con transporte activo sí exige punto de encuentro
- FK estructurada gana sobre texto libre

## 6. Verificación global

- Typecheck: limpio.
- Suite: 1121 pasadas. Único fallo: `driver-sync-roundtrip` (preexistente, requiere contexto de empresa en BD; sin relación con ubicación).
