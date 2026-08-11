import { describe, it, expect } from "vitest";
import { resolveShiftLocationTruth } from "@/lib/shifts/service-location";
import { computeShiftPendingFlags } from "@/lib/shifts/pending-flags";
import { getShiftMissingItems } from "@/lib/shifts/shift-operations-intelligence";

/**
 * P0 — SERVICE LOCATION SINGLE SOURCE OF TRUTH
 * QA canónico con el Turno 427 (aa4ad840-…): dirección libre, sin FK,
 * transportation_required = false.
 */
const turno427 = {
  location_id: null,
  job_site_location_id: null,
  job_site_address: "3514 West 89th Street, Cleveland, OH",
  meeting_point: null,
  meeting_point_location_id: null,
  transportation_required: false,
};

describe("Service Location SSOT · Turno 427", () => {
  it("una dirección libre ES un destino resuelto", () => {
    const t = resolveShiftLocationTruth(turno427);
    expect(t.destinationStatus).toBe("RESOLVED");
    expect(t.destinationSource).toBe("free_text");
    expect(t.displayAddress).toContain("3514 West 89th Street");
  });

  it("sin coordenadas el readiness geoespacial es ADDRESS_ONLY y el mapa no está listo", () => {
    const t = resolveShiftLocationTruth(turno427);
    expect(t.geospatialStatus).toBe("ADDRESS_ONLY");
    expect(t.hasCoordinates).toBe(false);
    expect(t.mapReady).toBe(false);
    expect(t.geospatialHint).toBeTruthy();
  });

  it("sin transporte nunca falta punto de encuentro", () => {
    const t = resolveShiftLocationTruth(turno427);
    expect(t.meetingPointRequired).toBe(false);
    expect(t.meetingPointStatus).toBe("NOT_REQUIRED");
    expect(t.meetingPointMissing).toBe(false);
  });

  it("no emite alerta de 'falta ubicación' ni de 'sin punto de encuentro'", () => {
    const items = getShiftMissingItems(
      {
        id: "aa4ad840",
        status: "published",
        publication_status: "published",
        date: "2026-01-10",
        start_time: "08:00:00",
        end_time: "16:00:00",
        slots: 1,
        client_id: "c1",
        special_instructions: "x",
        shift_admin_id: "e1",
        ...turno427,
      },
      [{ id: "a1", employee_id: "e1", status: "confirmed", assignment_role: "staff" }],
    );
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain("job_site");
    expect(keys).not.toContain("meeting_point");
    expect(keys).toContain("job_site_coordinates");
  });

  it("el editor marca la dirección como no guardada, no como faltante", () => {
    const r = computeShiftPendingFlags({
      date: "2026-01-10",
      startTime: "08:00",
      endTime: "16:00",
      clientId: "c1",
      locationId: "",
      jobSiteLocationId: null,
      jobSiteAddress: turno427.job_site_address,
      meetingPoint: "",
      meetingPointLocationId: null,
      transportRequired: false,
      claimable: false,
      assignedCount: 1,
    });
    const keys = r.flags.map((f) => f.key);
    expect(keys).not.toContain("jobsite_missing");
    expect(keys).not.toContain("meeting_missing");
    expect(keys).toContain("jobsite_unsaved");
  });

  it("con transporte activo sí exige punto de encuentro", () => {
    const t = resolveShiftLocationTruth({ ...turno427, transportation_required: true });
    expect(t.meetingPointRequired).toBe(true);
    expect(t.meetingPointMissing).toBe(true);
  });

  it("una FK estructurada gana sobre el texto libre", () => {
    const t = resolveShiftLocationTruth({
      ...turno427,
      job_site_location_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(t.destinationSource).toBe("job_site_v2");
  });
});
