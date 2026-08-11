/**
 * P0 — STAFLY RELIABLE TIME CLOCK.
 *
 * Cubre lo que no puede fallar: idempotencia, estado canónico con eventos
 * pendientes, drift temporal sin corrección silenciosa y bloqueo de cierre.
 */
import { describe, it, expect } from "vitest";
import { resolveClockStatus, elapsedSeconds } from "@/lib/timeclock/clock-status";
import { evaluateDrift } from "@/lib/timeclock/clock-sync";
import { createClientEventId } from "@/lib/timeclock/offline-clock-types";
import { deriveAttendanceTruth } from "@/lib/shifts/attendance-truth";
import { evaluateCloseoutGate } from "@/lib/shifts/closeout-gate";

const pendingIn = (overrides: Record<string, unknown> = {}) =>
  ({
    client_event_id: "evt-1",
    type: "CLOCK_IN",
    employee_id: "emp-1",
    company_id: "co-1",
    shift_id: "sh-1",
    assignment_id: null,
    time_entry_id: null,
    closes_client_event_id: null,
    event_time_device: "2026-01-10T08:00:00.000Z",
    timezone: "America/Bogota",
    device_id: "dev-1",
    gps: null,
    within_geofence: null,
    photo_url: null,
    offline: true,
    status: "PENDING_SYNC",
    attempts: 0,
    created_at: "2026-01-10T08:00:00.000Z",
    ...overrides,
  }) as never;

describe("idempotencia", () => {
  it("genera client_event_id únicos", () => {
    const ids = new Set(Array.from({ length: 500 }, () => createClientEventId()));
    expect(ids.size).toBe(500);
  });
});

describe("estado canónico del reloj", () => {
  it("marca entrada pendiente de sincronizar cuando no hay evidencia en servidor", () => {
    const r = resolveClockStatus({ shiftId: "sh-1", entries: [], pending: [pendingIn()] });
    expect(r.status).toBe("CLOCK_IN_PENDING_SYNC");
    expect(r.pending?.client_event_id).toBe("evt-1");
  });

  it("el contador arranca en la hora del dispositivo, no en el montaje del componente", () => {
    const r = resolveClockStatus({ shiftId: "sh-1", entries: [], pending: [pendingIn()] });
    const secs = elapsedSeconds(r, new Date("2026-01-10T09:00:00.000Z"));
    expect(secs).toBe(3600);
  });

  it("el servidor gana cuando el evento ya fue sincronizado", () => {
    const r = resolveClockStatus({
      shiftId: "sh-1",
      entries: [
        {
          id: "te-1",
          shift_id: "sh-1",
          clock_in: "2026-01-10T08:00:00.000Z",
          clock_out: "2026-01-10T16:00:00.000Z",
          requires_time_review: false,
        },
      ],
      pending: [],
    });
    expect(r.status).toBe("COMPLETED");
  });
});

describe("integridad temporal", () => {
  it("una sincronización tardía conserva la hora del dispositivo sin marcar revisión", () => {
    const d = evaluateDrift("2026-01-10T08:00:00.000Z", new Date("2026-01-10T09:00:00.000Z"));
    expect(d.syncDelaySeconds).toBe(3600);
    expect(d.requiresReview).toBe(false);
  });

  it("no corrige en silencio: marca revisión si el reloj del dispositivo va adelantado", () => {
    const d = evaluateDrift("2026-01-10T09:00:00.000Z", new Date("2026-01-10T08:00:00.000Z"));
    expect(d.requiresReview).toBe(true);
    expect(d.reviewReason).toBeTruthy();
  });
});

describe("puerta de cierre", () => {
  it("bloquea la reconciliación si hay fichajes que exigen revisión horaria", () => {
    const truth = deriveAttendanceTruth({
      assignments: [{ id: "a1", employee_id: "emp-1", status: "confirmed" }],
      entries: [
        {
          id: "te-1",
          employee_id: "emp-1",
          clock_in: "2026-01-10T08:00:00.000Z",
          clock_out: "2026-01-10T16:00:00.000Z",
          requires_time_review: true,
          captured_offline: true,
        },
      ],
      windowStartsAt: "2026-01-10T08:00:00.000Z",
      windowEndsAt: "2026-01-10T16:00:00.000Z",
      now: new Date("2026-01-10T18:00:00.000Z"),
    });
    expect(truth.counts.reviewRequired).toBe(1);

    const gate = evaluateCloseoutGate({
      shiftId: "sh-1",
      truth,
      closeout: null,
      shiftEnded: true,
    });
    expect(gate.canFullyReconcile).toBe(false);
    expect(gate.blockers.some((b) => b.id === "time-review-required")).toBe(true);
  });
});
