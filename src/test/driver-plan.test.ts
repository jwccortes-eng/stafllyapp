import { describe, it, expect } from "vitest";
import {
  EMPTY_DRIVER_PLAN,
  reconcileDriverPlan,
  toggleDriver,
  describeDriverPlan,
  assignmentRoleFor,
  primaryDriverId,
  driverSummaryLine,
} from "@/lib/shifts/driver-plan";

describe("driver-plan", () => {
  it("no marca drivers fuera del equipo", () => {
    const p = toggleDriver(EMPTY_DRIVER_PLAN, "x", ["a"]);
    expect(p.driverIds).toEqual([]);
  });

  it("marca y desmarca drivers del equipo", () => {
    let p = toggleDriver(EMPTY_DRIVER_PLAN, "a", ["a", "b"]);
    expect(p.driverIds).toEqual(["a"]);
    expect(p.transportRequired).toBe(true);
    p = toggleDriver(p, "b", ["a", "b"]);
    expect(p.driverIds).toEqual(["a", "b"]);
    p = toggleDriver(p, "a", ["a", "b"]);
    expect(p.driverIds).toEqual(["b"]);
  });

  it("quita drivers que salieron del equipo", () => {
    const p = reconcileDriverPlan({ transportRequired: true, driversRequired: 2, driverIds: ["a", "b"] }, ["a"]);
    expect(p.driverIds).toEqual(["a"]);
  });

  it("cuenta 3 de 5 drivers", () => {
    const s = describeDriverPlan({ transportRequired: true, driversRequired: 5, driverIds: ["a", "b", "c"] });
    expect(s.counterLabel).toBe("3 de 5 drivers seleccionados");
    expect(s.tone).toBe("warning");
    expect(s.incomplete).toBe(true);
  });

  it("marca cobertura completa", () => {
    const s = describeDriverPlan({ transportRequired: true, driversRequired: 2, driverIds: ["a", "b"] });
    expect(s.tone).toBe("success");
    expect(s.incomplete).toBe(false);
  });

  it("resuelve rol y driver principal", () => {
    const plan = { transportRequired: true, driversRequired: 2, driverIds: ["a", "b"] };
    expect(assignmentRoleFor(plan, "a")).toBe("driver");
    expect(assignmentRoleFor(plan, "z")).toBe("worker");
    expect(primaryDriverId(plan)).toBe("a");
    expect(primaryDriverId(EMPTY_DRIVER_PLAN)).toBeNull();
    expect(driverSummaryLine(EMPTY_DRIVER_PLAN)).toBe("Sin transporte");
  });
});
