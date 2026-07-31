/**
 * Phase 2 — Safe mobile shift team mutations.
 *
 * Thin typed wrappers around two SECURITY DEFINER RPCs:
 *   - set_shift_assignment_state
 *   - resolve_shift_request
 *
 * Both RPCs:
 *   - Authorize the caller server-side (developer/owner/founder OR
 *     per-company admin/manager/supervisor).
 *   - Validate state transitions.
 *   - Write an immutable row to shift_audit_log.
 *   - NEVER touch time_entries, attendance_status, payroll, or
 *     scheduled hours, and NEVER hard-delete an assignment.
 */

import { supabase } from "@/integrations/supabase/client";

export type AssignmentNextStatus = "confirmed" | "rejected" | "removed";
export type ClaimDecision = "approved" | "rejected";

export interface SetAssignmentStateInput {
  assignmentId: string;
  nextStatus: AssignmentNextStatus;
  /** If omitted, the RPC keeps the current response_status. */
  nextResponseStatus?: "accepted" | "rejected" | "pending" | null;
  reason?: string | null;
  source?: string;
}

export async function setShiftAssignmentState(input: SetAssignmentStateInput) {
  const responseStatus =
    input.nextResponseStatus ??
    (input.nextStatus === "confirmed"
      ? "accepted"
      : input.nextStatus === "rejected"
        ? "rejected"
        : null);

  const { data, error } = await supabase.rpc("set_shift_assignment_state", {
    p_assignment_id: input.assignmentId,
    p_next_status: input.nextStatus,
    p_next_response_status: responseStatus,
    p_reason: input.reason ?? null,
    p_source: input.source ?? "mobile_manage_team",
  });
  if (error) throw error;
  return data;
}

export interface ResolveClaimInput {
  requestId: string;
  decision: ClaimDecision;
  reason?: string | null;
  source?: string;
}

export async function resolveShiftRequest(input: ResolveClaimInput) {
  const { data, error } = await supabase.rpc("resolve_shift_request", {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
    p_source: input.source ?? "mobile_manage_team",
  });
  if (error) throw error;
  return data;
}

export interface AssignWorkerInput {
  shiftId: string;
  employeeId: string;
  assignmentRole?: string;
  reason?: string | null;
  source?: string;
}

/**
 * Phase 3 — Add Workers from mobile.
 * Wraps the SECURITY DEFINER RPC `assign_worker_to_shift`.
 *
 * Server-side guarantees:
 *   - Authorization via can_manage_shift_company.
 *   - Same-company employee/shift.
 *   - Single source of truth: get_employee_assignment_status (company policy).
 *     Compliance pendings only warn unless the company policy is
 *     require_override / block; admin overrides bypass.
 *   - No duplicates against active assignments.
 *   - Inserts as status='pending', response_status='pending' (worker still must accept).
 *   - Writes shift_audit_log row (action='assignment_created').
 *   - Never touches time_entries / attendance / payroll.
 */
export async function assignWorkerToShift(input: AssignWorkerInput) {
  const { data, error } = await supabase.rpc("assign_worker_to_shift", {
    p_shift_id: input.shiftId,
    p_employee_id: input.employeeId,
    p_assignment_role: input.assignmentRole ?? "worker",
    p_reason: input.reason ?? null,
    p_source: input.source ?? "mobile_manage_team",
  });
  if (error) throw error;
  return data;
}

/** Maps allowed Phase-2 transitions per current assignment status. */
export function allowedNextStatusesFor(currentStatus: string): AssignmentNextStatus[] {
  switch (currentStatus) {
    case "pending":
      return ["confirmed", "rejected", "removed"];
    case "accepted":
      return ["confirmed", "removed"];
    case "confirmed":
      return ["removed"];
    default:
      return [];
  }
}
