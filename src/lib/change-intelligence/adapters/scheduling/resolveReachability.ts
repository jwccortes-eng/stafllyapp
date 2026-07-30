/**
 * Scheduling adapter — employee -> user -> channel bridge.
 *
 * A person with no verifiable bridge stays AFFECTED but is marked
 * `unreachable` with an exact reason. Never invent identity, never drop
 * silently from the report.
 */
import type { Channel, Reachability } from "../../engine/types";

export interface ReachabilityResult {
  status: Reachability;
  channels: Channel[];
  reason?: string;
  label?: string;
}

export type ReachabilityResolver = (employeeId: string) => ReachabilityResult;

export interface EmployeeBridgeRow {
  id: string;
  user_id: string | null;
  first_name?: string | null;
  last_name?: string | null;
  portal_access_enabled?: boolean | null;
  is_active?: boolean | null;
}

export function createReachabilityResolver(rows: EmployeeBridgeRow[]): ReachabilityResolver {
  const byId = new Map(rows.map((r) => [r.id, r]));

  return (employeeId: string): ReachabilityResult => {
    const row = byId.get(employeeId);
    const label = row
      ? [row.first_name, row.last_name].filter(Boolean).join(" ") || employeeId
      : employeeId;

    if (!row) {
      return { status: "unreachable", channels: [], reason: "employee_record_not_found", label };
    }
    if (!row.user_id) {
      return {
        status: "unreachable",
        channels: [],
        reason: "no_employee_to_user_bridge",
        label,
      };
    }
    if (row.portal_access_enabled === false) {
      return { status: "unreachable", channels: [], reason: "portal_access_disabled", label };
    }
    if (row.is_active === false) {
      return { status: "unreachable", channels: [], reason: "employee_inactive", label };
    }
    // F1 only asserts the in-app inbox as an available surface. Push/SMS/email
    // capability discovery is out of scope until delivery phases.
    return { status: "reachable", channels: ["inbox"], label };
  };
}
