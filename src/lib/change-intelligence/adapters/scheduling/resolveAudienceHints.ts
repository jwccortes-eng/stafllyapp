/**
 * Scheduling adapter — audience hint resolution (D3, F1 scope).
 *
 * Manager directo: ONLY scheduled_shifts.shift_admin_id and
 * shift_assignments.assignment_role = 'shift_admin'.
 * Supervisor candidate: assignment_role = 'check_in_admin' (never a manager).
 * No role-based, tenant-membership, hierarchy or authorship inference.
 */
import type { AudienceRef } from "../../engine/types";
import type { ReachabilityResolver } from "./resolveReachability";

export interface AssignmentRow {
  employee_id: string;
  assignment_role: string | null;
  status?: string | null;
  id?: string;
}

export interface ShiftAudienceInput {
  shiftId: string;
  shiftAdminEmployeeId: string | null;
  assignments: AssignmentRow[];
  /** Employees explicitly leaving/entering in this operation. */
  removedEmployeeIds?: string[];
  addedEmployeeIds?: string[];
}

const ACTIVE_STATUSES = new Set(["accepted", "assigned", "confirmed", "pending", null, undefined, ""]);

function isActive(row: AssignmentRow): boolean {
  const status = (row.status ?? "").toLowerCase();
  return ACTIVE_STATUSES.has(status as never) || status === "";
}

export function resolveAudienceHints(
  input: ShiftAudienceInput,
  reachability: ReachabilityResolver,
): AudienceRef[] {
  const hints: AudienceRef[] = [];
  const push = (ref: Omit<AudienceRef, "reachability" | "reachableChannels" | "reachabilityReason">) => {
    const r = reachability(ref.partyId);
    hints.push({
      ...ref,
      reachableChannels: r.channels,
      reachability: r.status,
      reachabilityReason: r.reason,
      displayLabel: r.label ?? ref.displayLabel,
    });
  };

  // --- D3 priority 1: explicit shift manager -------------------------------
  const explicitManagerIds = new Set<string>();
  if (input.shiftAdminEmployeeId) explicitManagerIds.add(input.shiftAdminEmployeeId);
  for (const row of input.assignments) {
    if (row.assignment_role === "shift_admin" && isActive(row)) {
      explicitManagerIds.add(row.employee_id);
    }
  }
  for (const managerId of explicitManagerIds) {
    push({
      partyId: managerId,
      partyType: "manager",
      relation: "responsible",
      relationshipType: "shift_explicit",
      resolutionPriority: 1,
      sourceObjectId: input.shiftId,
      deduplicationKey: `person:${managerId}`,
    });
  }
  // Priorities 2-5 have no explicit data model yet -> intentionally unresolved.

  // --- Supervisor candidate ------------------------------------------------
  for (const row of input.assignments) {
    if (row.assignment_role !== "check_in_admin" || !isActive(row)) continue;
    push({
      partyId: row.employee_id,
      partyType: "worker",
      relation: "supervisor",
      sourceObjectId: row.id ?? input.shiftId,
      deduplicationKey: `person:${row.employee_id}`,
    });
  }

  // --- Assigned workers ----------------------------------------------------
  const removed = new Set(input.removedEmployeeIds ?? []);
  const added = new Set(input.addedEmployeeIds ?? []);
  const seen = new Set<string>();

  for (const employeeId of removed) {
    seen.add(employeeId);
    push({
      partyId: employeeId,
      partyType: "worker",
      relation: "removed",
      sourceObjectId: input.shiftId,
      deduplicationKey: `person:${employeeId}`,
    });
  }

  for (const row of input.assignments) {
    if (!isActive(row)) continue;
    if (row.assignment_role === "shift_admin" || row.assignment_role === "check_in_admin") continue;
    if (seen.has(row.employee_id)) continue;
    seen.add(row.employee_id);
    const isIncoming = added.has(row.employee_id);
    push({
      partyId: row.employee_id,
      partyType: "worker",
      relation: "assigned",
      sourceObjectId: row.id ?? input.shiftId,
      deduplicationKey: `person:${row.employee_id}`,
      displayLabel: isIncoming ? undefined : undefined,
    });
  }

  for (const employeeId of added) {
    if (seen.has(employeeId)) continue;
    seen.add(employeeId);
    push({
      partyId: employeeId,
      partyType: "worker",
      relation: "assigned",
      sourceObjectId: input.shiftId,
      deduplicationKey: `person:${employeeId}`,
    });
  }

  return hints;
}
