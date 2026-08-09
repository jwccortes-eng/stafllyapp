# P0 — BULK SERVICE CREATION · FAILURE TRACE

**Sin fix aplicado.** Solo diagnóstico y prueba.

## Frase inequívoca

> La creación masiva falla porque **`attendance_mode` llega con el valor `"manual"`**,
> un valor que la base de datos **no acepta** (`CHECK attendance_mode IN
> ('clock','arrival','hybrid')`), mientras la creación individual envía `"clock"`
> desde el estado del asistente (`Shifts.tsx:564`). El valor inválido se fija en
> `bulkRowToSnapshot` (`src/lib/shifts/bulk-service-creation.ts:227`) y viaja
> intacto por `buildCanonicalServiceInsert` (`recurrence.ts:149`) hasta el insert.

No es cliente, no es venue, no es tenant, no es RLS. Se demuestra abajo.

## Prueba directa contra la base (transacción revertida)

```sql
BEGIN;
INSERT INTO scheduled_shifts (company_id,title,date,start_time,end_time,slots,
  attendance_mode,clock_method,publication_status,status)
VALUES (<company>,'trace','2026-09-09','17:00','23:00',NULL,'manual','both','draft','open');
-- ERROR: new row violates check constraint "scheduled_shifts_attendance_mode_check"
ROLLBACK;

BEGIN;
-- idéntico, cambiando SOLO attendance_mode
... 'clock' ... ;   -- INSERT 0 1  ✅
ROLLBACK;
```

Un único campo distingue el fallo del éxito. `slots = NULL`, `client_id = NULL`,
`location_id = NULL`, `publication_status = 'draft'` y `status = 'open'` son
todos aceptados.

## Primera fila fallida — trazado completo

| # | Dato | Valor |
|---|---|---|
| 1 | Payload UI (fila) | `{ date:"2026-09-09", clientRaw:"Imperial", clientId:null, locationRaw:"", locationId:null, startTime:"17:00", endTime:"23:00", headcount:null, title:"" }` |
| 2 | Payload al helper canónico | snapshot con `attendanceMode:"manual"`, `clockMethod:"both"`, `payType:"hourly"`, `dayType:"full_day"`, `carCapacity:5`, `requestedHeadcount:1`, `publicationIntent:"draft"` |
| 3 | Validación de fila | `status:"incomplete"`, `blockers:[]` → la fila **sí** se planifica (la validación de UI no es la causa) |
| 4 | company_id | correcto, el de la empresa activa |
| 5 | client_id | `null` (texto preservado en `notes`) — aceptado por la DB |
| 6 | venue/location_id | `null`; `job_site_address` con el texto — aceptado |
| 7 | service_date | `2026-09-09` |
| 8 | start_time | `17:00` |
| 9 | end_time | `23:00` |
| 10 | publication_status | `draft` (`published_at=null`) |
| 11 | idempotency key | `reconciliation_hash = bulk:<batchId>:<rowId>` |
| 12 | error Supabase | `new row for relation "scheduled_shifts" violates check constraint "scheduled_shifts_attendance_mode_check"` |
| 13 | code | `23514` |
| 14 | message | igual a (12) |
| 15 | details | `Failing row contains (... , manual, ...)` |
| 16 | hint | *(ninguno)* |
| 17 | constraint / RLS | CHECK `scheduled_shifts_attendance_mode_check`. **RLS no interviene** |
| 18 | Dónde se pierde el dato | `src/lib/shifts/bulk-service-creation.ts:227` → `bulkRowToSnapshot` fija `attendanceMode:"manual"` |

El fallo es determinista y por fila: por eso **3 de 3** fallan.

## Comparación individual vs masivo

| Campo | Individual (funciona) | Masivo (falla) | Diferencia |
|---|---|---|---|
| `attendance_mode` | `clock` (`Shifts.tsx:564`) | **`manual`** | **Viola el CHECK — única causa** |
| `clock_method` | `both` | `both` | — |
| `client_id` | uuid o `null` | `null` | ninguna (null es legal) |
| `location_id` | uuid o `null` | `null` | ninguna |
| `job_site_address` | texto o null | texto pendiente | ninguna |
| `slots` | número | `NULL` | ninguna (columna nullable) |
| `status` | `draft` (canónico) | `open` (sobrescrito en `bulk-create-write.ts:56`) | sin CHECK; no bloquea |
| `publication_status` | `draft` | `draft` | — |
| `company_id` | empresa activa | empresa activa | — |
| `reconciliation_hash` | `series:...` / ausente | `bulk:...` | — |
| helper invocado | `buildCanonicalServiceInsert` | `buildCanonicalServiceInsert` | **mismo camino** |

## ¿Usa el mismo helper canónico?

Sí. `createBulkDraftServices` → `buildCanonicalServiceInsert` → insert directo en
`scheduled_shifts`, exactamente igual que Nuevo Servicio → Guardar borrador.
**Única divergencia real:** los valores del snapshot que arma
`bulkRowToSnapshot`, no la ruta de escritura.

## Hallazgo secundario (mismo defecto, otra pantalla)

`handleQuickCreate` (`src/pages/admin/Shifts.tsx:1550`) envía
`attendanceMode:"standard"`, también fuera del CHECK. El creador rápido desde el
popover del calendario está roto por la misma razón. No hay validación de tipo
porque `SeriesServiceSnapshot.attendanceMode` está declarado como `string`
(`recurrence.ts:71`).

## Fix mínimo propuesto (no aplicado)

1. `bulk-service-creation.ts:227` → `attendanceMode: "clock"`.
2. `Shifts.tsx:1550` → `attendanceMode: "clock"` (y `clockMethod: "both"`).
3. Estrechar `SeriesServiceSnapshot.attendanceMode` al union
   `"clock" | "arrival" | "hybrid"` para que el typecheck impida repetirlo.
4. Superficie de error: mostrar `error.message` de la primera fila fallida en el
   resumen del lote, en vez de un contador mudo de fallos.

Nada de esto toca payroll, time_entries, assignments, Connecteam, ELDM, auth,
RLS, tenants, schema ni datos de producción.

## Fix aplicado (P0 — FIX ATTENDANCE_MODE INVALID VALUES)

| Punto | Antes | Después |
|---|---|---|
| `bulk-service-creation.ts:227` | `attendanceMode: "manual"` | `"clock"` |
| `Shifts.tsx:1550` (Quick Create) | `"standard"` / `clockMethod:"mobile"` | `"clock"` / `"both"` |
| `series-engine.ts:100` | `row.attendance_mode ?? "manual"` | `normalizeAttendanceMode(row.attendance_mode)` |
| `recurrence.ts:71` | `attendanceMode: string` | `attendanceMode: ShiftAttendanceMode` |

`normalizeAttendanceMode` vive en `src/lib/shift-attendance-mode.ts` y sólo
aplica a valores legados leídos de la base (nunca a input de UI): el union
canónico impide en compilación cualquier valor nuevo fuera del CHECK.

Sin cambios de schema, CHECK, payroll, time_entries, RLS, tenants ni Connecteam.

QA: typecheck limpio; `bulk-service-creation.test.ts` (13) y
`recurring-service-creation.test.ts` (17) en verde; suite completa 869 passed
con la única falla preexistente documentada en
`DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md`.
