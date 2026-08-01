/**
 * P1 — Shift Team Hub contextual data scope.
 *
 * Regression guard for the root cause found in this sprint: the mobile
 * operations sheet passed the COMPANY-WIDE assignment list into the
 * attendance/evidence card, so workers from other shifts appeared in the
 * attendance roster of the current shift.
 */
import { describe, it, expect } from "vitest";
import { staffedAssignments, countStaffed } from "@/lib/shifts/assignment-coverage";

const ASSIGNMENTS = [
  { shift_id: "s1", employee_id: "e1", status: "confirmed" },
  { shift_id: "s1", employee_id: "e2", status: "pending" },
  { shift_id: "s1", employee_id: "e3", status: "removed" },   // replaced
  { shift_id: "s1", employee_id: "e4", status: "rejected" },
  { shift_id: "s2", employee_id: "e9", status: "confirmed" }, // other shift
];

describe("shift-scoped attendance roster", () => {
  it("only returns assignments of the requested shift", () => {
    const roster = staffedAssignments(ASSIGNMENTS, "s1");
    expect(roster.map(a => a.employee_id)).toEqual(["e1", "e2"]);
  });

  it("never leaks workers from another shift", () => {
    const roster = staffedAssignments(ASSIGNMENTS, "s1");
    expect(roster.some(a => a.employee_id === "e9")).toBe(false);
  });

  it("excludes replaced/removed workers from the active team", () => {
    expect(countStaffed(ASSIGNMENTS, "s1")).toBe(2);
  });

  it("keeps other shifts independent", () => {
    expect(countStaffed(ASSIGNMENTS, "s2")).toBe(1);
  });
});
