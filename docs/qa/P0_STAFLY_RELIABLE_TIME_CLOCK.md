# P0 — STAFLY RELIABLE TIME CLOCK

Offline-first clock-in / clock-out + persistencia de sesión.

## Qué cambió

1. **Trazabilidad canónica** en `time_entries`: `client_event_id` (único), `captured_offline`,
   `event_time_device`, `synced_at`, `sync_delay_seconds`, `requires_time_review`.
2. **Almacén durable** (`offline-clock-store.ts`): IndexedDB + espejo en localStorage.
   Sobrevive refresh, cierre del navegador y cambio de red. Poda a las 48h tras sincronizar.
3. **Idempotencia total**: cada evento lleva `client_event_id` único; el reintento nunca duplica.
4. **Estado único** (`clock-status.ts`): servidor primero, evento local pendiente después.
   El contador de tiempo se deriva del estado canónico, no del ciclo de vida del componente.
5. **Integridad temporal** (`clock-sync.ts` · `evaluateDrift`): se conserva la hora del
   dispositivo. Una sincronización tardía es normal y no marca revisión; un reloj adelantado
   respecto del servidor marca `requires_time_review`. Nunca se corrige en silencio.
6. **Portal** (`PortalClock.tsx`): banner explícito de fichaje pendiente con acción
   "Sincronizar ahora", y bloqueo de un segundo clock-in mientras haya un fichaje vivo.
7. **Admin honesto** (`attendance-truth.ts`): nuevos contadores `Capturados sin conexión` y
   `Requieren revisión`. "No fichó" pasa a "Sin fichaje recibido" — no equivale a ausencia.
8. **Cierre** (`closeout-gate.ts`): un fichaje con revisión horaria pendiente bloquea
   `FULLY_RECONCILED`; los capturados sin conexión aparecen como advertencia declarada.

## Payroll

Protegido. Payroll sigue leyendo exclusivamente `time_entries` canónicos; ningún evento
local pendiente entra en cálculo ni en horas pagables.

## Sesión

El cliente ya usa `persistSession: true` + `autoRefreshToken: true` sobre localStorage, y el
portal no tiene puerta de PIN por navegación: la sesión sobrevive refresh y cierre de app.

## Pruebas

`src/test/reliable-time-clock.test.ts` (7) y `src/test/shift-operation-integrity.test.ts` (8) — verdes.
