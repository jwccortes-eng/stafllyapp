import { describe, it, expect } from "vitest";
import { getShiftStaffingMetrics, getStaffingMetricsByShift } from "@/lib/shifts/staffing-metrics";

describe("getShiftStaffingMetrics", () => {
  it("QK-001573: 23 requeridos, 13 asignados, 0 confirmados tras cambio material", () => {
    const assignments = [
      { status: "confirmed", response_status: "needs_reacceptance" },
      ...Array.from({ length: 12 }, () => ({ status: "pending", response_status: "pending" })),
    ];
    const m = getShiftStaffingMetrics(assignments, 23);
    expect(m.assignedActive).toBe(13);
    expect(m.required).toBe(23);
    expect(m.confirmed).toBe(0);
    expect(m.pendingResponse).toBe(13);
    expect(m.missing).toBe(10);
    expect(m.coverageLabel).toBe("13 de 23 cubiertos");
    expect(m.confirmationLabel).toBe("0 de 13 confirmó");
  });

  it("una aceptación real cuenta como confirmada y como cobertura", () => {
    const m = getShiftStaffingMetrics(
      [{ status: "confirmed", response_status: "accepted" }, { status: "pending" }],
      3,
    );
    expect(m.assignedActive).toBe(2);
    expect(m.confirmed).toBe(1);
    expect(m.confirmationLabel).toBe("1 de 2 confirmó");
  });

  it("worker removido no cuenta como cobertura activa", () => {
    const m = getShiftStaffingMetrics(
      [{ status: "removed" }, { removed_at: "2026-01-01" }, { status: "pending" }],
      2,
    );
    expect(m.removed).toBe(2);
    expect(m.assignedActive).toBe(1);
    expect(m.missing).toBe(1);
  });

  it("worker rechazado no cuenta como cobertura", () => {
    const m = getShiftStaffingMetrics(
      [{ status: "rejected" }, { status: "pending", response_status: "rejected" }, { status: "pending" }],
      3,
    );
    expect(m.rejected).toBe(2);
    expect(m.assignedActive).toBe(1);
  });

  it("aceptación importada no cuenta como confirmación de la persona", () => {
    const m = getShiftStaffingMetrics([{ status: "accepted", import_batch_id: "b1" }], 1);
    expect(m.assignedActive).toBe(1);
    expect(m.confirmed).toBe(0);
  });

  it("cobertura completa y confirmación completa", () => {
    const m = getShiftStaffingMetrics(
      [
        { status: "confirmed", response_status: "accepted", attendance_status: "present" },
        { status: "confirmed", response_status: "accepted" },
      ],
      2,
    );
    expect(m.isFullyCovered).toBe(true);
    expect(m.isFullyConfirmed).toBe(true);
    expect(m.checkedIn).toBe(1);
  });

  it("sin asignaciones no hay etiqueta de confirmación", () => {
    const m = getShiftStaffingMetrics([], 5);
    expect(m.confirmationLabel).toBeNull();
    expect(m.coverageLabel).toBe("0 de 5 cubiertos");
  });

  it("agrupa por turno", () => {
    const map = getStaffingMetricsByShift(
      [
        { shift_id: "a", status: "pending" },
        { shift_id: "a", status: "confirmed", response_status: "accepted" },
        { shift_id: "b", status: "rejected" },
      ],
      [{ id: "a", slots: 3 }, { id: "b", slots: 1 }],
    );
    expect(map.a.assignedActive).toBe(2);
    expect(map.a.confirmed).toBe(1);
    expect(map.b.assignedActive).toBe(0);
  });
});
