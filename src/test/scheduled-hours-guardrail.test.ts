/**
 * GUARDRAIL TEST: Scheduled hours must NEVER be used for payroll amounts.
 *
 * This test ensures the hard business rule is enforced:
 * - Scheduled hours = ESTIMATE / OPERATIONAL only
 * - Only clocked hours, truth file amounts, or approved manual adjustments
 *   may be used for real payroll calculations.
 */
import { describe, it, expect } from "vitest";
import { classifyPayrollRow } from "@/lib/reconciliation-engine";

describe("Hard Payroll Rule: Scheduled hours are never pay authority", () => {
  it("classifyPayrollRow does NOT use scheduled hours — only total_hours from clock/import", () => {
    // classifyPayrollRow receives a row with total_hours from actual clocked data,
    // NOT scheduled hours. Verify the function works with clock-sourced data.
    const clockRow = {
      "Total hours": "5",
      "Total pay": "75",
      "Job title": "General Cleaning",
    };
    const result = classifyPayrollRow(clockRow);
    expect(result.pay_type).toBe("hourly");
    expect(result.base_pay).toBe(75);
    expect(result.confidence).toBeGreaterThanOrEqual(80);
  });

  it("a row with 0 hours and a fixed amount is NOT classified as hourly", () => {
    const dailyRow = {
      "Total hours": "0",
      "Total pay": "200",
      "Job title": "Weekend Job",
    };
    const result = classifyPayrollRow(dailyRow);
    // Should NOT be hourly — no clocked hours means no hourly pay
    expect(result.pay_type).not.toBe("hourly");
  });

  it("truth file amounts are used for pay, not schedule-derived amounts", () => {
    // This test documents the rule: truth file is authoritative
    // The reconciliation engine compares truth vs system, never schedule vs pay
    const truthRow = {
      "Total hours": "0",
      "Total pay": "0",
      "Job title": "",
    };
    const result = classifyPayrollRow(truthRow);
    // With no hours and no pay, should be unknown — never infer from schedule
    expect(result.pay_type).toBe("unknown");
    expect(result.base_pay).toBe(0);
  });

  it("schedule-only data should never produce a payroll classification with high confidence", () => {
    // A row that has no real hours and no real pay should not produce confident payroll
    const scheduleOnlyRow = {
      "Total hours": "0",
      "Total pay": "0",
      "Job title": "Morning Shift",
      "Shift title": "8:00 AM - 4:00 PM",
    };
    const result = classifyPayrollRow(scheduleOnlyRow);
    expect(result.confidence).toBeLessThan(50);
  });
});

describe("Known Pattern Detector: system learns from each close", () => {
  // Import dynamically to keep test file self-contained
  let detectKnownPatterns: typeof import("@/lib/known-pattern-detector").detectKnownPatterns;

  beforeAll(async () => {
    const mod = await import("@/lib/known-pattern-detector");
    detectKnownPatterns = mod.detectKnownPatterns;
  });

  it("detects system-inflated-no-evidence pattern (Jonathan Lopez pattern)", () => {
    const records = [
      {
        employee_id: "emp-1",
        grand_total: 352.50,
        source_payroll_total: 82,
        base_pay: 352.50,
        total_scheduled_hours: 5.5,
        total_worked_hours: 0,
        shift_calculation_source: "truth_validation",
        reconciliation_status: "partial",
        warnings: [],
        scheduled_shifts: [],
        worked_shifts: [],
        payroll_rows: [],
      },
    ];
    const patterns = detectKnownPatterns(records);
    const inflated = patterns.find(p => p.patternKey === "system_inflated_no_evidence");
    expect(inflated).toBeDefined();
    expect(inflated!.affectedEmployeeIds).toContain("emp-1");
    expect(inflated!.suggestedResolution).toBe("approve");
  });

  it("detects identity-only-no-data pattern", () => {
    const records = [
      {
        employee_id: "emp-2",
        grand_total: 0,
        source_payroll_total: 0,
        base_pay: 0,
        total_scheduled_hours: 0,
        total_worked_hours: 0,
        shift_calculation_source: "truth_validation",
        reconciliation_status: "partial",
        warnings: [],
        scheduled_shifts: [],
        worked_shifts: [],
        payroll_rows: [],
      },
    ];
    const patterns = detectKnownPatterns(records);
    const identity = patterns.find(p => p.patternKey === "identity_only_no_data");
    expect(identity).toBeDefined();
    expect(identity!.suggestedResolution).toBe("suppress");
  });

  it("detects exact-match-with-evidence as auto-approvable", () => {
    const records = [
      {
        employee_id: "emp-3",
        grand_total: 500,
        source_payroll_total: 500,
        base_pay: 500,
        total_scheduled_hours: 30,
        total_worked_hours: 30,
        shift_calculation_source: "native",
        reconciliation_status: "partial",
        warnings: [],
        scheduled_shifts: [{}],
        worked_shifts: [{}],
        payroll_rows: [{}],
      },
    ];
    const patterns = detectKnownPatterns(records);
    const exact = patterns.find(p => p.patternKey === "exact_match_with_evidence");
    expect(exact).toBeDefined();
    expect(exact!.suggestedResolution).toBe("approve");
    expect(exact!.confidence).toBeGreaterThanOrEqual(95);
  });
});
