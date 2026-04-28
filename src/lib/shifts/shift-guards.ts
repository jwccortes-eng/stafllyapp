/**
 * SHIFT GUARDS — Single Source of Truth for lifecycle predicates
 * ==============================================================
 *
 * Centralizes the boolean rules that decide whether a shift / assignment
 * participates in a given operational flow. The goal is to PREVENT
 * regressions like:
 *
 *   - a draft leaking into the worker portal,
 *   - a draft triggering notifications,
 *   - a draft reservation being treated as an active assignment,
 *   - a draft entering attendance / dispatch / live ops.
 *
 * RULES OF USE
 * ------------
 * - These helpers are PURE and side-effect free.
 * - They DO NOT replace server-side filters or RLS — they are a defense
 *   layer at the UI/business edge so a missed `.eq('publication_status', …)`
 *   in some new query cannot silently break invariants.
 * - Backwards compat: if `publication_status` is missing on a row (legacy
 *   data before the column existed), it is treated as `"published"`.
 *
 * NOT IN SCOPE
 * ------------
 * - Payroll: never reads scheduled hours; this file does not change that.
 * - RLS / triggers / SQL: untouched.
 * - Visibility join filter: see `src/lib/shifts/visibility.ts`
 *   (`applyJoinedShiftVisibility`, `applyVisibleShiftFilter`) — this file
 *   complements it for in-memory predicates.
 */

export type ShiftPublicationStatusLike =
  | "draft"
  | "published"
  | "cancelled"
  | "archived"
  | string
  | null
  | undefined;

export interface ShiftGuardInput {
  publication_status?: ShiftPublicationStatusLike;
  /** Operational status, e.g. "open", "locked", "cancelled". */
  status?: string | null;
  /** Soft-delete marker on scheduled_shifts. */
  deleted_at?: string | null;
}

export interface AssignmentGuardInput {
  /** "assigned" | "removed" | "rejected" | "cancelled" | … */
  status?: string | null;
  /** Worker-side ack: "pending" | "accepted" | "rejected". */
  response_status?: string | null;
  /**
   * Marks an assignment that was created by the draft flow and must NOT
   * be treated as a real assignment until the shift is published.
   */
  is_draft_reservation?: boolean | null;
}

/** Backwards-compatible read of the lifecycle column. */
function lifecycle(s: ShiftGuardInput): "draft" | "published" | "cancelled" | "archived" | string {
  return (s.publication_status ?? "published") as string;
}

/** True when the shift is in the draft lifecycle stage. */
export function isDraftShift(s: ShiftGuardInput): boolean {
  return lifecycle(s) === "draft";
}

/** True when the shift has been published to workers/operations. */
export function isPublishedShift(s: ShiftGuardInput): boolean {
  return lifecycle(s) === "published";
}

/** True when the shift is cancelled or archived (soft-delete also counts). */
export function isCancelledOrArchivedShift(s: ShiftGuardInput): boolean {
  const l = lifecycle(s);
  if (l === "cancelled" || l === "archived") return true;
  if ((s.status ?? "").toLowerCase() === "cancelled") return true;
  if (s.deleted_at) return true;
  return false;
}

/** True when the assignment row exists only as a draft placeholder. */
export function isDraftReservation(a: AssignmentGuardInput | null | undefined): boolean {
  if (!a) return false;
  return a.is_draft_reservation === true;
}

/**
 * True when the assignment should be counted as a real, active assignment
 * for staffing/coverage/notifications/portal.
 *
 * Excludes: draft reservations, removed, cancelled, rejected.
 */
export function isActiveAssignment(a: AssignmentGuardInput | null | undefined): boolean {
  if (!a) return false;
  if (isDraftReservation(a)) return false;
  const s = (a.status ?? "").toLowerCase();
  if (s === "removed" || s === "cancelled" || s === "rejected") return false;
  if ((a.response_status ?? "").toLowerCase() === "rejected") return false;
  return true;
}

/**
 * True when notifications (push/SMS/email) MAY be triggered for this shift.
 * Drafts, cancelled, archived and soft-deleted shifts must never notify.
 */
export function canNotifyShift(s: ShiftGuardInput): boolean {
  if (!isPublishedShift(s)) return false;
  if (isCancelledOrArchivedShift(s)) return false;
  return true;
}

/**
 * True when the (shift, assignment) pair should be visible inside the
 * worker portal (MyShifts / Dashboard / PortalShiftDetail / PortalClock).
 *
 * Conjunction of:
 *   - shift is published
 *   - shift is not cancelled / archived / soft-deleted
 *   - assignment is active and not a draft reservation
 */
export function isVisibleToWorkerPortal(
  shift: ShiftGuardInput,
  assignment: AssignmentGuardInput | null | undefined
): boolean {
  if (!isPublishedShift(shift)) return false;
  if (isCancelledOrArchivedShift(shift)) return false;
  if (!isActiveAssignment(assignment)) return false;
  return true;
}
