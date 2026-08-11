/**
 * P0 — RELIABLE TIME CLOCK · almacenamiento durable del fichaje offline.
 *
 * IndexedDB como almacén principal (sobrevive refresh, cierre de pestaña,
 * reapertura del navegador y PWA en background). `localStorage` como espejo
 * de rescate para navegadores que bloquean IDB (Safari privado).
 *
 * Reglas:
 *   - Nunca se borra un evento por error de red: sólo al confirmarse SYNCED.
 *   - Los eventos SYNCED se conservan 48h para poder explicar la evidencia.
 *   - Nada de este archivo alimenta payroll: sólo describe intención local.
 */
import type { PendingClockEvent } from "./offline-clock-types";

const DB_NAME = "stafly-timeclock";
const DB_VERSION = 1;
const STORE = "pending_clock_events";
const MIRROR_KEY = "stafly.timeclock.pending.v1";
const SYNCED_RETENTION_MS = 48 * 60 * 60 * 1000;

type Listener = (events: PendingClockEvent[]) => void;
const listeners = new Set<Listener>();

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_event_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readMirror(): PendingClockEvent[] {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? (JSON.parse(raw) as PendingClockEvent[]) : [];
  } catch {
    return [];
  }
}

function writeMirror(events: PendingClockEvent[]): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(events));
  } catch {
    /* espejo best-effort */
  }
}

function prune(events: PendingClockEvent[]): PendingClockEvent[] {
  const cutoff = Date.now() - SYNCED_RETENTION_MS;
  return events.filter(
    (e) =>
      e.status !== "SYNCED" ||
      !e.synced_at ||
      new Date(e.synced_at).getTime() > cutoff,
  );
}

async function readAllRaw(): Promise<PendingClockEvent[]> {
  if (!hasIdb()) return readMirror();
  try {
    const db = await openDb();
    const events = await new Promise<PendingClockEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as PendingClockEvent[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    // Rescate: si IDB está vacío pero el espejo tiene eventos (IDB purgada por
    // el navegador), reponemos desde el espejo antes de perder un fichaje.
    if (events.length === 0) {
      const mirror = readMirror();
      if (mirror.length > 0) {
        for (const ev of mirror) await putRaw(ev);
        return mirror;
      }
    }
    return events;
  } catch {
    return readMirror();
  }
}

async function putRaw(event: PendingClockEvent): Promise<void> {
  if (hasIdb()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(event);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      /* cae al espejo */
    }
  }
  const mirror = readMirror().filter((e) => e.client_event_id !== event.client_event_id);
  mirror.push(event);
  writeMirror(prune(mirror));
}

async function notify(): Promise<void> {
  const all = await listAllEvents();
  listeners.forEach((l) => l(all));
}

/** Todos los eventos conocidos en este dispositivo (pendientes + sincronizados recientes). */
export async function listAllEvents(): Promise<PendingClockEvent[]> {
  const all = prune(await readAllRaw());
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Sólo lo que aún no llegó al servidor. */
export async function listPendingEvents(
  employeeId?: string,
): Promise<PendingClockEvent[]> {
  const all = await listAllEvents();
  return all.filter(
    (e) =>
      (e.status === "PENDING_SYNC" || e.status === "SYNCING" || e.status === "FAILED") &&
      (!employeeId || e.employee_id === employeeId),
  );
}

export async function enqueueEvent(event: PendingClockEvent): Promise<void> {
  await putRaw(event);
  await notify();
}

export async function updateEvent(
  clientEventId: string,
  patch: Partial<PendingClockEvent>,
): Promise<void> {
  const all = await readAllRaw();
  const current = all.find((e) => e.client_event_id === clientEventId);
  if (!current) return;
  await putRaw({ ...current, ...patch });
  await notify();
}

export async function removeEvent(clientEventId: string): Promise<void> {
  if (hasIdb()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(clientEventId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      /* espejo */
    }
  }
  writeMirror(readMirror().filter((e) => e.client_event_id !== clientEventId));
  await notify();
}

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  void listAllEvents().then((all) => listener(all));
  return () => {
    listeners.delete(listener);
  };
}
