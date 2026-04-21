/**
 * core/operations-intelligence.ts
 *
 * Re-exports the existing alerts/coverage engine and adds a generic
 * `generateCoreAlerts` wrapper that returns CoreAlert[] (product-neutral).
 */
import {
  generateAlerts,
  computeCoverageBatch,
  computeCoverage,
  detectNoShowSpike,
  summarizeAlerts,
  type OpsAlert,
  type AlertSeverity,
  type AlertKind,
  type ShiftCoverage,
  type NoShowSpike,
} from "@/lib/operations-intelligence";
import type { CoreAlert } from "./types";

export {
  generateAlerts,
  computeCoverageBatch,
  computeCoverage,
  detectNoShowSpike,
  summarizeAlerts,
  type OpsAlert,
  type AlertSeverity,
  type AlertKind,
  type ShiftCoverage,
  type NoShowSpike,
};

/** Map STAFly OpsAlert → generic CoreAlert (renames shiftIds → assignmentIds). */
function toCoreAlert(a: OpsAlert): CoreAlert {
  return {
    id: a.id,
    kind: a.kind,
    severity: a.severity,
    message: a.message,
    zone: a.zone,
    assignmentIds: a.shiftIds,
    employeeIds: a.employeeIds,
    meta: a.meta,
  };
}

/** Generic alerts — used by Parceros & any non-shift consumer. */
export async function generateCoreAlerts(companyId: string): Promise<CoreAlert[]> {
  const alerts = await generateAlerts(companyId);
  return alerts.map(toCoreAlert);
}
