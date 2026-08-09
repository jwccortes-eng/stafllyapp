import { describe, it, expect } from "vitest";
import {
  needsProvisionalEnd,
  addHours,
  resolveProvisionalEnd,
  withProvisionalEnd,
  buildProvisionalTrace,
} from "@/lib/integrations/connecteam-provisional";
import { getServiceOperationalReadiness } from "@/lib/shifts/service-operational-readiness";

const imperial: any = {
  id: "s-1",
  date: "2026-08-30",
  title: "Imperial — Imperial",
  start_time: "17:00:00",
  end_time: "17:00:00",
  slots: null,
  notes: "Aug 30/31\n\n[Intake pendiente]\n- Hora de fin pendiente de confirmar\n- Cantidad de personal pendiente",
  shift_ref: "QK-001581",
};

describe("Connecteam provisional export completion", () => {
  it("detecta hora final pendiente (fin vacío, fin == inicio o marca de intake)", () => {
    expect(needsProvisionalEnd(imperial)).toBe(true);
    expect(needsProvisionalEnd({ start_time: "17:00", end_time: "", notes: "" } as any)).toBe(true);
    expect(needsProvisionalEnd({ start_time: "17:00", end_time: "23:00", notes: "" } as any)).toBe(false);
  });

  it("duración provisional de 6h sobre 17:00 produce 23:00", () => {
    expect(addHours("17:00", 6)).toBe("23:00");
    expect(resolveProvisionalEnd(imperial, { mode: "duration", durationHours: 6 })).toBe("23:00");
  });

  it("cruza medianoche sin romperse", () => {
    expect(addHours("22:00", 4)).toBe("02:00");
  });

  it("rechaza una hora final igual al inicio o una duración inválida", () => {
    expect(resolveProvisionalEnd(imperial, { mode: "end_time", endTime: "17:00" })).toBe("");
    expect(resolveProvisionalEnd(imperial, { mode: "duration", durationHours: 0 })).toBe("");
  });

  it("el override NO muta el Servicio canónico", () => {
    const copy = withProvisionalEnd(imperial, "23:00");
    expect(copy.end_time).toBe("23:00");
    expect(imperial.end_time).toBe("17:00:00");
  });

  it("la traza distingue dato canónico de dato provisional", () => {
    const t = buildProvisionalTrace({
      shift: imperial,
      ref: "QK-001581",
      provisionalEnd: "23:00",
      decision: { mode: "duration", durationHours: 6 },
      confirmedBy: "user-1",
      batchRef: "stafly-connecteam-shifts-2026-08-09.csv",
    });
    expect(t.ref).toBe("QK-001581");
    expect(t.canonicalEnd).toBe(""); // pendiente en Stafly
    expect(t.provisionalExportEnd).toBe("23:00");
    expect(t.provisional).toBe(true);
    expect(t.confirmedBy).toBe("user-1");
    expect(t.batchRef).toContain("connecteam");
  });

  it("los 9 Imperial resuelven las 9 horas finales provisionales", () => {
    const dates = ["08-30", "08-31", "09-01", "09-02", "09-03", "09-04", "09-05", "09-06", "09-07"];
    const ends = dates.map((d) =>
      resolveProvisionalEnd({ ...imperial, date: `2026-${d}` }, { mode: "duration", durationHours: 6 }),
    );
    expect(ends.filter((e) => e === "23:00")).toHaveLength(9);
  });

  it("personal pendiente (slots NULL) NO bloquea el export a Connecteam", () => {
    const r = getServiceOperationalReadiness({
      title: "Imperial",
      date: "2026-08-30",
      startTime: "17:00",
      endTime: "23:00",
      clientId: "c-1",
      locationId: "",
      jobSiteLocationId: null,
      jobSiteAddress: "Imperial",
      meetingPoint: "",
      meetingPointLocationId: null,
      transportRequired: false,
      assignedCount: 0,
      claimable: false,
      slots: 0,
      slotsPending: true,
      timezone: "America/New_York",
      connecteamJobLabel: "IMPERIAL HALL",
      addressLabel: "Imperial",
      publicationStatus: "draft",
    } as any);
    expect(r.readyToExportConnecteam).toBe(true);
    expect(r.exportBlockers.map((b) => b.code)).not.toContain("export.no_capacity");
    expect(r.warnings.map((w) => w.code)).toContain("export.headcount_pending");
  });

  it("sin hora final el blocker ofrece el CTA provisional", () => {
    const r = getServiceOperationalReadiness({
      title: "Imperial",
      date: "2026-08-30",
      startTime: "17:00",
      endTime: "",
      clientId: "c-1",
      locationId: "",
      jobSiteLocationId: null,
      jobSiteAddress: "Imperial",
      meetingPoint: "",
      meetingPointLocationId: null,
      transportRequired: false,
      assignedCount: 0,
      claimable: false,
      slots: 0,
      slotsPending: true,
      timezone: "America/New_York",
      connecteamJobLabel: "IMPERIAL HALL",
      addressLabel: "Imperial",
      publicationStatus: "draft",
    } as any);
    const b = r.exportBlockers.find((x) => x.code === "export.missing_end");
    expect(b?.action.label).toBe("Definir dato provisional para exportar");
  });
});
