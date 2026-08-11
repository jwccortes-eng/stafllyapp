/**
 * P0 — RELIABLE TIME CLOCK · resolver canónico de estado de fichaje.
 *
 * ÚNICA fuente de verdad del estado visible en Portal, Attendance, Service
 * Command Center, Closeout y Admin. Puro: no toca red ni React.
 *
 * Precedencia:
 *   1. time_entry canónico del servidor
 *   2. evento local PENDING_SYNC (nunca se ignora: el worker lo vio)
 */
import type { PendingClockEvent } from "./offline-clock-types";

export type ClockStatus =
  | "NOT_STARTED"
  | "CLOCK_IN_PENDING_SYNC"
  | "CLOCKED_IN"
  | "CLOCK_OUT_PENDING_SYNC"
  | "COMPLETED"
  | "REVIEW_REQUIRED";

export interface CanonicalTimeEntry {
  id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  requires_time_review?: boolean | null;
}

export interface ClockResolution {
  status: ClockStatus;
  /** Instante desde el que corre el contador (server o dispositivo). */
  startedAt: string | null;
  /** Fin efectivo cuando ya terminó. */
  endedAt: string | null;
  /** Origen de la verdad mostrada. */
  source: "server" | "device" | "none";
  /** Entrada canónica asociada, si existe. */
  entry: CanonicalTimeEntry | null;
  /** Evento local que sostiene el estado, si aplica. */
  pending: PendingClockEvent | null;
  /** Explicación en una línea para la UI (worker y admin). */
  explanation: string;
}

export interface ResolveClockInput {
  shiftId: string | null;
  entries: CanonicalTimeEntry[];
  pending: PendingClockEvent[];
}

const isLive = (e: PendingClockEvent) =>
  e.status === "PENDING_SYNC" || e.status === "SYNCING" || e.status === "FAILED";

/**
 * Resuelve el estado de un (worker, turno). Si `shiftId` es null se considera
 * cualquier fichaje abierto del worker.
 */
export function resolveClockStatus(input: ResolveClockInput): ClockResolution {
  const { shiftId } = input;
  const matchShift = <T extends { shift_id: string | null }>(x: T) =>
    shiftId == null || x.shift_id === shiftId;

  const entries = input.entries.filter(matchShift);
  const pending = input.pending.filter(isLive).filter(matchShift);

  const reviewEntry = entries.find((e) => e.requires_time_review === true);
  const openEntry = entries.find((e) => !e.clock_out) ?? null;
  const closedEntry =
    [...entries].filter((e) => !!e.clock_out).sort((a, b) => b.clock_out!.localeCompare(a.clock_out!))[0] ?? null;

  const pendingOut = pending.find((p) => p.type === "CLOCK_OUT") ?? null;
  const pendingIn = pending.find((p) => p.type === "CLOCK_IN") ?? null;

  if (pendingOut) {
    const startedAt = openEntry?.clock_in ?? pendingIn?.event_time_device ?? null;
    return {
      status: "CLOCK_OUT_PENDING_SYNC",
      startedAt,
      endedAt: pendingOut.event_time_device,
      source: "device",
      entry: openEntry,
      pending: pendingOut,
      explanation: "Salida registrada en este dispositivo. Pendiente de sincronizar.",
    };
  }

  if (openEntry) {
    if (openEntry.requires_time_review) {
      return {
        status: "REVIEW_REQUIRED",
        startedAt: openEntry.clock_in,
        endedAt: null,
        source: "server",
        entry: openEntry,
        pending: null,
        explanation: "Fichaje sincronizado con diferencia horaria sospechosa. Requiere revisión.",
      };
    }
    return {
      status: "CLOCKED_IN",
      startedAt: openEntry.clock_in,
      endedAt: null,
      source: "server",
      entry: openEntry,
      pending: null,
      explanation: "Entrada confirmada en el servidor.",
    };
  }

  if (pendingIn) {
    return {
      status: "CLOCK_IN_PENDING_SYNC",
      startedAt: pendingIn.event_time_device,
      endedAt: null,
      source: "device",
      entry: null,
      pending: pendingIn,
      explanation: "Entrada registrada en este dispositivo. Pendiente de sincronizar.",
    };
  }

  if (reviewEntry) {
    return {
      status: "REVIEW_REQUIRED",
      startedAt: reviewEntry.clock_in,
      endedAt: reviewEntry.clock_out,
      source: "server",
      entry: reviewEntry,
      pending: null,
      explanation: "Fichaje sincronizado con diferencia horaria sospechosa. Requiere revisión.",
    };
  }

  if (closedEntry) {
    return {
      status: "COMPLETED",
      startedAt: closedEntry.clock_in,
      endedAt: closedEntry.clock_out,
      source: "server",
      entry: closedEntry,
      pending: null,
      explanation: "Turno fichado y cerrado.",
    };
  }

  return {
    status: "NOT_STARTED",
    startedAt: null,
    endedAt: null,
    source: "none",
    entry: null,
    pending: null,
    explanation: "Sin fichaje.",
  };
}

/** Segundos transcurridos del contador. Nunca se reinicia por remount. */
export function elapsedSeconds(res: ClockResolution, now: Date = new Date()): number | null {
  if (!res.startedAt) return null;
  const end = res.endedAt ? new Date(res.endedAt) : now;
  return Math.max(0, Math.floor((end.getTime() - new Date(res.startedAt).getTime()) / 1000));
}

export function formatElapsed(seconds: number | null): string {
  if (seconds == null) return "--:--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** ¿La acción de entrada está disponible? Nunca si hay algo vivo sin resolver. */
export function canClockIn(status: ClockStatus): boolean {
  return status === "NOT_STARTED" || status === "COMPLETED";
}

export function canClockOut(status: ClockStatus): boolean {
  return status === "CLOCKED_IN" || status === "CLOCK_IN_PENDING_SYNC";
}

export const CLOCK_STATUS_LABEL: Record<ClockStatus, string> = {
  NOT_STARTED: "Sin fichaje",
  CLOCK_IN_PENDING_SYNC: "Entrada pendiente de sincronizar",
  CLOCKED_IN: "Fichado",
  CLOCK_OUT_PENDING_SYNC: "Salida pendiente de sincronizar",
  COMPLETED: "Completado",
  REVIEW_REQUIRED: "Requiere revisión",
};
