import { describe, it, expect } from "vitest";
import {
  isOperationalAssignmentStatus,
  isCommittedAssignmentStatus,
  isExcludedAssignmentStatus,
  EXCLUDED_ASSIGNMENT_STATUS_FILTER,
  COMMITTED_ASSIGNMENT_STATUS_LIST,
} from "@/lib/shifts/assignment-status-truth";

describe("assignment status truth", () => {
  it("accepted cuenta igual que confirmed", () => {
    expect(isCommittedAssignmentStatus("accepted")).toBe(true);
    expect(isCommittedAssignmentStatus("confirmed")).toBe(true);
    expect(isCommittedAssignmentStatus("scheduled")).toBe(true);
    expect(COMMITTED_ASSIGNMENT_STATUS_LIST).toContain("accepted");
  });

  it("pending sigue siendo operativo pero no comprometido", () => {
    expect(isOperationalAssignmentStatus("pending")).toBe(true);
    expect(isCommittedAssignmentStatus("pending")).toBe(false);
  });

  it("estados de salida nunca son operativos", () => {
    for (const s of ["removed", "rejected", "declined", "cancelled", "canceled", "unassigned", "replaced"]) {
      expect(isExcludedAssignmentStatus(s)).toBe(true);
      expect(isOperationalAssignmentStatus(s)).toBe(false);
    }
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(isExcludedAssignmentStatus(" Removed ")).toBe(true);
    expect(isCommittedAssignmentStatus("ACCEPTED")).toBe(true);
  });

  it("un estado desconocido se muestra, no se oculta", () => {
    expect(isOperationalAssignmentStatus("weird_new_state")).toBe(true);
    expect(isCommittedAssignmentStatus("weird_new_state")).toBe(false);
  });

  it("el filtro PostgREST cubre todos los estados de salida", () => {
    expect(EXCLUDED_ASSIGNMENT_STATUS_FILTER).toBe(
      "(removed,rejected,declined,cancelled,canceled,unassigned,replaced)",
    );
  });
});
