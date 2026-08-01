import { describe, it, expect } from "vitest";
import {
  classifyAssignError,
  buildAssignOutcome,
  summarizeCreateResult,
  retryableOutcomes,
} from "@/lib/shifts/assign-outcome";

describe("classifyAssignError", () => {
  it("detecta duplicados", () => {
    expect(classifyAssignError({ message: 'duplicate key value violates unique constraint' })).toBe("already_assigned");
    expect(classifyAssignError("already assigned to shift")).toBe("already_assigned");
  });
  it("detecta solapamientos", () => {
    expect(classifyAssignError({ message: "shift overlap detected" })).toBe("overlap");
  });
  it("detecta permisos", () => {
    expect(classifyAssignError({ message: "not authorized" })).toBe("not_allowed");
    expect(classifyAssignError({ code: "42501", message: "permission denied for table" })).toBe("not_allowed");
  });
  it("detecta bloqueo por compliance", () => {
    expect(classifyAssignError({ message: "assignment blocked: documents_pending" })).toBe("compliance_blocked");
  });
  it("detecta red", () => {
    expect(classifyAssignError({ message: "Failed to fetch" })).toBe("network");
  });
  it("cae en unknown", () => {
    expect(classifyAssignError({})).toBe("unknown");
    expect(classifyAssignError({ message: "algo raro" })).toBe("unknown");
  });
});

describe("buildAssignOutcome", () => {
  it("sin error es éxito y sin jerga técnica", () => {
    const o = buildAssignOutcome("e1", "Ana Ruiz", null);
    expect(o.ok).toBe(true);
    expect(o.code).toBe("assigned");
    expect(o.reason).not.toMatch(/error|sql|rpc/i);
  });
  it("duplicado cuenta como ok (no es fallo operativo)", () => {
    const o = buildAssignOutcome("e1", "Ana", { message: "duplicate key" });
    expect(o.ok).toBe(true);
    expect(o.retryable).toBe(false);
  });
  it("compliance es fallo reintentable", () => {
    const o = buildAssignOutcome("e2", "Luis", { message: "blocked by compliance" });
    expect(o.ok).toBe(false);
    expect(o.retryable).toBe(true);
    expect(o.nextAction.length).toBeGreaterThan(0);
  });
});

describe("summarizeCreateResult", () => {
  it("sin equipo solicitado", () => {
    expect(summarizeCreateResult([], 0).kind).toBe("created_empty");
  });
  it("todas ok", () => {
    const outcomes = [
      buildAssignOutcome("a", "A", null),
      buildAssignOutcome("b", "B", null),
    ];
    const s = summarizeCreateResult(outcomes, 2);
    expect(s.kind).toBe("created_full");
    expect(s.okCount).toBe(2);
  });
  it("nunca muestra éxito total si algo falló", () => {
    const outcomes = [
      buildAssignOutcome("a", "A", null),
      buildAssignOutcome("b", "B", { message: "overlap" }),
    ];
    const s = summarizeCreateResult(outcomes, 2);
    expect(s.kind).toBe("created_partial");
    expect(s.failedCount).toBe(1);
  });
});

describe("retryableOutcomes", () => {
  it("excluye ok y no reintentables", () => {
    const outcomes = [
      buildAssignOutcome("a", "A", null),
      buildAssignOutcome("b", "B", { message: "overlap" }),
      buildAssignOutcome("c", "C", { message: "Failed to fetch" }),
    ];
    expect(retryableOutcomes(outcomes).map(o => o.employeeId)).toEqual(["c"]);
  });
});
