import { describe, it, expect } from "vitest";
import {
  getAttendanceEvidenceState,
  getShiftOperationalSummary,
  getPayrollReviewFlags,
  getWorkerNextActions,
  type AttendanceShift,
  type AttendanceAssignment,
  type ClockEntry,
  type AdminValidation,
} from "@/lib/shifts/attendance-evidence";

const shift: AttendanceShift = {
  id: "s1",
  date: "2026-06-02",
  start_time: "09:00",
  end_time: "17:00",
};
const NOW_BEFORE = "2026-06-02T08:00:00";
const NOW_DURING = "2026-06-02T12:00:00";
const NOW_AFTER  = "2026-06-02T20:00:00";

const assign = (id: string, employee_id: string, status = "confirmed"): AttendanceAssignment =>
  ({ id, employee_id, status });

describe("getAttendanceEvidenceState", () => {
  it("no_data when shift hasn't started and no clock", () => {
    const s = getAttendanceEvidenceState(shift, [], [], NOW_BEFORE);
    expect(s.code).toBe("no_data");
    expect(s.needsPayrollReview).toBe(false);
  });

  it("clocked_complete trumps validations", () => {
    const entry: ClockEntry = { id: "e1", employee_id: "u1", clock_in: "2026-06-02T09:05:00Z", clock_out: "2026-06-02T17:10:00Z" };
    const val: AdminValidation = { employee_id: "u1", kind: "absent_confirmed", reason: "seen_on_site", created_at: "2026-06-02T18:00:00" };
    const s = getAttendanceEvidenceState(shift, [entry], [val], NOW_AFTER);
    expect(s.code).toBe("clocked_complete");
    expect(s.needsPayrollReview).toBe(false);
  });

  it("clocked_in while shift is open", () => {
    const entry: ClockEntry = { id: "e1", employee_id: "u1", clock_in: "2026-06-02T09:05:00Z", clock_out: null };
    const s = getAttendanceEvidenceState(shift, [entry], [], NOW_DURING);
    expect(s.code).toBe("clocked_in");
  });

  it("missing_clock_out after end with open clock-in", () => {
    const entry: ClockEntry = { id: "e1", employee_id: "u1", clock_in: "2026-06-02T09:05:00Z", clock_out: null };
    const s = getAttendanceEvidenceState(shift, [entry], [], NOW_AFTER);
    expect(s.code).toBe("missing_clock_out");
    expect(s.needsPayrollReview).toBe(true);
  });

  it("missing_clock_in while shift is open and no validation", () => {
    const s = getAttendanceEvidenceState(shift, [], [], NOW_DURING);
    expect(s.code).toBe("missing_clock_in");
    expect(s.needsPayrollReview).toBe(false);
    expect(s.recommendedAction).toContain("Contactar");
  });

  it("present_no_clock validation flags payroll review", () => {
    const val: AdminValidation = { employee_id: "u1", kind: "present_no_clock", reason: "supervisor_confirmed", created_at: NOW_DURING };
    const s = getAttendanceEvidenceState(shift, [], [val], NOW_DURING);
    expect(s.code).toBe("present_no_clock");
    expect(s.needsPayrollReview).toBe(true);
    expect(s.message).toContain("supervisor");
    expect(s.message).toContain("ajuste aprobado");
  });

  it("absent_confirmed does NOT request payroll review", () => {
    const val: AdminValidation = { employee_id: "u1", kind: "absent_confirmed", reason: "phone_call_confirmed", created_at: NOW_AFTER };
    const s = getAttendanceEvidenceState(shift, [], [val], NOW_AFTER);
    expect(s.code).toBe("absent_confirmed");
    expect(s.needsPayrollReview).toBe(false);
  });

  it("uses the latest validation when several exist", () => {
    const v1: AdminValidation = { employee_id: "u1", kind: "present_no_clock", reason: "seen_on_site", created_at: "2026-06-02T11:00:00" };
    const v2: AdminValidation = { employee_id: "u1", kind: "left_early_no_clock", reason: "supervisor_confirmed", created_at: "2026-06-02T16:00:00" };
    const s = getAttendanceEvidenceState(shift, [], [v1, v2], NOW_AFTER);
    expect(s.code).toBe("left_early_no_clock");
  });
});

describe("getShiftOperationalSummary", () => {
  it("aggregates counts and sentence", () => {
    const a1 = assign("a1", "u1");
    const a2 = assign("a2", "u2");
    const a3 = assign("a3", "u3", "rejected"); // excluded
    const entries = new Map<string, ClockEntry[]>([
      ["u1", [{ id: "e1", employee_id: "u1", clock_in: "2026-06-02T09:00:00Z", clock_out: "2026-06-02T17:00:00Z" }]],
    ]);
    const validations = new Map<string, AdminValidation[]>([
      ["u2", [{ employee_id: "u2", kind: "present_no_clock", reason: "seen_on_site", created_at: NOW_DURING }]],
    ]);
    const sum = getShiftOperationalSummary(shift, [a1, a2, a3], entries, validations, NOW_AFTER);
    expect(sum.totalWorkers).toBe(2);
    expect(sum.withClockComplete).toBe(1);
    expect(sum.presentWithoutClock).toBe(1);
    expect(sum.pendingPayrollReview).toBe(1);
    expect(sum.sentence).toContain("Revisa horas");
  });
});

describe("getPayrollReviewFlags", () => {
  it("emits manual_presence_needs_hours for present_no_clock", () => {
    const flags = getPayrollReviewFlags(
      shift,
      [assign("a1", "u1")],
      new Map(),
      new Map([["u1", [{ employee_id: "u1", kind: "present_no_clock", reason: "seen_on_site", created_at: NOW_DURING }]]]),
      NOW_DURING,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("manual_presence_needs_hours");
  });

  it("emits no_evidence_after_end only after shift end", () => {
    const flagsBefore = getPayrollReviewFlags(shift, [assign("a1", "u1")], new Map(), new Map(), NOW_DURING);
    expect(flagsBefore).toHaveLength(0);
    const flagsAfter = getPayrollReviewFlags(shift, [assign("a1", "u1")], new Map(), new Map(), NOW_AFTER);
    expect(flagsAfter[0].kind).toBe("no_evidence_after_end");
    expect(flagsAfter[0].severity).toBe("danger");
  });

  it("ignores rejected/removed assignments", () => {
    const flags = getPayrollReviewFlags(
      shift,
      [assign("a1", "u1", "rejected"), assign("a2", "u2", "removed")],
      new Map(), new Map(),
      NOW_AFTER,
    );
    expect(flags).toHaveLength(0);
  });
});

describe("getWorkerNextActions", () => {
  it("offers contact + validations when missing clock-in", () => {
    const acts = getWorkerNextActions({
      code: "missing_clock_in", label: "x", tone: "warn", message: "", needsPayrollReview: false, recommendedAction: null,
    });
    expect(acts.map(a => a.kind)).toEqual([
      "contact_worker", "mark_present_no_clock", "mark_late_no_clock", "mark_absent",
    ]);
  });

  it("offers review_hours after a present_no_clock validation", () => {
    const acts = getWorkerNextActions({
      code: "present_no_clock", label: "x", tone: "warn", message: "", needsPayrollReview: true, recommendedAction: null,
    });
    expect(acts[0].kind).toBe("review_hours");
  });

  it("no actions for clocked_complete", () => {
    const acts = getWorkerNextActions({
      code: "clocked_complete", label: "x", tone: "success", message: "", needsPayrollReview: false, recommendedAction: null,
    });
    expect(acts).toHaveLength(0);
  });
});
