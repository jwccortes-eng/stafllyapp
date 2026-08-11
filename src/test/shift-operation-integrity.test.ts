import { describe, expect, it } from "vitest";
import { deriveAttendanceTruth } from "@/lib/shifts/attendance-truth";
import { evaluateCloseoutGate } from "@/lib/shifts/closeout-gate";
import {
  clockRequestReducer,
  initialClockRequestState,
  isActionLocked,
  isAmbiguousFailure,
} from "@/lib/timeclock/clock-request-state";

const WINDOW = {
  windowStartsAt: "2026-08-10T16:00:00Z",
  windowEndsAt: "2026-08-10T21:00:00Z",
  now: new Date("2026-08-10T23:00:00Z"),
};

describe("P0-C · contadores veraces", () => {
  it("cuenta como fichado a quien ya salió (nunca 0 fichados / 2 salidas)", () => {
    const t = deriveAttendanceTruth({
      assignments: [
        { id: "a1", employee_id: "e1", status: "confirmed" },
        { id: "a2", employee_id: "e2", status: "confirmed" },
      ],
      entries: [
        { id: "t1", employee_id: "e1", clock_in: "2026-08-10T16:05:00Z", clock_out: "2026-08-10T21:02:00Z" },
        { id: "t2", employee_id: "e2", clock_in: "2026-08-10T16:07:00Z", clock_out: "2026-08-10T21:04:00Z" },
      ],
      ...WINDOW,
    });
    expect(t.counts.clockedIn).toBe(2);
    expect(t.counts.clockOuts).toBe(2);
    expect(t.counts.active).toBe(0);
  });

  it("caso Mariany: fichaje abierto tras la ventana ⇒ falta salida", () => {
    const t = deriveAttendanceTruth({
      assignments: [{ id: "a1", employee_id: "mariany", status: "confirmed" }],
      entries: [{ id: "t1", employee_id: "mariany", clock_in: "2026-08-10T16:37:00Z", clock_out: null }],
      ...WINDOW,
    });
    expect(t.counts.missingClockOut).toBe(1);
    expect(t.explain.missingClockOut).toContain("mariany");
  });
});

describe("P0-B · puerta única de cierre", () => {
  const truthOpen = deriveAttendanceTruth({
    assignments: [{ id: "a1", employee_id: "mariany", status: "confirmed" }],
    entries: [{ id: "t1", employee_id: "mariany", clock_in: "2026-08-10T16:37:00Z", clock_out: null }],
    ...WINDOW,
  });

  it("con fichaje abierto nunca queda FULLY_RECONCILED", () => {
    const g = evaluateCloseoutGate({
      shiftId: "s1",
      truth: truthOpen,
      closeout: { status: "reviewed", review_status: "approved" } as never,
      shiftEnded: true,
    });
    expect(g.canFullyReconcile).toBe(false);
    expect(g.state).toBe("CLOSEOUT_SUBMITTED");
    expect(g.blockers.some((b) => b.id === "open-time-entries")).toBe(true);
  });

  it("sin pendientes y con firma final llega a PAYROLL_READY", () => {
    const truthClean = deriveAttendanceTruth({
      assignments: [{ id: "a1", employee_id: "e1", status: "confirmed" }],
      entries: [{ id: "t1", employee_id: "e1", clock_in: "2026-08-10T16:05:00Z", clock_out: "2026-08-10T21:01:00Z" }],
      ...WINDOW,
    });
    const g = evaluateCloseoutGate({
      shiftId: "s1",
      truth: truthClean,
      closeout: {
        status: "reviewed",
        review_status: "approved",
        final_approval_status: "approved",
      } as never,
      shiftEnded: true,
      pendingHoursReview: 0,
    });
    expect(g.state).toBe("PAYROLL_READY");
  });
});

describe("P0-A · integridad del envío de fichaje", () => {
  it("bloquea doble submit", () => {
    const s1 = clockRequestReducer(initialClockRequestState, { type: "SUBMIT" });
    const s2 = clockRequestReducer(s1, { type: "SUBMIT" });
    expect(s2).toBe(s1);
    expect(isActionLocked(s2)).toBe(true);
  });

  it("un resultado ambiguo deja UNKNOWN y no re-habilita la acción", () => {
    const s = clockRequestReducer(
      clockRequestReducer(initialClockRequestState, { type: "SUBMIT" }),
      { type: "AMBIGUOUS", error: "Failed to fetch" },
    );
    expect(s.status).toBe("UNKNOWN");
    expect(isActionLocked(s)).toBe(true);
  });

  it("la verificación canónica resuelve el estado real", () => {
    const unknown = clockRequestReducer(initialClockRequestState, {
      type: "AMBIGUOUS",
      error: "timeout",
    });
    expect(clockRequestReducer(unknown, { type: "VERIFY_RESULT", persisted: true }).status).toBe("SUCCESS");
    expect(clockRequestReducer(unknown, { type: "VERIFY_RESULT", persisted: false }).status).toBe("FAILED");
  });

  it("clasifica fallos de red como ambiguos y errores de negocio como fallos", () => {
    expect(isAmbiguousFailure(new Error("Failed to fetch"))).toBe(true);
    expect(isAmbiguousFailure(new Error("Estás fuera del área de trabajo"))).toBe(false);
  });
});
