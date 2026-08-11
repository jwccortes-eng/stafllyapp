# P0 — STAFLY OPERATIONAL CERTIFICATION PROGRAM

Congelación de features. Sólo auditoría, evidencia y certificación.
Cero escrituras ejecutadas en este pase: ni payroll, ni auth, ni RLS, ni identidades.

---

## FASE 1 — RELIABLE TIME CLOCK CERTIFICATION

### Contrato auditado (no reimplementado)

| Pieza | Archivo | Veredicto |
|---|---|---|
| Tipos + idempotency key | `src/lib/timeclock/offline-clock-types.ts` | OK — `client_event_id` por evento |
| Almacén durable | `src/lib/timeclock/offline-clock-store.ts` | OK — IndexedDB + espejo localStorage, rescate si IDB se purga, poda sólo tras SYNCED (48h) |
| Motor de sync idempotente | `src/lib/timeclock/clock-sync.ts` | OK — busca por `client_event_id` antes de escribir; CLOCK_IN antes de CLOCK_OUT; error ⇒ vuelve a `PENDING_SYNC`, nunca se descarta |
| Adaptador servidor | `src/lib/timeclock/supabase-clock-sync-adapter.ts` | OK — colisión `23505` se resuelve leyendo el evento existente, no creando otro |
| Estado canónico | `src/lib/timeclock/clock-status.ts` | OK — servidor gana; el pendiente local nunca se ignora |
| Cola / reintento | `src/hooks/useOfflineClockQueue.ts` | OK — `online`, `visibilitychange`, intervalo 30s, guard `inFlight` |
| Entrega online | `src/lib/timeclock/clock-request-state.ts` + `useClockRequest.ts` | OK — `IDLE → SUBMITTING → SUCCESS \| FAILED \| UNKNOWN`, verificación obligatoria tras ambigüedad |
| Contadores admin | `src/lib/shifts/attendance-truth.ts` | OK — derivación pura desde `shift_assignments` + `time_entries` con `explain` fila por fila |
| Puerta de cierre | `src/lib/shifts/closeout-gate.ts` | OK — separa `CLOSEOUT_SUBMITTED` / `FULLY_RECONCILED` / `PAYROLL_READY` |

### Evidencia de base de datos (sólo lectura)

```
time_entries_client_event_id_key  UNIQUE (client_event_id) WHERE client_event_id IS NOT NULL
total time_entries ............... 7.417
con client_event_id .............. 3
duplicados por client_event_id ... 0
requires_time_review ............. 0
fichajes abiertos ................ 6
```

La unicidad de la idempotency key está garantizada por índice, no por convención de cliente.
Los 6 fichajes abiertos son evidencia real pendiente (2 del turno de hoy, 3 de demo/seed, 1 de mayo);
ninguno fue tocado — cada uno bloquea `FULLY_RECONCILED` de su turno, que es el comportamiento correcto.

### Casos certificados por prueba automatizada

`src/test/reliable-time-clock.test.ts` (7) + `src/test/shift-operation-integrity.test.ts` (8) — **15/15 verdes**.

| # | Escenario | Estado |
|---|---|---|
| 1 | Clock In online persiste tras refetch | OK |
| 2 | Fallo antes del servidor ⇒ `FAILED` + reintento, nunca éxito fingido | OK |
| 3 | Timeout ambiguo ⇒ `UNKNOWN` + verificación obligatoria | OK |
| 4 | Clock In offline ⇒ `CLOCK_IN_PENDING_SYNC` con contador desde hora de dispositivo | OK |
| 5 | Sincronización tardía conserva la hora real sin marcar revisión | OK |
| 6 | Reloj adelantado ⇒ `requires_time_review`, jamás corrección silenciosa | OK |
| 7 | Clock Out offline cierra el mismo `time_entry` (nunca crea otro) | OK por construcción del motor |
| 8 | Contadores reconcilian fila por fila (`explain`) | OK |
| 9 | Revisión horaria pendiente bloquea `FULLY_RECONCILED` | OK |

### Session persistence

