import { describe, it, expect } from "vitest";
import { getServiceOperationalReadiness } from "@/lib/shifts/service-operational-readiness";

const base = {
  title: "Luminance",
  date: "2026-08-18",
  startTime: "00:08",
  endTime: "08:00",
  clientId: "client-1",
  locationId: "",
  jobSiteLocationId: null,
  jobSiteAddress: "1601 Broadway, New York, NY",
  meetingPoint: "",
  meetingPointLocationId: null,
  transportRequired: false,
  assignedCount: 1,
  claimable: false,
  slots: 1,
  timezone: "America/New_York",
  connecteamJobLabel: "Luminance Events",
  addressLabel: "1601 Broadway, New York, NY",
  publicationStatus: "published",
};

describe("getServiceOperationalReadiness", () => {
  it("marca listo para publicar y exportar cuando no falta nada", () => {
    const r = getServiceOperationalReadiness(base as any);
    expect(r.readyToPublish).toBe(true);
    expect(r.readyToExportConnecteam).toBe(true);
  });

  it("separa publicar de exportar: borrador publica pero no exporta", () => {
    const r = getServiceOperationalReadiness({ ...base, publicationStatus: "draft" } as any);
    expect(r.readyToPublish).toBe(true);
    expect(r.readyToExportConnecteam).toBe(false);
    expect(r.exportBlockers.map((b) => b.code)).toContain("export.not_published");
  });

  it("bloquea publicación y export cuando falta el lugar del servicio", () => {
    const r = getServiceOperationalReadiness({
      ...base,
      jobSiteAddress: "",
      addressLabel: null,
    } as any);
    expect(r.readyToPublish).toBe(false);
    expect(r.readyToExportConnecteam).toBe(false);
    const jobSite = r.blockers.find((b) => b.code === "publish.job_site");
    expect(jobSite?.scope).toBe("both");
    expect(jobSite?.action.label.length).toBeGreaterThan(0);
  });

  it("exige contexto de Job para Connecteam sin bloquear la publicación", () => {
    const r = getServiceOperationalReadiness({
      ...base,
      connecteamJobLabel: null,
    } as any);
    expect(r.readyToPublish).toBe(true);
    expect(r.exportBlockers.map((b) => b.code)).toContain("export.missing_job_context");
  });

  it("nunca produce mensajes genéricos", () => {
    const r = getServiceOperationalReadiness({
      ...base,
      title: "",
      jobSiteAddress: "",
      addressLabel: null,
      connecteamJobLabel: null,
    } as any);
    for (const b of r.blockers) {
      expect(b.reason).not.toMatch(/^Falta información/);
      expect(b.field).toBeTruthy();
      expect(b.action.anchorId).toBeTruthy();
    }
  });
});
