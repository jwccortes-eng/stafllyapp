/**
 * P0 — RELIABLE TIME CLOCK · hook de cola offline.
 *
 * Responsabilidades:
 *   - Exponer los eventos locales pendientes de este worker.
 *   - Encolar entradas/salidas cuando no hay red o la entrega falló.
 *   - Sincronizar automáticamente al recuperar conexión, al volver la pestaña
 *     al primer plano y de forma periódica.
 *   - Nunca duplicar: la idempotencia vive en el motor de sync.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  enqueueEvent,
  listPendingEvents,
  subscribeToQueue,
  updateEvent,
} from "@/lib/timeclock/offline-clock-store";
import {
  toPendingEvent,
  type NewPendingClockEvent,
  type PendingClockEvent,
} from "@/lib/timeclock/offline-clock-types";
import { syncPendingEvents } from "@/lib/timeclock/clock-sync";
import { createSupabaseClockSyncAdapter } from "@/lib/timeclock/supabase-clock-sync-adapter";

const SYNC_INTERVAL_MS = 30_000;

export interface UseOfflineClockQueueApi {
  pending: PendingClockEvent[];
  syncing: boolean;
  online: boolean;
  enqueue: (event: NewPendingClockEvent) => Promise<PendingClockEvent>;
  syncNow: () => Promise<void>;
}

export function useOfflineClockQueue(
  employeeId: string | null,
  onSynced?: () => void | Promise<void>,
): UseOfflineClockQueueApi {
  const [pending, setPending] = useState<PendingClockEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const inFlight = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    return subscribeToQueue((all) => {
      setPending(
        all.filter(
          (e) =>
            e.status !== "SYNCED" && (!employeeId || e.employee_id === employeeId),
        ),
      );
    });
  }, [employeeId]);

  const syncNow = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const queue = await listPendingEvents(employeeId ?? undefined);
    if (queue.length === 0) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      const outcomes = await syncPendingEvents(queue, createSupabaseClockSyncAdapter(), {
        onEvent: (id, patch) => updateEvent(id, patch),
      });
      if (outcomes.some((o) => o.result === "SYNCED" || o.result === "ALREADY_SYNCED")) {
        await onSyncedRef.current?.();
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [employeeId]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    void syncNow();
    const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [syncNow]);

  const enqueue = useCallback(async (input: NewPendingClockEvent) => {
    const event = toPendingEvent(input);
    await enqueueEvent(event);
    return event;
  }, []);

  return { pending, syncing, online, enqueue, syncNow };
}
