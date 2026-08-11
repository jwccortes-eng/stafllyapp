/**
 * P0 — RELIABLE TIME CLOCK (offline-first).
 *
 * Tipos canónicos del fichaje capturado en el dispositivo. Un evento local
 * NUNCA es una hora pagable: sólo se vuelve verdad cuando se sincroniza y
 * produce un `time_entries` canónico. Payroll sigue leyendo exclusivamente
 * `time_entries`.
 */

export type PendingClockType = "CLOCK_IN" | "CLOCK_OUT";

export type PendingClockStatus =
  | "PENDING_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "FAILED";

export interface ClockGpsSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface PendingClockEvent {
  /** Idempotency key. Se envía al servidor y bloquea duplicados por reintento. */
  client_event_id: string;
  type: PendingClockType;
  employee_id: string;
  company_id: string;
  shift_id: string | null;
  assignment_id: string | null;
  /** time_entry canónico a cerrar (clock-out sobre entrada ya sincronizada). */
  time_entry_id: string | null;
  /** clock-out que cierra un clock-in todavía pendiente en este dispositivo. */
  closes_client_event_id: string | null;
  /** Hora del dispositivo en el momento real del fichaje. */
  event_time_device: string;
  timezone: string;
  device_id: string;
  gps: ClockGpsSnapshot | null;
  within_geofence: boolean | null;
  photo_url: string | null;
  /** true si se capturó sin conectividad o tras un fallo de entrega. */
  offline: boolean;
  status: PendingClockStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  /** Fecha en que el servidor confirmó la escritura. */
  synced_at: string | null;
  /** id del time_entry resultante tras sincronizar. */
  server_time_entry_id: string | null;
}

export interface NewPendingClockEvent
  extends Omit<
    PendingClockEvent,
    "status" | "attempts" | "last_error" | "created_at" | "synced_at" | "server_time_entry_id"
  > {}

export function createClientEventId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && "randomUUID" in c) return c.randomUUID();
  return `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

export function toPendingEvent(input: NewPendingClockEvent): PendingClockEvent {
  return {
    ...input,
    status: "PENDING_SYNC",
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
    synced_at: null,
    server_time_entry_id: null,
  };
}
