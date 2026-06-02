import { describe, it, expect } from "vitest";
import { stripLeadingShiftCode, buildShiftCardTitle, formatShiftRef } from "@/lib/shifts/card-display";

describe("stripLeadingShiftCode", () => {
  it("removes single leading hash code", () => {
    expect(stripLeadingShiftCode("#0258 TURNO")).toBe("TURNO");
  });
  it("removes duplicated leading codes", () => {
    expect(stripLeadingShiftCode("#0258 #0258 TURNO")).toBe("TURNO");
  });
  it("keeps title without leading code intact", () => {
    expect(stripLeadingShiftCode("Eminence Ballroom · Captain")).toBe("Eminence Ballroom · Captain");
  });
  it("handles empty input", () => {
    expect(stripLeadingShiftCode(null)).toBe("");
  });
});

describe("buildShiftCardTitle", () => {
  it("uses cleaned title when available", () => {
    expect(buildShiftCardTitle({ title: "#0250 Brunch", clientName: "X" })).toBe("Brunch");
  });
  it("falls back to client when title is generic", () => {
    expect(buildShiftCardTitle({ title: "Turno", clientName: "Eminence", category: "Captain" }))
      .toBe("Eminence · Captain");
  });
  it("falls back to location when no client", () => {
    expect(buildShiftCardTitle({ title: "", locationName: "Ballroom" })).toBe("Ballroom");
  });
  it("uses 'Turno sin título' as last resort", () => {
    expect(buildShiftCardTitle({ title: null })).toBe("Turno sin título");
  });
});

describe("formatShiftRef", () => {
  it("pads short codes", () => {
    expect(formatShiftRef("250")).toBe("Ref #0250");
  });
  it("returns null for empty", () => {
    expect(formatShiftRef(null)).toBe(null);
  });
});
