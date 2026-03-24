/**
 * Shared pay-period selection helpers.
 *
 * Selection priority:
 *  1. Currently active/open period containing `today`
 *  2. Most recent period by start_date
 *  3. null
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

/**
 * Return the best default pay period from a list.
 * @param periods  – already-loaded pay periods (any order)
 * @param today    – ISO date string (YYYY-MM-DD); defaults to today
 */
export function getDefaultPayPeriod<T extends PayPeriodLike>(
  periods: T[],
  today?: string,
): T | null {
  if (!periods.length) return null;

  const ref = today ?? new Date().toISOString().slice(0, 10);

  // 1. Active/open period that contains today
  const active = periods.find(
    (p) =>
      getStart(p) <= ref &&
      getEnd(p) >= ref &&
      (!p.status || p.status === "open"),
  );
  if (active) return active;

  // Also accept any period containing today regardless of status
  const containing = periods.find(
    (p) => getStart(p) <= ref && getEnd(p) >= ref,
  );
  if (containing) return containing;

  // 2. Most recent by start_date
  return [...periods].sort((a, b) =>
    getStart(b).localeCompare(getStart(a)),
  )[0];
}

/**
 * Sort pay periods most-recent-first (descending by start_date).
 */
export function sortPeriodsDesc<T extends PayPeriodLike>(periods: T[]): T[] {
  return [...periods].sort((a, b) => getStart(b).localeCompare(getStart(a)));
}
