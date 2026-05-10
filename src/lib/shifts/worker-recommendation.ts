/**
 * Worker Recommendation Engine v1 (read-only).
 *
 * Pure scoring helper used by the mobile Manage Team → Recommended tab.
 * Inputs are already-loaded employees + assignments + a small set of
 * batch-fetched signals. No DB writes, no payroll/time_entries/attendance
 * impact. Missing signals degrade gracefully (omitted from reasons, no
 * negative score).
 *
 * Score is intentionally simple and explainable; tuned to surface
 * Ready + has-phone + has-history + driver/captain matches above
 * grace-period and unknown candidates.
 */

import type { Employee, Shift } from "@/components/shifts/types";
import { isEmployeeDriver } from "@/components/shifts/types";
import { normalizePhone } from "@/lib/phone";

export type RecReadinessState =
  | "ready"
  | "grace_period"
  | "incomplete_blocked"
  | "pending_documents_blocked"
  | "onboarding_pending"
  | "missing_phone"
  | "inactive"
  | "unknown";

export interface ReviewSignal {
  avg_overall_score: number | null;
  no_show_flags_90d: number | null;
  low_score_count_30d: number | null;
  total_reviews: number | null;
}

export type WorkerPreferenceType =
  | "preferred"
  | "prequalified"
  | "blocked"
  | "not_recommended"
  | "captain_preferred"
  | "driver_preferred";

export interface WorkerPreferenceRow {
  id: string;
  preference_type: WorkerPreferenceType;
  client_id: string | null;
  location_id: string | null;
}

/** Per-employee batch signals fetched once per Recommended tab open. */
export interface RecommendationSignals {
  /** date (YYYY-MM-DD) -> per-employee availability override (true/false). */
  overrideByEmp: Map<string, boolean>;
  /** per-employee default availability + blocked weekdays. */
  configByEmp: Map<string, { default_available: boolean; blocked_weekdays: number[] | null }>;
  /** per-employee count of past assignments at this client (last 12 mo). */
  clientHistoryByEmp: Map<string, number>;
  /** per-employee count of past assignments at this location (last 12 mo). */
  locationHistoryByEmp: Map<string, number>;
  /** per-employee review stats (company-scoped). */
  reviewByEmp: Map<string, ReviewSignal>;
  /** employee ids with an overlapping non-rejected/non-removed assignment on the same date. */
  conflictEmpIds: Set<string>;
  /** Active preferences for this shift's client/location, keyed by employee_id. */
  preferencesByEmp: Map<string, WorkerPreferenceRow[]>;
}

export const EMPTY_SIGNALS: RecommendationSignals = {
  overrideByEmp: new Map(),
  configByEmp: new Map(),
  clientHistoryByEmp: new Map(),
  locationHistoryByEmp: new Map(),
  reviewByEmp: new Map(),
  conflictEmpIds: new Set(),
  preferencesByEmp: new Map(),
};

export type ReasonChipKey =
  | "ready"
  | "grace_period"
  | "has_phone"
  | "has_app"
  | "available"
  | "unavailable"
  | "conflict"
  | "worked_client"
  | "worked_location"
  | "high_reliability"
  | "low_reliability"
  | "driver"
  | "captain"
  | "role_match";

export interface RankedCandidate {
  employee: Employee;
  name: string;
  phone: string;
  initials: string;
  score: number;
  reasons: ReasonChipKey[];
  riskFlags: ReasonChipKey[];
  readinessState: RecReadinessState;
  canAssign: boolean;
  alreadyAssigned: boolean;
  conflictDetected: boolean;
  availabilitySignal: "available" | "unavailable" | "unknown";
  clientHistoryCount: number;
  locationHistoryCount: number;
  roleMatch: boolean;
  driver: boolean;
}

/** Roles considered "drive-needed" for ranking; soft signal. */
const DRIVER_HINT_REGEX = /\b(driver|chofer|conductor)\b/i;
const CAPTAIN_HINT_REGEX = /\b(captain|capit[áa]n|lead|supervisor)\b/i;

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Returns availability signal for the shift date for one employee.
 * Override always wins. Default + blocked_weekdays form fallback.
 */
function resolveAvailability(
  empId: string,
  shift: Shift,
  signals: RecommendationSignals,
): "available" | "unavailable" | "unknown" {
  const ov = signals.overrideByEmp.get(`${shift.date}:${empId}`);
  if (ov === true) return "available";
  if (ov === false) return "unavailable";
  const cfg = signals.configByEmp.get(empId);
  if (!cfg) return "unknown";
  const d = parseDate(shift.date);
  if (!d) return cfg.default_available ? "available" : "unavailable";
  const dow = d.getDay(); // 0=Sun..6=Sat
  if (cfg.blocked_weekdays?.includes(dow)) return "unavailable";
  return cfg.default_available ? "available" : "unknown";
}

