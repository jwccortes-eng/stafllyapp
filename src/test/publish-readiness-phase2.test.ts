import { describe, it, expect } from "vitest";
import {
  resolveDraftPublishReadiness,
  selectPublishableDrafts,
  type PublishCompanyRequirements,
} from "@/lib/shifts/publish-readiness";

const QUALITY: PublishCompanyRequirements = {
  requireClient: true,
  requireLocation: true,
  requireShiftAdmin: false,
  maxShiftHours: 16,
};

const base = {
  id: "s1",
  publication_status: "draft" as const,
  status: "draft",
  date: "2026-09-02",
  start_time: "09:00",
  end_time: "17:00",
  slots: 1,
  claimable: true,
  client_id: "c1",
};

describe("publish readiness · Phase 2 (company policy SSOT)", () => {
  it("QK-001608/QK-001607 · claimable sin lugar del servicio = BLOCKED", () => {
    const r = resolveDraftPublishReadiness(base, [], QUALITY);
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain("job_site");
  });

  it("claimable con dirección de texto libre y 0 asignaciones = READY (warning)", () => {
    const r = resolveDraftPublishReadiness(
      { ...base, job_site_address: "1200 Brickell Ave, Miami" },
      [],
      QUALITY,
    );
    expect(r.ready).toBe(true);
    expect(r.warnings).toContain("job_site_unsaved");
    expect(r.warnings).toContain("team_pending");
  });

  it("claimable con venue guardado = READY sin warning de dirección", () => {
    const r = resolveDraftPublishReadiness({ ...base, location_id: "loc1" }, [], QUALITY);
    expect(r.ready).toBe(true);
    expect(r.warnings).not.toContain("job_site_unsaved");
  });

  it("MyStaff · draft sin cliente con require_client = BLOCKED", () => {
    const r = resolveDraftPublishReadiness(
      { ...base, client_id: null, location_id: "loc1" },
      [],
      { requireClient: true, requireLocation: true },
    );
    expect(r.blockers).toContain("client");
    expect(r.ready).toBe(false);
  });

  it("JKitchen · sin requisitos de compañía = no regresión", () => {
    const r = resolveDraftPublishReadiness({ ...base, client_id: null }, [], {
      requireClient: false,
      requireLocation: false,
    });
    expect(r.ready).toBe(true);
  });

  it("direct staffing sin equipo = BLOCKED aunque cumpla la política", () => {
    const r = resolveDraftPublishReadiness(
      { ...base, claimable: false, location_id: "loc1" },
      [],
      QUALITY,
    );
    expect(r.blockers).toContain("assignments");
  });

  it("cancelled = NUNCA ready, incluso cumpliendo todo", () => {
    const r = resolveDraftPublishReadiness(
      { ...base, status: "cancelled", location_id: "loc1" },
      [],
      QUALITY,
    );
    expect(r.terminal).toBe(true);
    expect(r.ready).toBe(false);
  });

  it("shift admin y duración máxima se aplican por empresa", () => {
    const r = resolveDraftPublishReadiness(
      { ...base, location_id: "loc1", start_time: "06:00", end_time: "23:00" },
      [],
      { ...QUALITY, requireShiftAdmin: true, maxShiftHours: 16 },
    );
    expect(r.blockers).toContain("shift_admin");
    expect(r.blockers).toContain("duration");
  });

  it("transporte sin conductor = BLOCKED", () => {
    const r = resolveDraftPublishReadiness(
      { ...base, location_id: "loc1", transportation_required: true },
      [],
      QUALITY,
    );
    expect(r.blockers).toContain("driver");
  });

  it("bulk selecciona sólo READY bajo la política de la empresa", () => {
    const shifts = [
      { ...base, id: "ok", location_id: "loc1" },
      { ...base, id: "no-loc" },
      { ...base, id: "cancelled", status: "cancelled", location_id: "loc1" },
    ];
    const { ready, blocked } = selectPublishableDrafts(shifts, () => [], QUALITY);
    expect(ready.map((s) => s.id)).toEqual(["ok"]);
    expect(blocked.map((b) => b.shift.id).sort()).toEqual(["cancelled", "no-loc"]);
  });
});
