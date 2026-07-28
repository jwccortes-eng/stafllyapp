/**
 * STAFLY-CTX-001 — Forensic instrumentation (TEMPORARY).
 *
 * Read-only. No behavior change. No fixes. Emits console logs that let us
 * determine, when the user returns to the tab, whether:
 *  A) a new document was loaded (documentInstanceId changes, timeOrigin changes)
 *  B) the browser discarded and restored the tab (pageshow persisted=true)
 *  C) React remounted inside the same document (mount/unmount logs)
 *  D) Supabase emitted SIGNED_IN inside the same document
 *  E) authLoading was flipped without an auth event
 *
 * Never logs tokens.
 */

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Module-scope instance ids. `documentInstanceId` is per-module-eval; if the
// bundle is re-evaluated (hard reload, discard/restore), it changes. Persisted
// only in memory — NEVER in storage — per the audit protocol.
export const documentInstanceId = rid("doc");
export const appInstanceId = rid("app");
export const moduleCreatedAt = Date.now();

const timeOrigin = typeof performance !== "undefined" ? performance.timeOrigin : 0;
const navType =
  typeof performance !== "undefined" && performance.getEntriesByType
    ? (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ?? null
    : null;

function snapshot(reason: string, extra?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[STAFLY-CTX-001][forensics]", {
    reason,
    documentInstanceId,
    appInstanceId,
    moduleCreatedAt,
    timeOrigin,
    navType,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    pathname: window.location.pathname,
    ts: Date.now(),
    ...extra,
  });
}

let installed = false;
export function installCtx001Forensics() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  snapshot("module-eval");

  window.addEventListener("pageshow", (e) => {
    snapshot("pageshow", { persisted: (e as PageTransitionEvent).persisted });
  });
  window.addEventListener("pagehide", (e) => {
    snapshot("pagehide", { persisted: (e as PageTransitionEvent).persisted });
  });
  document.addEventListener("visibilitychange", () => {
    snapshot("visibilitychange");
  });
  window.addEventListener("focus", () => snapshot("focus"));
  window.addEventListener("blur", () => snapshot("blur"));
  window.addEventListener("beforeunload", () => snapshot("beforeunload"));
  window.addEventListener("load", () => snapshot("load"));
}

/** Mount/unmount tracer used by providers/layouts. */
export function logMount(component: string, extra?: Record<string, unknown>) {
  const instanceId = rid("i");
  console.info("[STAFLY-CTX-001][mount]", {
    component,
    instanceId,
    documentInstanceId,
    appInstanceId,
    pathname: typeof window !== "undefined" ? window.location.pathname : null,
    ts: Date.now(),
    ...extra,
  });
  return instanceId;
}

export function logUnmount(component: string, instanceId: string) {
  console.info("[STAFLY-CTX-001][unmount]", {
    component,
    instanceId,
    documentInstanceId,
    appInstanceId,
    pathname: typeof window !== "undefined" ? window.location.pathname : null,
    ts: Date.now(),
  });
}
