# P0 — SHIFT OPERATION INTEGRITY FIX

Fuente: `docs/qa/P0_QK001592_REAL_SHIFT_FORENSIC_AUDIT.md`
Alcance: entrega del fichaje, puerta única de cierre y contadores veraces.
Sin cambios en payroll, sin reescritura de históricos, sin deduplicación, sin tocar QK-001592.

---

## P0-A — Clock-in delivery integrity

**Nuevo:** `src/lib/timeclock/clock-request-state.ts` (máquina pura) y `src/hooks/useClockRequest.ts`.

Estados explícitos: `IDLE → SUBMITTING → SUCCESS | FAILED | UNKNOWN`.

| Regla | Implementación |
|---|---|
| Sin doble submit | `SUBMIT` es ignorado si hay request vivo (`inFlight` + reducer guard) |
| “Enviando…” visible | `clockButtonLabel()` gobierna el texto del botón |
| Nunca fingir éxito | `CONFIRMED` sólo se emite tras resolver la promesa del servidor |
| Fallo claro + reintentar | `FAILED` muestra banner rojo con mensaje real y botón *Reintentar* |
| Resultado ambiguo | `isAmbiguousFailure()` (red, timeout, 5xx, offline) ⇒ `UNKNOWN`, nunca reintento a ciegas |
| Refetch antes de re-habilitar | `verify()` relee `time_entries` reales; sólo entonces sale de `UNKNOWN` |
| Refetch canónico tras éxito | `onConfirmed` ejecuta `loadData()` |
| Sin entries locales falsos | La UI no crea ni mutila estado local de `time_entries` |

**Integración:** `src/pages/portal/PortalClock.tsx`. `handleClockIn`/`handleClockOut` corren dentro de `clockRequest.submit`. Los bloqueos de política (GPS obligatorio, fuera de geocerca) lanzan error con mensaje humano ⇒ `FAILED` explicable, no ambigüedad. `setSelectedShift(null)` ya no precede a un refetch fallido: el refetch canónico ocurre en `onConfirmed`.

---

## P0-B — Single closeout gate

**Nuevo:** `src/lib/shifts/closeout-gate.ts` — único validador previo al cierre.

Estados separados y no intercambiables:

- `CLOSEOUT_SUBMITTED` — el capitán entregó su cierre operativo.
- `FULLY_RECONCILED` — la evidencia real no tiene pendientes.
- `PAYROLL_READY` — firma final + horas sin pendientes de revisión.

Bloqueadores evaluados: fichajes abiertos (activos + falta salida), horas pendientes de revisión, asistencia manual sin validar, incidencias sin resolver, turno aún no terminado. Avisos: personas sin fichaje, extras sin asignación.

**Integración:** `CaptainCloseoutForm.tsx` usa `evaluateCloseoutGateFromEvidence`. La segunda puerta ya no puede saltarse validaciones: puede enviarse el cierre, pero se lista cada pendiente, el aviso declara explícitamente que el turno **no** queda reconciliado ni listo para payroll, y el toast de éxito lo repite.

---

## P0-C — Truthful counters

**Nuevo:** `src/lib/shifts/attendance-truth.ts`. Derivación pura desde `shift_assignments` + `time_entries`, con `explain` fila por fila.

| Contador | Fuente canónica |
|---|---|
| Fichados | `clock_in` válido (incluye a quien ya salió) |
| Salidas | `clock_out` válido |
| Activos | `clock_in` válido + `clock_out` null |
| Falta salida | fichaje abierto con ventana vencida (+gracia) |
| No fichó | asignación vigente sin fichaje válido |
| Confirmados | estado canónico de asignación |
| Incidencias | falta salida + no fichó + extras |

**Integración:** `LiveShiftBoard.tsx` sustituye los conteos derivados de agrupaciones visuales. El caso “0 fichados / 2 salidas” es ahora imposible por construcción.

---

## QA

`src/test/shift-operation-integrity.test.ts` — 8 pruebas verdes.

| Caso | Resultado |
|---|---|
| 1 · Clock-in exitoso persiste tras refetch | Cubierto por `verify()` + `onConfirmed` |
| 2 · Fallo antes del servidor | `FAILED` + reintento, nunca éxito fingido |
| 3 · Timeout ambiguo | `UNKNOWN` → verificación obligatoria antes de re-habilitar |
| 4 · Time entry abierto | `canFullyReconcile = false`, estado `CLOSEOUT_SUBMITTED` ✅ |
| 5 · Cierre con pendientes | `CLOSEOUT_SUBMITTED` + lista de pendientes visible ✅ |
| 6 · Contadores | Cada número reconcilia con filas reales (`explain`) ✅ |
| 7 · Mariany-like | Fichaje abierto bloquea la reconciliación ✅ |

## Protegido

Payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, RLS, auth, tenants y edge functions sin cambios. Ninguna migración. Evidencia histórica intacta.
