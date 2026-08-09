import { describe, it, expect } from "vitest";
import { getServiceLifecycleReadiness } from "@/lib/shifts/service-lifecycle-readiness";

/** Caso real: Imperial, Aug 30, 5 PM aprox., personal pendiente. */
const imperialDraft = {
  title: "Imperial",
  referenceLabel: "QK-001601",
  companyId: "company-1",
  originTrace: "smart_intake",
  date: "2026-08-30",
  startTime: "17:00",
  endTime: "",
  approxStart: true,
  staffingPending: true,
  clientId: "",
  locationId: "",
  jobSiteLocationId: null,
  jobSiteAddress: "",
  meetingPoint: "",
  meetingPointLocationId: null,
  transportRequired: false,
  assignedCount: 0,
  claimable: false,
  slots: 0,
  timezone: "America/New_York",
  connecteamJobLabel: "Imperial",
  addressLabel: null,
  publicationStatus: "draft",
};

const completeService = {
  ...imperialDraft,
  approxStart: false,
  staffingPending: false,
  endTime: "23:00",
  clientId: "client-1",
  jobSiteAddress: "1601 Broadway, New York, NY",
  addressLabel: "1601 Broadway, New York, NY",
  assignedCount: 2,
  slots: 4,
};

describe("getServiceLifecycleReadiness", () => {
  it("A. draft mínimo: fecha + referencia + empresa bastan para registrar", () => {
    const r = getServiceLifecycleReadiness(imperialDraft as any);
    expect(r.readyToCreateDraft).toBe(true);
    expect(r.gates.create_draft.blockers).toHaveLength(0);
  });

  it("B/C/D. draft con hora aproximada, sin workers y sin venue sigue siendo válido", () => {
    const r = getServiceLifecycleReadiness(imperialDraft as any);
    expect(r.readyToCreateDraft).toBe(true);
    expect(r.readyToStaff).toBe(false);
    expect(r.readyToPublish).toBe(false);
  });

  it("F. no listo para staffing explica lugar y cantidad de personal pendiente", () => {
    const r = getServiceLifecycleReadiness(imperialDraft as any);
    const codes = r.gates.staff.blockers.map((b) => b.code);
    expect(codes).toContain("staff.missing_job_site");
    expect(codes).toContain("staff.pending_headcount");
    expect(r.gates.staff.cta?.label).toBe("Completar para staffing");
  });

  it("E. con lugar y cantidad definidos ya se puede hacer staffing sin publicar", () => {
    const r = getServiceLifecycleReadiness({
      ...imperialDraft,
      staffingPending: false,
      slots: 6,
      jobSiteAddress: "1601 Broadway, New York, NY",
    } as any);
    expect(r.readyToStaff).toBe(true);
    expect(r.readyToPublish).toBe(false);
  });

  it("H. Connecteam exige hora de fin: es evidencia del importador real", () => {
    const r = getServiceLifecycleReadiness(imperialDraft as any);
    expect(r.readyToExportConnecteam).toBe(false);
    expect(r.gates.export_connecteam.blockers.map((b) => b.code)).toContain(
      "export.missing_end",
    );
  });

  it("bloquea Connecteam cuando inicio y fin son la misma hora", () => {
    const r = getServiceLifecycleReadiness({
      ...completeService,
      endTime: "17:00",
    } as any);
    expect(r.gates.export_connecteam.blockers.map((b) => b.code)).toContain(
      "export.zero_duration",
    );
  });

  it("G. un borrador completo es exportable aunque no esté publicado", () => {
    const r = getServiceLifecycleReadiness({
      ...completeService,
      publicationStatus: "draft",
    } as any);
    expect(r.readyToExportConnecteam).toBe(true);
    expect(r.readyToPublish).toBe(true);
  });

  it("las compuertas son independientes entre sí", () => {
    const r = getServiceLifecycleReadiness(imperialDraft as any);
    expect(r.readyToCreateDraft).toBe(true);
    expect(r.readyToStaff).toBe(false);
    expect(r.readyToExportConnecteam).toBe(false);
    expect(r.readyToPublish).toBe(false);
    expect(r.readyToClose).toBe(false);
  });

  it("cada blocker explica qué falta para ESA acción, sin mensajes internos", () => {
    const r = getServiceLifecycleReadiness(imperialDraft as any);
    for (const g of r.ordered) {
      for (const b of g.blockers) {
        expect(b.reason.length).toBeGreaterThan(10);
        expect(b.reason).not.toMatch(/invalid|conflict|pending new entity|not exportable/i);
        expect(b.action.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("sin fecha no se puede ni registrar el borrador", () => {
    const r = getServiceLifecycleReadiness({ ...imperialDraft, date: "" } as any);
    expect(r.readyToCreateDraft).toBe(false);
    expect(r.gates.create_draft.blockers.map((b) => b.code)).toContain("draft.missing_date");
  });

  it("K/J. mezcla de estados en la semana: cada servicio se evalúa por separado", () => {
    const week = [imperialDraft, completeService, { ...completeService, endTime: "" }].map(
      (s) => getServiceLifecycleReadiness(s as any),
    );
    expect(week.filter((r) => r.readyToExportConnecteam)).toHaveLength(1);
    expect(week.filter((r) => r.readyToCreateDraft)).toHaveLength(3);
  });
});
