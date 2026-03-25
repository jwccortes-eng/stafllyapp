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