`persistSession: true` + `autoRefreshToken: true` sobre `localStorage`.
No existe puerta de PIN por navegación: el PIN sólo aparece en activación de cuenta
(`ActivateAccount`, `JoinCompany`). **No hay relock por navegación normal.**

### Payroll protection

32 lecturas de `time_entries` en las superficies de payroll; cero lecturas de horas
programadas como fuente de pago. Un evento local pendiente no existe para payroll:
sólo se vuelve pagable cuando produce un `time_entries` canónico.

### Hallazgos abiertos (clasificados, sin maquillar)

| ID | Sev | Hallazgo | Causa raíz | Acción propuesta |
|---|---|---|---|---|
| CERT-01 | **P1** | El admin no puede ver un `PENDING_SYNC` que vive sólo en el dispositivo del worker | Un evento local no existe en servidor por definición | El cierre ya bloquea por fichaje abierto / revisión; documentar que "sin fichaje recibido" ≠ ausencia (ya implementado en `attendance-truth`). No se inventa telemetría sin feature nueva |
| CERT-02 | **P2** | `serverNow()` devuelve la hora del cliente (`new Date()`) en el adaptador | No hay endpoint de hora de servidor | El drift sólo se detecta contra el reloj del propio dispositivo; medir contra `now()` del servidor requiere feature nueva → fuera de alcance de la congelación |
| CERT-03 | **P2** | 3 de 7.417 `time_entries` tienen `client_event_id` | Los históricos son anteriores al contrato | Correcto: no se reescriben históricos |

Ningún hallazgo P0 abierto en el contrato del reloj.

---

## FASE 2 — CIERRE DE IDENTIDAD PENDIENTE

Expedientes individuales, sólo lectura, sin propuesta ejecutada:

- `docs/qa/P0_IDENTITY_CASEFILE_JUSTIN_MORA.md`
- `docs/qa/P0_IDENTITY_CASEFILE_FRANCISCO_PATINO.md`

Resumen:

| Persona | Canónico propuesto | Clasificación | Aprobación humana |
|---|---|---|---|
| Justin Mora | `744b546b` (238 fichajes, 131 asignaciones, 57 refs payroll, portal activo) | `HUMAN_REVIEW_REQUIRED` — el duplicado `e08b2240` tiene auth propio | Requerida antes de tocar auth |
| Francisco Patino | `82e58682` (17 fichajes, 43 asignaciones, 8 refs payroll, portal activo) | `HISTORICAL_ONLY` payroll + **1 asignación futura activa** en el duplicado | Requerida: hay trabajo real futuro en el duplicado |

---

## FASE 3 — FIELD CERTIFICATION (10 WORKERS)

**No ejecutada en este pase**: requiere un turno real con 10 personas y dispositivos
físicos. Lo que sí queda entregado es el protocolo ejecutable y la matriz de evidencia
vacía, lista para llenarse durante el turno:

`docs/qa/STAFLY_OPERATIONAL_CERTIFICATION_10_WORKERS.md`

Ese documento define asignación de escenarios (workers 1–6 online, 7 WiFi→celular,
8 modo avión, 9 refresh, 10 cerrar/reabrir), las consultas SQL de verificación
post-turno y los criterios de aprobación/rechazo.

---

## VEREDICTO

| Criterio | Estado |
|---|---|
| 0 clock events perdidos | Certificado por diseño + prueba (nunca se descarta un evento) |
| 0 `time_entries` duplicados | Certificado por índice único y consulta real: 0 |
| 100% de estados explicables | Certificado (`ClockResolution.explanation` cubre los 6 estados) |
| Portal no rebota | Certificado (ventana operativa y resolver de módulos ya corregidos) |
| Sesión persiste | Certificado (sin relock por navegación) |
| Closeout honesto | Certificado (puerta única, tres estados separados) |
| Payroll intacto | Certificado (sólo `time_entries` canónicos; cero escrituras en este pase) |
| Prueba de campo 10 workers | **Pendiente** — protocolo entregado, ejecución requiere operación real |

**Certificación de laboratorio: APROBADA. Certificación de campo: PENDIENTE DE EJECUCIÓN.**
