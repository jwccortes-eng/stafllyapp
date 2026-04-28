/**
 * Regression tests for isEmployeeDriver.
 * Critical rule: legacy `has_car` text values like "Yes, I have a Car"
 * must be honored. `can_drive=true` also qualifies. Empty/null = false.
 */
import { describe, it, expect } from "vitest";
import { isEmployeeDriver } from "@/components/shifts/types";

describe("isEmployeeDriver", () => {
  it('returns true for legacy has_car="Yes, I have a Car"', () => {
    expect(isEmployeeDriver({ has_car: "Yes, I have a Car", can_drive: false } as any)).toBe(true);
  });

  it("returns true for has_car=Sí tengo carro (Spanish)", () => {
    expect(isEmployeeDriver({ has_car: "Sí tengo carro", can_drive: false } as any)).toBe(true);
  });

  it('returns false for has_car="No, I dont have a car" (legacy text wins over fallback)', () => {
    expect(isEmployeeDriver({ has_car: "No, I dont have a car", can_drive: true } as any)).toBe(false);
  });

  it("returns true for can_drive=true when has_car is empty/null", () => {
    expect(isEmployeeDriver({ has_car: null, can_drive: true } as any)).toBe(true);
    expect(isEmployeeDriver({ has_car: "", can_drive: true } as any)).toBe(true);
  });

  it("returns false for empty/null/undefined values", () => {
    expect(isEmployeeDriver({ has_car: null, can_drive: false } as any)).toBe(false);
    expect(isEmployeeDriver({ has_car: undefined, can_drive: undefined } as any)).toBe(false);
    expect(isEmployeeDriver({ has_car: "", can_drive: false } as any)).toBe(false);
  });

  it("returns false for unrelated has_car text without affirmative keyword", () => {
    expect(isEmployeeDriver({ has_car: "maybe later", can_drive: false } as any)).toBe(false);
  });
});
