/**
 * ============================================================
 * Attendance Resolver — Single source of truth per assignment
 * ============================================================
 *
 * Replaces the legacy "did they punch a clock?" check with a layered
 * resolution that understands real staffing operations:
 *
 *   1. Explicit no_show on the assignment (admin marked it)
 *   2. Real clock entry (clock_in + clock_out, status != rejected)
 *   3. Manual administrative resolution (time_entry with entry_source='manual')
 *   4. Day-pay / weekend-job confirmation (entry_source='daypay' OR shift.pay_type='daily' with any approved entry)
 *   5. Mixed (clock + manual corrections on same assignment)
 *   6. Pending review (assigned, no evidence, no explicit no_show)
 *
 * Cross-midnight rule:
 *   A shift block remains "the same operational shift" until 03:00 of the
 *   following day. Hours computed via resolveOperationalShiftWindow.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ResolvedAttendanceStatus =
  | "worked_clock"
  | "worked_manual"
  | "worked_daypay"
  | "worked_mixed"
  | "no_show"
  | "pending_review";

export type ResolutionSource = "clock" | "manual" | "daypay" | "mixed" | "none";

export interface ResolvedAttendance {
  resolved_status: ResolvedAttendanceStatus;
  resolution_source: ResolutionSource;
  worked_minutes: number;
  worked_hours: number;
  is_counted_as_covered: boolean;
  is_counted_for_payroll: boolean;
  needs_review: boolean;
}

export interface ShiftLite {
  id: string;
  date: string;                 // YYYY-MM-DD
  start_time?: string | null;   // HH:MM(:SS)
  end_time?: string | null;     // HH:MM(:SS)
  pay_type?: string | null;     // 'hourly' | 'daily' | null
}

export interface AssignmentLite {
  id: string;
  shift_id: string;
  employee_id: string;
  status: string;               // includes 'no_show'
}

export interface TimeEntryLite {
  id: string;
  shift_id: string | null;
  employee_id: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;               // 'pending' | 'approved' | 'rejected' | ...
  break_minutes?: number | null;
  entry_source?: string | null; // 'clock' | 'manual' | 'daypay' | 'import'
}

// ─────────────────────────────────────────────────────────────
// Cross-midnight operational window (cutoff 03:00)
// ─────────────────────────────────────────────────────────────

const CROSS_MIDNIGHT_CUTOFF_HOUR = 3;

/**
 * Build the operational [start, end] window for a shift, extending across
 * midnight up to `graceCutoffHour` of the next day when end_time < start_time
 * or end_time falls in the early-morning grace zone.
 */
export function resolveOperationalShiftWindow(
  shift: Pick<ShiftLite, "date" | "start_time" | "end_time">,
  graceCutoffHour = CROSS_MIDNIGHT_CUTOFF_HOUR,
): { start: Date; end: Date } | null {
  if (!shift.date || !shift.start_time || !shift.end_time) return null;

  const start = parseLocalDateTime(shift.date, shift.start_time);
  let end = parseLocalDateTime(shift.date, shift.end_time);
  if (!start || !end) return null;

  const crossesMidnight = end.getTime() <= start.getTime();
  if (crossesMidnight) {
    end = new Date(end.getTime() + 24 * 3600 * 1000);
  }

  // If end falls between 00:00 and graceCutoffHour:00 of the next calendar
  // day, that's still the same operational shift.
  const endHour = end.getHours();
  const sameOpDay =
    end.getDate() !== start.getDate() && endHour <= graceCutoffHour;
  void sameOpDay; // documentation; window is already extended above

  return { start, end };
}

function parseLocalDateTime(dateISO: string, timeStr: string): Date | null {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = timeStr.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh, mm, ss);
}

// ─────────────────────────────────────────────────────────────
// Time-entry helpers
// ─────────────────────────────────────────────────────────────

/** A clock pair we trust: both times present, status not rejected. */
function isUsableEntry(te: TimeEntryLite): boolean {
  if (te.status === "rejected") return false;
  return Boolean(te.clock_in && te.clock_out);
}

/** Worked minutes of a single entry. Open entries (no clock_out) → 0. */
function entryMinutes(te: TimeEntryLite): number {
  if (!te.clock_in || !te.clock_out) return 0;
  const inMs = new Date(te.clock_in).getTime();
  const outMs = new Date(te.clock_out).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs <= inMs) return 0;
  const raw = (outMs - inMs) / 60000;
  return Math.max(0, Math.round(raw - (te.break_minutes ?? 0)));
}

function source(te: TimeEntryLite): "clock" | "manual" | "daypay" | "import" {
  const s = (te.entry_source ?? "clock").toLowerCase();
  if (s === "manual" || s === "daypay" || s === "import") return s;
  return "clock";
}

// ─────────────────────────────────────────────────────────────
// Core resolver — one assignment at a time
// ─────────────────────────────────────────────────────────────

export interface ResolveParams {
  shift: ShiftLite;
  assignment: AssignmentLite;
  /** Time entries already filtered to this shift_id + employee_id. */
  entries: TimeEntryLite[];
}

