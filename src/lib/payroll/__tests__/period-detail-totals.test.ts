import { describe, it, expect } from "vitest";
import { computePeriodDetailTotals } from "../period-detail-totals";

describe("computePeriodDetailTotals", () => {
  it("Jorge Cortes · periodo 146 — deducción almacenada en negativo se resta una sola vez", () => {
    const t = computePeriodDetailTotals(
      649,
      [
        { total_value: 900, category: "extra", approval_status: "approved" },
        { total_value: 100, category: "extra", approval_status: "pending" },
        { total_value: -530, category: "deduction", approval_status: "approved" },
      ],
      1239,
    );
    expect(t.approvedExtras).toBe(900);
    expect(t.approvedDeductions).toBe(530);
    expect(t.pendingExtras).toBe(100);
    expect(t.pendingCount).toBe(1);
    expect(t.calculatedTotal).toBe(1019);
    expect(t.calculatedTotal).not.toBe(2179);
    expect(t.approvedTotal).toBe(1239);
    expect(t.hasExternalClose).toBe(true);
    expect(t.externalDifference).toBe(220);
  });

  it("Carlos Alvarez · periodo 146 — mismo patrón, diferencia +560", () => {
    const t = computePeriodDetailTotals(
      1164.5,
      [
        { total_value: 600, category: "extra", approval_status: "approved" },
        { total_value: 100, category: "extra", approval_status: "pending" },
      ],
      2324.5,
    );
    expect(t.calculatedTotal).toBe(1764.5);
    expect(t.externalDifference).toBe(560);
  });

  it("deducción almacenada en positivo produce el mismo total", () => {
    const neg = computePeriodDetailTotals(649, [{ total_value: -530, category: "deduction" }], null);
    const pos = computePeriodDetailTotals(649, [{ total_value: 530, category: "deduction" }], null);
    expect(neg.calculatedTotal).toBe(119);
    expect(pos.calculatedTotal).toBe(119);
  });

  it("sin cierre externo no reporta diferencia", () => {
    const t = computePeriodDetailTotals(500, [{ total_value: 50, category: "extra" }], null);
    expect(t.approvedTotal).toBeNull();
    expect(t.hasExternalClose).toBe(false);
    expect(t.externalDifference).toBe(0);
  });

  it("cierre externo igual al calculado no se marca como diferencia", () => {
    const t = computePeriodDetailTotals(500, [{ total_value: 50, category: "extra" }], 550);
    expect(t.hasExternalClose).toBe(false);
    expect(t.externalDifference).toBe(0);
  });

  it("movimientos sin approval_status cuentan como aprobados", () => {
    const t = computePeriodDetailTotals(100, [{ total_value: 25, category: "extra" }], null);
    expect(t.approvedExtras).toBe(25);
    expect(t.pendingCount).toBe(0);
  });
});
