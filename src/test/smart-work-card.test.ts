import { describe, it, expect } from "vitest";
import {
  buildSmartWorkCardViewModel,
  getPayEstimate,
  getWorkLocation,
  getWorkTiming,
} from "@/lib/shifts/smart-work-card";

const baseShift = {
  id: "s1",
  title: "#0250 TURNO",
  shift_code: "0250",
  date: "2026-06-02",
  start_time: "08:00",
  end_time: "16:00",
  category: "Mesero",
  status: "scheduled",
  publication_status: "published",
};

describe("smart-work-card ViewModel", () => {
  it("formats timing with start as protagonist and end as 'aprox'", () => {
    const t = getWorkTiming({ shift: baseShift } as any);
    expect(t.startLabel).toBe("8:00 AM");
    expect(t.endApproxLabel).toBe("Termina aprox. 4:00 PM");
    expect(t.durationHours).toBe(8);
  });

  it("identity strips leading legacy code and exposes Ref separately", () => {
    const vm = buildSmartWorkCardViewModel(
      { shift: baseShift, client: { name: "JKitchen" } } as any,
      { audience: "worker" },
    );
    expect(vm.identity.title.toLowerCase()).not.toContain("#0250");
    expect(vm.identity.refLabel).toMatch(/0250/);
  });

  it("pay estimate is always non-final and labeled", () => {
    const pay = getPayEstimate({
      shift: baseShift,
      compensation: { pay_type: "hourly", hourly_rate: 20 },
    } as any);
    expect(pay.isFinal).toBe(false);
    expect(pay.label).toBe("Estimado");
    expect(pay.amount).toBe(160);
  });

  it("pay estimate becomes 'Pago final pendiente' when clock-out missing", () => {
    const pay = getPayEstimate({
      shift: baseShift,
      compensation: { pay_type: "hourly", hourly_rate: 20 },
      myAssignment: { has_clock_in: true, has_clock_out: false },
    } as any);
    expect(pay.label).toBe("Pago final pendiente");
    expect(pay.amount).toBeNull();
  });

  it("location flags manual address as needs_review", () => {
    const loc = getWorkLocation({
      shift: { ...baseShift, job_site_address: "123 Main St" },
    } as any);
    expect(loc.badge).toBe("needs_review");
    expect(loc.hasDirections).toBe(true);
  });

  it("admin coverage gap surfaces risk and operate action", () => {
    const vm = buildSmartWorkCardViewModel(
      {
        shift: baseShift,
        coverage: { required: 3, confirmed: 1, pending: 2 },
      } as any,
      { audience: "admin" },
    );
    expect(vm.status.riskHints.length).toBeGreaterThan(0);
    expect(["operate", "assign"]).toContain(vm.nextAction.kind);
  });

  it("compact density only shows minimal blocks", () => {
    const vm = buildSmartWorkCardViewModel(
      { shift: baseShift } as any,
      { audience: "worker", density: "compact" },
    );
    expect(vm.visibleBlocks).toEqual(["identity", "timing", "status", "action"]);
  });
});
