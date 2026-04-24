/**
 * Shared pay-period selection helpers.
 *
 * SAFE DEFAULT SELECTION (post 2026-04 bug fix):
 * Per Quality Staff incident — auto-selecting the highest start_date was
 * picking a FUTURE period (e.g. seq 165, Dec 2026) over the operationally
 * relevant current/past period. New priority:
 *
 *  1. Active/in-progress period that CONTAINS today
 *  2. Any period that CONTAINS today
 *  3. Most recent PAST period (end_date <= today), preferring active statuses
 *  4. (Last resort) most recent period overall — only if no past period exists
 *
 * Future periods are NEVER auto-selected; the admin must pick them manually.
 */

interface PayPeriodLike {
  id: string;
  start_date?: string;
  end_date?: string;
  period_start?: string;
  period_end?: string;
  status?: string;
  period_type?: string | null;
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
  "needs_attention",
  "pending",
  "review",
  "not_closed",
]);

/** Period types that should be flagged as "special" in the UI. */
const SPECIAL_TYPES = new Set(["special", "event", "passover", "holiday"]);

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

// ── Defensive validation helpers ──────────────────────────────────────────

export function isFuturePeriod(p: PayPeriodLike, today?: string): boolean {
  const ref = today ?? getLocalToday();
  return getStart(p) > ref;
}

export function isCurrentPeriod(p: PayPeriodLike, today?: string): boolean {
  const ref = today ?? getLocalToday();
  return getStart(p) <= ref && getEnd(p) >= ref;
}

export function isPastPeriod(p: PayPeriodLike, today?: string): boolean {
  const ref = today ?? getLocalToday();
  return getEnd(p) < ref;
}

export function isSpecialPeriod(p: PayPeriodLike): boolean {
  const t = (p.period_type || "").toLowerCase();
  return SPECIAL_TYPES.has(t);
}

export type PeriodTemporalKind = "current" | "past" | "future";

export function getPeriodTemporalKind(
  p: PayPeriodLike,
  today?: string,
): PeriodTemporalKind {
  if (isCurrentPeriod(p, today)) return "current";
  if (isFuturePeriod(p, today)) return "future";
  return "past";
}

/**
 * Return the best default pay period from a list.
 * @param periods  – already-loaded pay periods (any order)
 * @param today    – ISO date string (YYYY-MM-DD); defaults to local today
 *
 * Future periods are never auto-selected. If only future periods exist, returns null.
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

  // 3. Most recent PAST period (end_date <= today), preferring active statuses.
  //    This guarantees we never auto-select a future period.
  const past = periods.filter((p) => getEnd(p) <= ref && getEnd(p) !== "");
  if (past.length > 0) {
    const sortedPast = [...past].sort((a, b) => getEnd(b).localeCompare(getEnd(a)));
    const activePast = sortedPast.find((p) => ACTIVE_STATUSES.has(p.status || ""));
    return activePast ?? sortedPast[0];
  }

  // 4. Last resort: only future periods exist. Do NOT auto-select — return null.
  //    The admin must explicitly choose a future period.
  return null;
}

/**
 * Sort pay periods most-recent-first (descending by start_date / period_start).
 */
export function sortPeriodsDesc<T extends PayPeriodLike>(periods: T[]): T[] {
  return [...periods].sort((a, b) => getStart(b).localeCompare(getStart(a)));
}
