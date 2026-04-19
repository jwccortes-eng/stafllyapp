/**
 * SHIFT VISIBILITY — Single Source of Truth
 * ========================================
 *
 * Centralized definition of when a shift is "visible" to a given surface.
 * This file exists to PREVENT regressions like the bug where employees
 * could still see shifts that admins had soft-deleted.
 *
 * Why this exists
 * ---------------
 * - `scheduled_shifts.deleted_at` is a SOFT delete marker.
 * - `shift_assignments` rows still exist after a shift is soft-deleted.
 * - If a portal query joins `shift_assignments → scheduled_shifts!inner`
 *   without filtering `deleted_at`, the deleted shift will leak through.
 *
 * Hard rule
 * ---------
 * Any query that surfaces a shift to ANY user (admin or employee) MUST
 * filter `deleted_at IS NULL` on `scheduled_shifts` — directly or via
 * the inner-joined relation path.
 *
 * Surfaces & rules
 * ----------------
 * - Admin lists/calendars  → `deleted_at IS NULL` + `company_id`
 * - Portal assigned shifts → `scheduled_shifts.deleted_at IS NULL` + `employee_id`
 * - Portal claimable shifts → `deleted_at IS NULL` + `claimable=true`
 *                              + status in (open, published) + future date
 *                              + slots not full + not already assigned/requested
 * - Reports / passport     → `deleted_at IS NULL`
 *
 * Cache invalidation checklist (when ANY shift mutates)
 * -----------------------------------------------------
 * After: create / update / publish / unpublish / soft-delete / claim
 *        / approve-request / assign / unassign
 *  ✓ Refetch admin shifts list
 *  ✓ Refetch portal `MyShifts` for affected employees
 *  ✓ Refetch portal `EmployeeDashboard` next-shift card
 *  ✓ Refetch portal `PortalClock` today's shifts
 *  ✓ Refetch admin `Attendance` / `OperationsCommandCenter` for the date
 *
 * Database-level safety net (DO NOT remove)
 * -----------------------------------------
 * Trigger `trg_invalidate_assignments_on_shift_soft_delete` on `scheduled_shifts`:
 * when `deleted_at` transitions from NULL to NOT NULL, all active
 * `shift_assignments` for that shift are auto-set to status='removed' and
 * response_status='rejected'. This is a hard guarantee that no orphan
 * assignment can survive a shift soft-delete (root cause of the
 * "Carlos Ortiz still sees PRUEBA MARIA" bug, Apr 2026).
 */

/** Statuses considered "claimable-publishable" for the worker portal. */
export const CLAIMABLE_VISIBLE_STATUSES = ["open", "published"] as const;

/**
 * Canonical "is this shift claimable by THIS employee right now?" predicate.
 * Mirror of the RLS rule on `scheduled_shifts` + the listing/detail filters.
 * Use to keep notifications / Home / MyShifts / PortalShiftDetail in lockstep.
 *
 * Pre-conditions assumed satisfied (filtered server-side):
 *   - shift.company_id === employee.company_id
 *   - shift.claimable === true
 *   - shift.status ∈ CLAIMABLE_VISIBLE_STATUSES
 *   - shift.deleted_at === null
 *   - shift.date >= today
 */
export function isShiftClaimableForEmployee(args: {
  shiftId: string;
  slots: number | null;
  activeAssignmentsCount: number;
  myShiftIds: ReadonlySet<string>;
  pendingRequestShiftIds: ReadonlySet<string>;
}): boolean {
  if (args.myShiftIds.has(args.shiftId)) return false;
  if (args.pendingRequestShiftIds.has(args.shiftId)) return false;
  if (args.slots != null && args.activeAssignmentsCount >= args.slots) return false;
  return true;
}

/**
 * Apply the canonical "visible scheduled_shift" filter to a Supabase query.
 * Use as: `applyVisibleShiftFilter(supabase.from("scheduled_shifts").select(...))`
 */
export function applyVisibleShiftFilter<T extends { is: (col: string, v: any) => T }>(q: T): T {
  return q.is("deleted_at", null);
}

/**
 * Apply visibility filter to an INNER-joined `scheduled_shifts` relation.
 * Use as: `applyJoinedShiftVisibility(supabase.from("shift_assignments").select("...,scheduled_shifts!inner(...)"))`
 *
 * This is the rule that was missing in portal queries and caused
 * deleted shifts to remain visible to employees.
 */
export function applyJoinedShiftVisibility<T extends { is: (col: string, v: any) => T }>(q: T): T {
  return q.is("scheduled_shifts.deleted_at", null);
}