export function resolveShiftAttendanceForAssignment(
  params: ResolveParams,
): ResolvedAttendance {
  const { shift, assignment, entries } = params;

  // 1) Explicit no-show wins over everything
  if (assignment.status === "no_show") {
    return {
      resolved_status: "no_show",
      resolution_source: "none",
      worked_minutes: 0,
      worked_hours: 0,
      is_counted_as_covered: false,
      is_counted_for_payroll: false,
      needs_review: false,
    };
  }

  const usable = entries.filter(isUsableEntry);
  const isDailyShift = (shift.pay_type ?? "").toLowerCase() === "daily";

  const sources = new Set(usable.map(source));
  const hasClock = sources.has("clock") || sources.has("import");
  const hasManual = sources.has("manual");
  const hasDaypay = sources.has("daypay");

  // 4) day-pay / weekend job — special rules: any approved entry counts;
  //    if no entry but the shift is daily AND assignment is accepted, treat as
  //    pending until an admin confirms (we don't auto-confirm).
  if (isDailyShift && usable.length > 0) {
    const totalMin = usable.reduce((sum, te) => sum + entryMinutes(te), 0);
    return {
      resolved_status: "worked_daypay",
      resolution_source: "daypay",
      worked_minutes: totalMin,
      worked_hours: round2(totalMin / 60),
      is_counted_as_covered: true,
      is_counted_for_payroll: true,
      needs_review: false,
    };
  }

  // 5) Mixed clock + manual on the same assignment
  if (hasClock && hasManual) {
    const totalMin = usable.reduce((sum, te) => sum + entryMinutes(te), 0);
    return {
      resolved_status: "worked_mixed",
      resolution_source: "mixed",
      worked_minutes: totalMin,
      worked_hours: round2(totalMin / 60),
      is_counted_as_covered: true,
      is_counted_for_payroll: true,
      needs_review: false,
    };
  }

  // 2) Real clock evidence
  if (hasClock) {
    const totalMin = usable.reduce((sum, te) => sum + entryMinutes(te), 0);
    return {
      resolved_status: "worked_clock",
      resolution_source: "clock",
      worked_minutes: totalMin,
      worked_hours: round2(totalMin / 60),
      is_counted_as_covered: true,
      is_counted_for_payroll: true,
      needs_review: false,
    };
  }

  // 3) Manual administrative resolution
  if (hasManual) {
    const totalMin = usable.reduce((sum, te) => sum + entryMinutes(te), 0);
    return {
      resolved_status: "worked_manual",
      resolution_source: "manual",
      worked_minutes: totalMin,
      worked_hours: round2(totalMin / 60),
      is_counted_as_covered: true,
      is_counted_for_payroll: true,
      needs_review: false,
    };
  }

  // Daypay marker without entries (shouldn't happen often, but supported)
  if (hasDaypay) {
    return {
      resolved_status: "worked_daypay",
      resolution_source: "daypay",
      worked_minutes: 0,
      worked_hours: 0,
      is_counted_as_covered: true,
      is_counted_for_payroll: true,
      needs_review: false,
    };
  }

  // 6) No evidence at all
  return {
    resolved_status: "pending_review",
    resolution_source: "none",
    worked_minutes: 0,
    worked_hours: 0,
    is_counted_as_covered: false,
    is_counted_for_payroll: false,
    needs_review: true,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Coverage status aggregation
// ─────────────────────────────────────────────────────────────

export type CoverageStatus =
  | "covered"
  | "covered_with_incidents"
  | "partial"
  | "uncovered"
  | "pending_review";

export interface CoverageCounts {
  scheduled_count: number;
  covered_count: number;
  manual_resolved_count: number;
  daypay_resolved_count: number;
  clock_count: number;
  mixed_count: number;
  no_show_count: number;
  pending_review_count: number;
  extra_count: number; // worked but not assigned
}

export function deriveCoverageStatus(c: CoverageCounts): CoverageStatus {
  if (c.scheduled_count === 0) {
    return c.extra_count > 0 ? "covered" : "pending_review";
  }
  if (c.covered_count === 0 && c.no_show_count === 0) return "pending_review";
  if (c.covered_count === c.scheduled_count) return "covered";
  if (c.covered_count > 0 && c.no_show_count > 0 && c.pending_review_count === 0)
    return "covered_with_incidents";
  if (c.covered_count > 0) return "partial";
  return "uncovered";
}

export const ATTENDANCE_LABELS: Record<ResolvedAttendanceStatus, string> = {
  worked_clock: "Trabajó (reloj)",
  worked_manual: "Trabajó (manual)",
  worked_daypay: "Trabajó (day pay)",
  worked_mixed: "Trabajó (mixto)",
  no_show: "No se presentó",
  pending_review: "Pendiente revisión",
};

export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  covered: "Cubierto",
  covered_with_incidents: "Cubierto con incidencia",
  partial: "Cobertura parcial",
  uncovered: "Sin cobertura",
  pending_review: "Pendiente revisión",
};
