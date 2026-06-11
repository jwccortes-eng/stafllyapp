/**
 * Tiny in-memory snapshot cache for portal pages.
 *
 * Problem solved: portal pages (EmployeeDashboard, MyShifts, PortalClock) are
 * separate routes under the bottom-nav. Every time the worker switches tabs
 * the page unmounts, and on return its useState defaults reset → the user
 * sees the full skeleton/spinner again even though data was already loaded
 * moments ago. This produced a flashing/parpadeo UX in mobile.
 *
 * Fix: cache the last successful snapshot per (page, recordKey=employeeId).
 * On remount, pages hydrate state from cache → no skeleton, content shows
 * instantly; a background refetch silently updates the snapshot.
 *
 * - Module-level Map; cleared only on full page reload.
 * - No persistence; never writes to localStorage.
 * - No effect on payroll / time_entries / RLS / auth / tenants.
 */
const stores = new Map<string, Map<string, unknown>>();

export function getPageCache<T>(pageKey: string, recordKey: string | null | undefined): T | undefined {
  if (!recordKey) return undefined;
  return stores.get(pageKey)?.get(recordKey) as T | undefined;
}

export function setPageCache<T>(pageKey: string, recordKey: string | null | undefined, value: T): void {
  if (!recordKey) return;
  let s = stores.get(pageKey);
  if (!s) {
    s = new Map();
    stores.set(pageKey, s);
  }
  s.set(recordKey, value);
}

export function hasPageCache(pageKey: string, recordKey: string | null | undefined): boolean {
  if (!recordKey) return false;
  return stores.get(pageKey)?.has(recordKey) ?? false;
}
