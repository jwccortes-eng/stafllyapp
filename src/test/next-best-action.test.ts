import { describe, it, expect } from "vitest";
import { selectNextBestAction, type NbaContext, type NbaShift } from "@/lib/portal/next-best-action";

const today = "2026-04-29";

function buildShift(overrides: Partial<NbaShift> = {}): NbaShift {
  return {
    id: "s1",
    title: "Banquet Server",
    date: today,
    start_time: "18:00:00",
    end_time: "23:00:00",
    status: "confirmed",
    client_name: "Chef Kaufman",
    location_name: "NYC Hotel",
    meeting_point: "Lobby",
    ...overrides,
  };
}

function ctx(overrides: Partial<NbaContext> = {}): NbaContext {
  return {
    clockStatus: { isClockedIn: false, shiftTitle: null },
    nextShift: null,
    pendingCount: 0,
    claimableCount: 0,
    readinessStatus: "ready",
    readinessMissingPersonal: 0,
    readinessMissingDocs: 0,
    now: new Date(`${today}T10:00:00`),
    ...overrides,
  };
}

describe("selectNextBestAction", () => {
  it("returns clocked_in when worker is on shift (highest priority)", () => {
    const r = selectNextBestAction(ctx({
      clockStatus: { isClockedIn: true, shiftTitle: "Banquet Server" },
      pendingCount: 5,
      readinessStatus: "pending_documents",
      readinessMissingDocs: 3,
    }));
    expect(r.kind).toBe("clocked_in");
    expect(r.tone).toBe("live");
    expect(r.ctaHref).toBe("/portal/clock");
  });

  it("surfaces stale open clocks as review instead of a live shift", () => {
    const r = selectNextBestAction(ctx({
      clockStatus: { isClockedIn: true, shiftTitle: "March shift" },
      clockStatusAgeHours: 72,
    }));
    expect(r.kind).toBe("clocked_in");
    expect(r.tone).toBe("warning");
    expect(r.title).toBe("Turno sin cerrar");
  });

  it("returns clock_in_now when confirmed shift today within window", () => {
    const r = selectNextBestAction(ctx({
      nextShift: buildShift({ start_time: "10:25:00" }), // 25 min away
      now: new Date(`${today}T10:00:00`),
    }));
    expect(r.kind).toBe("clock_in_now");
    expect(r.ctaHref).toContain("/portal/clock?shiftId=");
    expect(r.subtitle).toMatch(/Empieza en/);
  });

  it("returns confirm_shift when there are pending assignments", () => {
    const r = selectNextBestAction(ctx({
      pendingCount: 2,
      nextShift: buildShift({ status: "pending", start_time: "20:00:00" }),
    }));
    expect(r.kind).toBe("confirm_shift");
    expect(r.tone).toBe("warning");
  });

  it("prioritizes today's confirmed shift over missing documents", () => {
    const r = selectNextBestAction(ctx({
      nextShift: buildShift({ start_time: "20:00:00" }), // confirmed, later today, outside window
      readinessStatus: "pending_documents",
      readinessMissingDocs: 3,
    }));
    expect(r.kind).toBe("next_shift_today");
  });

  it("returns missing_docs when no shift today and docs pending", () => {
    const r = selectNextBestAction(ctx({
      readinessStatus: "pending_documents",
      readinessMissingDocs: 2,
    }));
    expect(r.kind).toBe("missing_docs");
    expect(r.ctaHref).toBe("/portal/documents");
  });

  it("returns missing_profile when personal info incomplete", () => {
    const r = selectNextBestAction(ctx({
      readinessStatus: "incomplete",
      readinessMissingPersonal: 4,
    }));
    expect(r.kind).toBe("missing_profile");
    expect(r.ctaHref).toBe("/portal/profile/complete");
  });

  it("returns next_shift_future when shift is tomorrow or later", () => {
    const r = selectNextBestAction(ctx({
      nextShift: buildShift({ date: "2026-05-02", start_time: "09:00:00" }),
    }));
    expect(r.kind).toBe("next_shift_future");
  });

  it("returns claim_available when claimables exist and nothing else urgent", () => {
    const r = selectNextBestAction(ctx({ claimableCount: 3 }));
    expect(r.kind).toBe("claim_available");
    expect(r.title).toMatch(/3 turnos disponibles/);
  });

  it("returns all_set when nothing is pending", () => {
    const r = selectNextBestAction(ctx());
    expect(r.kind).toBe("all_set");
    expect(r.tone).toBe("success");
    expect(r.ctaLabel).toBeNull();
  });

  it("clock_in_now wins over confirm_shift when both apply", () => {
    const r = selectNextBestAction(ctx({
      nextShift: buildShift({ start_time: "10:20:00" }),
      pendingCount: 1,
      now: new Date(`${today}T10:00:00`),
    }));
    expect(r.kind).toBe("clock_in_now");
  });

  it("respects custom clockInWindowMinutes", () => {
    const r = selectNextBestAction(ctx({
      nextShift: buildShift({ start_time: "10:45:00" }), // 45 min
      clockInWindowMinutes: 60,
      now: new Date(`${today}T10:00:00`),
    }));
    expect(r.kind).toBe("clock_in_now");
  });
});
