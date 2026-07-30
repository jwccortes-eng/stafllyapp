/**
 * Legacy baseline — who the current behaviour would have notified.
 * Used only to build the divergence report. Never used to expand CI audience.
 */
import type { AssignmentRow } from "./resolveAudienceHints";

export interface LegacyBaselineInput {
  assignments: AssignmentRow[];
  /** Company managers/admins the legacy broadcast would have reached. */
  companyManagerIds?: string[];
  removedEmployeeIds?: string[];
  addedEmployeeIds?: string[];
}

/**
 * Legacy behaviour: notify every person attached to the shift plus every
 * company manager. This is exactly the noise CI is meant to remove.
 */
export function buildLegacyAudience(input: LegacyBaselineInput): string[] {
  const ids = new Set<string>();
  for (const row of input.assignments) ids.add(row.employee_id);
  for (const id of input.removedEmployeeIds ?? []) ids.add(id);
  for (const id of input.addedEmployeeIds ?? []) ids.add(id);
  for (const id of input.companyManagerIds ?? []) ids.add(id);
  return [...ids];
}