export interface ScoreInput {
  employee: Employee;
  shift: Shift;
  readinessState: RecReadinessState;
  canBeApproved: boolean;
  alreadyAssigned: boolean;
  signals: RecommendationSignals;
  /** Optional: if the shift's assignment_role hints at driver/captain need. */
  needsDriver?: boolean;
  needsCaptain?: boolean;
}

export function rankCandidate(input: ScoreInput): RankedCandidate {
  const { employee: e, shift, readinessState, canBeApproved, alreadyAssigned, signals } = input;

  const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Worker";
  const phone = normalizePhone(e.phone_number ?? "");
  const initials = ((e.first_name?.[0] ?? "") + (e.last_name?.[0] ?? "")).toUpperCase() || "W";

  const reasons: ReasonChipKey[] = [];
  const risks: ReasonChipKey[] = [];

  let score = 0;

  // ── Readiness
  if (readinessState === "ready") { score += 100; reasons.push("ready"); }
  else if (readinessState === "grace_period") { score += 80; reasons.push("grace_period"); }
  else if (readinessState === "inactive" || readinessState === "incomplete_blocked" || readinessState === "pending_documents_blocked") {
    score -= 100;
  }

  // ── Contact / app
  if (phone) { score += 30; reasons.push("has_phone"); }
  if (e.user_id) { score += 25; reasons.push("has_app"); }

  // ── Availability
  const availability = resolveAvailability(e.id, shift, signals);
  if (availability === "available") { score += 30; reasons.push("available"); }
  else if (availability === "unavailable") { score -= 50; risks.push("unavailable"); }

  // ── Conflict
  const conflictDetected = signals.conflictEmpIds.has(e.id);
  if (conflictDetected) { score -= 40; risks.push("conflict"); }

  // ── History
  const clientHistoryCount = shift.client_id ? (signals.clientHistoryByEmp.get(e.id) ?? 0) : 0;
  const locationHistoryCount = shift.location_id ? (signals.locationHistoryByEmp.get(e.id) ?? 0) : 0;
  if (clientHistoryCount > 0) { score += 25; reasons.push("worked_client"); }
  if (locationHistoryCount > 0) { score += 25; reasons.push("worked_location"); }

  // ── Reliability
  const review = signals.reviewByEmp.get(e.id);
  if (review) {
    const avg = Number(review.avg_overall_score ?? 0);
    const total = Number(review.total_reviews ?? 0);
    const noShows = Number(review.no_show_flags_90d ?? 0);
    if (total >= 3 && avg >= 4) { score += 20; reasons.push("high_reliability"); }
    if (noShows > 0) { score -= 15; risks.push("low_reliability"); }
    else if (total >= 3 && avg > 0 && avg < 3) { score -= 10; risks.push("low_reliability"); }
  }

  // ── Role / driver / captain
  const driver = isEmployeeDriver(e);
  const role = (e.employee_role ?? "").toLowerCase();
  const wantsDriver = !!input.needsDriver;
  const wantsCaptain = !!input.needsCaptain;
  if (wantsDriver && driver) { score += 15; reasons.push("driver"); }
  if (wantsCaptain && CAPTAIN_HINT_REGEX.test(role)) { score += 15; reasons.push("captain"); }
  // Soft surface: also chip "driver" when no need is signalled but worker drives.
  if (!wantsDriver && driver) reasons.push("driver");

  // Role match: shift.title or assignment_role aligned with employee_role.
  let roleMatch = false;
  const shiftRoleHint = `${shift.title ?? ""}`.toLowerCase();
  if (role && shiftRoleHint && shiftRoleHint.includes(role)) {
    roleMatch = true;
    score += 10;
    reasons.push("role_match");
  }

  return {
    employee: e,
    name,
    phone,
    initials,
    score,
    reasons,
    riskFlags: risks,
    readinessState,
    canAssign: canBeApproved && !conflictDetected && readinessState !== "inactive",
    alreadyAssigned,
    conflictDetected,
    availabilitySignal: availability,
    clientHistoryCount,
    locationHistoryCount,
    roleMatch,
    driver,
  };
}

export const REASON_CHIP_LABEL: Record<ReasonChipKey, string> = {
  ready: "Ready",
  grace_period: "Grace period",
  has_phone: "Has phone",
  has_app: "App access",
  available: "Available",
  unavailable: "Unavailable",
  conflict: "Conflict",
  worked_client: "Worked client before",
  worked_location: "Worked location before",
  high_reliability: "High reliability",
  low_reliability: "Reliability risk",
  driver: "Driver",
  captain: "Captain",
  role_match: "Role match",
};

/** Detect whether the shift signals a driver/captain need from title/notes. */
export function inferShiftRoleNeeds(shift: Shift): { needsDriver: boolean; needsCaptain: boolean } {
  const hay = `${shift.title ?? ""} ${shift.notes ?? ""}`.toLowerCase();
  return {
    needsDriver: DRIVER_HINT_REGEX.test(hay),
    needsCaptain: CAPTAIN_HINT_REGEX.test(hay),
  };
}
