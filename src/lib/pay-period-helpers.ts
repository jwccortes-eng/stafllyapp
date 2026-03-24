/**
 * Shared pay-period selection helpers.
 *
 * Selection priority:
 *  1. Currently active/open period containing `today`
 *  2. Any period containing `today`
 *  3. Most recent period by start_date
 *  4. null
 */

interface PayPeriodLike {
  id: string;
  start_date?: string;
  end_date?: string;
  period_start?: string;
  period_end?: string;
  status?: string;
}

function getStart(p: PayPeriodLike): string {
  return p.start_date || p.period_start || "";
}

function getEnd(p: PayPeriodLike): string {
  return p.end_date || p.period_end || "";
}

/** Statuses considered "active / in-progress" for default selection priority. */
const ACTIVE_STATUSES = new Set([
  "open",
  "importing",
  "normalizing",
  "matching",
  "reviewing",
  "approved",
  "reopened",
]);

/**
 * Get today's date as YYYY-MM-DD in the local (browser) timezone,
 * avoiding UTC drift from `new Date().toISOString()`.
 */
export function getLocalToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Return the best default pay period from a list.
 * @param periods  – already-loaded pay periods (any order)
 * @param today    – ISO date string (YYYY-MM-DD); defaults to local today
 */
export function getDefaultPayPeriod<T extends PayPeriodLike>(
  periods: T[],
  today?: string,
): T | null {
  if (!periods.length) return null;

  const ref = today ?? getLocalToday();

  // 1. Active/open period that contains today
  const active = periods.find(
    (p) =>
      getStart(p) <= ref &&
      getEnd(p) >= ref &&
      ACTIVE_STATUSES.has(p.status || ""),
  );
  if (active) return active;

  // 2. Any period containing today regardless of status
  const containing = periods.find(
    (p) => getStart(p) <= ref && getEnd(p) >= ref,
  );
  if (containing) return containing;

  // 3. Most recent by start_date
  return sortPeriodsDesc(periods)[0] ?? null;
}

/**
 * Sort pay periods most-recent-first (descending by start_date / period_start).
 */
export function sortPeriodsDesc<T extends PayPeriodLike>(periods: T[]): T[] {
  return [...periods].sort((a, b) => getStart(b).localeCompare(getStart(a)));
}
