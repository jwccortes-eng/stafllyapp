import { describe, it, expect } from "vitest";
import {
  resolveDraftPublishReadiness,
  selectPublishableDrafts,
} from "@/lib/shifts/publish-readiness";

const draft = {
  id: "s1",
  publication_status: "draft" as const,
  status: "draft",
  date: "2026-08-20",
  start_time: "09:00",
  end_time: "17:00",
  slots: 4,
  claimable: false,
};
const active = { status: "assigned", response_status: "pending" };

describe("publish readiness · Phase 1", () => {
  it("A · direct staffing sin asignaciones = BLOCKED", () => {
    const r = resolveDraftPublishReadiness(draft, []);
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain("assignments");
    expect(r.staffingMode).toBe("direct");
  });

  it("B · direct staffing con una asignación activa = READY", () => {
    expect(resolveDraftPublishReadiness(draft, [active]).ready).toBe(true);
  });

  it("C · claimable con 0 asignaciones y plazas > 0 = READY", () => {
    const r = resolveDraftPublishReadiness({ ...draft, claimable: true }, []);
    expect(r.ready).toBe(true);
    expect(r.staffingMode).toBe("claim");
    expect(r.openSlots).toBe(4);
  });

  it("C.1 · claimable sin plazas = BLOCKED por capacidad", () => {
    const r = resolveDraftPublishReadiness({ ...draft, claimable: true, slots: 0 }, []);
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain("capacity");
  });

  it("D · claimable parcialmente cubierto publica y reporta cobertura", () => {
    const r = resolveDraftPublishReadiness({ ...draft, claimable: true }, [active, active]);
    expect(r.ready).toBe(true);
    expect(r.assignedCount).toBe(2);
    expect(r.openSlots).toBe(2);
  });

  it("E · cancelado es terminal aunque siga en publication_status=draft", () => {
    const r = resolveDraftPublishReadiness({ ...draft, status: "cancelled" }, [active]);
    expect(r.ready).toBe(false);
    expect(r.terminal).toBe(true);
    expect(r.blockers).toEqual(["cancelled"]);
  });

  it("F · bulk solo intenta los READY", () => {
    const shifts = [
      { ...draft, id: "ready-direct" },
      { ...draft, id: "ready-claim", claimable: true },
      { ...draft, id: "blocked-direct" },
      { ...draft, id: "cancelled", status: "cancelled" },
      { ...draft, id: "already-published", publication_status: "published" as const },
      { ...draft, id: "locked", status: "locked" },
    ];
    const byShift = (id: string) => (id === "ready-direct" ? [active] : []);
    const { ready, blocked } = selectPublishableDrafts(shifts, byShift);
    expect(ready.map((s) => s.id)).toEqual(["ready-direct", "ready-claim"]);
    expect(blocked.map((b) => b.shift.id)).toEqual(["blocked-direct", "cancelled"]);
  });

  it("faltantes de fecha y horario siguen bloqueando en ambos modos", () => {
    const r = resolveDraftPublishReadiness(
      { ...draft, claimable: true, date: "", start_time: "", end_time: "" },
      [],
    );
    expect(r.blockers).toEqual(["date", "start_time", "end_time"]);
  });
});
