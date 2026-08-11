/**
 * P0 — RELIABLE TIME CLOCK · motor de sincronización idempotente.
 *
 * Puro respecto de Supabase: recibe un `ClockSyncAdapter`. Esto permite
 * probar timeouts, dobles envíos y reconexiones sin red.
 *
 * Garantías:
 *   - Idempotencia por `client_event_id`: un reintento nunca crea un segundo
 *     time_entry. Antes de escribir siempre se busca el evento ya persistido.
 *   - Orden: los CLOCK_IN se sincronizan antes que los CLOCK_OUT que los cierran.
 *   - Integridad temporal: se guarda hora de dispositivo, hora de servidor y
 *     el desfase. Un drift sospechoso marca REVIEW_REQUIRED sin corregir nada
 *     ni tocar payroll.
 */
import type { PendingClockEvent } from "./offline-clock-types";

/** Drift a partir del cual el evento se marca para revisión humana. */
export const CLOCK_DRIFT_REVIEW_SECONDS = 15 * 60;

export interface SyncedEntryRef {
  time_entry_id: string;
  requires_review: boolean;
  review_reason: string | null;
}

export interface ClockSyncAdapter {
  /** Reloj del servidor (o mejor aproximación disponible). */
  serverNow: () => Promise<Date>;
  /** Busca un time_entry ya creado con esta idempotency key. */
  findByClientEventId: (clientEventId: string) => Promise<{ id: string; clock_out: string | null } | null>;
  /** Crea el time_entry canónico de una entrada. */
  insertClockIn: (
    event: PendingClockEvent,
    meta: { syncedAt: string; syncDelaySeconds: number; requiresReview: boolean; reviewReason: string | null },
  ) => Promise<string>;
  /** Cierra el time_entry canónico con la hora real del dispositivo. */
  applyClockOut: (
    event: PendingClockEvent,
    timeEntryId: string,
    meta: { syncedAt: string; syncDelaySeconds: number; requiresReview: boolean; reviewReason: string | null },
  ) => Promise<void>;
  /** Fallback: entrada abierta del worker para este turno. */
  findOpenEntry: (event: PendingClockEvent) => Promise<{ id: string } | null>;
}

export interface SyncOutcome {
  client_event_id: string;
  result: "SYNCED" | "ALREADY_SYNCED" | "DEFERRED" | "FAILED";
  time_entry_id?: string;
  requires_review?: boolean;
  error?: string;
}

export function evaluateDrift(
  deviceTime: string,
  serverNow: Date,
): { syncDelaySeconds: number; requiresReview: boolean; reviewReason: string | null } {
  const delta = Math.round((serverNow.getTime() - new Date(deviceTime).getTime()) / 1000);
  // Un evento en el futuro respecto del servidor sólo puede venir de un reloj
  // desviado: nunca se corrige en silencio, se marca.
  if (delta < -60) {
    return {
      syncDelaySeconds: delta,
      requiresReview: true,
      reviewReason: `Hora del dispositivo adelantada ${Math.abs(delta)}s respecto del servidor.`,
    };
  }
  return { syncDelaySeconds: Math.max(0, delta), requiresReview: false, reviewReason: null };
}

function orderEvents(events: PendingClockEvent[]): PendingClockEvent[] {
  return [...events].sort((a, b) => {
    if (a.type !== b.type) return a.type === "CLOCK_IN" ? -1 : 1;
    return a.event_time_device.localeCompare(b.event_time_device);
  });
}

/**
 * Sincroniza la cola. `resolveLocalEntryId` traduce un clock-in local ya
 * sincronizado en su time_entry canónico (para el clock-out que lo cierra).
 */
export async function syncPendingEvents(
  events: PendingClockEvent[],
  adapter: ClockSyncAdapter,
  hooks: {
    onEvent: (clientEventId: string, patch: Partial<PendingClockEvent>) => Promise<void>;
  },
): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = [];
  const resolvedEntryByEvent = new Map<string, string>();

  for (const event of orderEvents(events)) {
    if (event.status === "SYNCED") continue;
    try {
      await hooks.onEvent(event.client_event_id, { status: "SYNCING", last_error: null });

      // 1. Idempotencia dura: ¿ya existe en el servidor?
      const existing = await adapter.findByClientEventId(event.client_event_id);
      if (existing && (event.type === "CLOCK_IN" || existing.clock_out)) {
        resolvedEntryByEvent.set(event.client_event_id, existing.id);
        await hooks.onEvent(event.client_event_id, {
          status: "SYNCED",
          synced_at: new Date().toISOString(),
          server_time_entry_id: existing.id,
          last_error: null,
        });
        outcomes.push({
          client_event_id: event.client_event_id,
          result: "ALREADY_SYNCED",
          time_entry_id: existing.id,
        });
        continue;
      }

      const serverNow = await adapter.serverNow();
      const drift = evaluateDrift(event.event_time_device, serverNow);
      const meta = {
        syncedAt: serverNow.toISOString(),
        syncDelaySeconds: drift.syncDelaySeconds,
        requiresReview: drift.requiresReview,
        reviewReason: drift.reviewReason,
      };

      if (event.type === "CLOCK_IN") {
        const id = await adapter.insertClockIn(event, meta);
        resolvedEntryByEvent.set(event.client_event_id, id);
        await hooks.onEvent(event.client_event_id, {
          status: "SYNCED",
          synced_at: meta.syncedAt,
          server_time_entry_id: id,
          last_error: null,
        });
        outcomes.push({
          client_event_id: event.client_event_id,
          result: "SYNCED",
          time_entry_id: id,
          requires_review: drift.requiresReview,
        });
        continue;
      }

      // CLOCK_OUT — necesita el time_entry al que pertenece.
      let entryId =
        event.time_entry_id ??
        (event.closes_client_event_id
          ? resolvedEntryByEvent.get(event.closes_client_event_id) ?? null
          : null);

      if (!entryId && event.closes_client_event_id) {
        const linked = await adapter.findByClientEventId(event.closes_client_event_id);
        entryId = linked?.id ?? null;
      }
      if (!entryId) {
        const open = await adapter.findOpenEntry(event);
        entryId = open?.id ?? null;
      }
      if (!entryId) {
        // No se pierde: queda pendiente hasta que exista la entrada canónica.
        await hooks.onEvent(event.client_event_id, {
          status: "PENDING_SYNC",
          attempts: event.attempts + 1,
          last_error: "Esperando que la entrada correspondiente se sincronice.",
        });
        outcomes.push({ client_event_id: event.client_event_id, result: "DEFERRED" });
        continue;
      }

      await adapter.applyClockOut(event, entryId, meta);
      await hooks.onEvent(event.client_event_id, {
        status: "SYNCED",
        synced_at: meta.syncedAt,
        server_time_entry_id: entryId,
        last_error: null,
      });
      outcomes.push({
        client_event_id: event.client_event_id,
        result: "SYNCED",
        time_entry_id: entryId,
        requires_review: drift.requiresReview,
      });
    } catch (err) {
      const message = (err as { message?: string })?.message ?? "Error de sincronización.";
      // Jamás se descarta el evento: vuelve a PENDING_SYNC para reintento.
      await hooks.onEvent(event.client_event_id, {
        status: "PENDING_SYNC",
        attempts: event.attempts + 1,
        last_error: message,
      });
      outcomes.push({ client_event_id: event.client_event_id, result: "FAILED", error: message });
    }
  }

  return outcomes;
}
