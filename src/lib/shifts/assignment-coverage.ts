/**
 * lib/shifts/assignment-coverage.ts
 *
 * Single source of truth for "how many workers are covering this shift?"
 * shared by mobile and desktop. Counts ONLY shift_assignments — never
 * time_entries, never accepted-only filters. Status `rejected` and
 * `removed` are excluded because the worker is no longer scheduled.
 *
 * IMPORTANT: This is intentionally separate from `useShiftCoverage`,
 * which mixes time_entries to compute *attendance* outcomes for the
 * Coverage Report. That richer model is still used downstream; this
 * helper only governs the simple "X/Y workers staffed" UI count that
 * was inconsistent between mobile and desktop.
 */

export type ShiftAssignmentLite = {
  shift_id: string;
  employee_id: string;
  status: string;
  attendance_status?: string | null;
};

const STAFFED_EXCLUDED = new Set(["rejected", "removed"]);

/** Count assignments that still represent a scheduled worker. */
export function countStaffed(
  assignments: ShiftAssignmentLite[],
  shiftId: string,
): number {
  let n = 0;
  for (const a of assignments) {
    if (a.shift_id !== shiftId) continue;
    if (STAFFED_EXCLUDED.has(a.status)) continue;
    n += 1;
  }
  return n;
}

/** Filter assignments visible in the staffing UI for a shift. */
export function staffedAssignments<T extends ShiftAssignmentLite>(
  assignments: T[],
  shiftId: string,
): T[] {
  return assignments.filter(
    a => a.shift_id === shiftId && !STAFFED_EXCLUDED.has(a.status),
  );
}

export type AttendanceValidationStatus =
  | "pending"
  | "present"
  | "late"
  | "absent"
  | "excused";

export const ATTENDANCE_OPTIONS: { value: AttendanceValidationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];
