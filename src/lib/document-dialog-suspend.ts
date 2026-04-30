/**
 * Tiny module-level flag + pub/sub used to suppress visual realtime refreshes
 * (refetchDocs / readiness.refresh) while an admin is actively editing inside
 * a document dialog (Reject / Request replacement / Upload).
 *
 * This prevents the textarea from losing focus due to parent re-renders that
 * remount the docs list / dialog tree on every keystroke when an external
 * realtime event arrives.
 *
 * Frontend-only. Does NOT pause data writes, audit, payroll or RLS.
 */
type Listener = (suspended: boolean) => void;

let openCount = 0;
const listeners = new Set<Listener>();

function emit() {
  const suspended = openCount > 0;
  listeners.forEach((l) => {
    try { l(suspended); } catch { /* noop */ }
  });
}

export function isDocDialogOpen(): boolean {
  return openCount > 0;
}

export function acquireDocDialogLock(): () => void {
  openCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount = Math.max(0, openCount - 1);
    emit();
  };
}

export function subscribeDocDialog(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
