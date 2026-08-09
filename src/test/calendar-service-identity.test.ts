import { describe, it, expect } from "vitest";
import {
  getCalendarServiceIdentity,
  summarizeConnecteamSelection,
  normalizeServiceState,
} from "@/lib/shifts/calendar-service-identity";

/** Draft real creado por Smart Intake (caso Imperial del video). */
const imperialDraft = {
  id: "s-1",
  title: "Imperial",
  date: "2026-08-30",
  start_time: "17:00",
  end_time: "17:00",
  slots: null,
  publication_status: "draft",
  shift_ref: "QK-001578",
  job_site_address: "Imperial",
  notes:
    "[Intake pendiente]\n- Venue detectado: Imperial — pendiente de vincular\n- Hora de fin pendiente de confirmar\n- Cantidad de personal pendiente",
  client_id: null,
  location_id: null,
};

const ctx = { assignedCount: 0 };

describe("getCalendarServiceIdentity — identidad de draft", () => {
  it("muestra QK, título y estado BORRADOR", () => {
    const i = getCalendarServiceIdentity(imperialDraft, ctx);
    expect(i.ref).toBe("QK-001578");
    expect(i.title).toBe("Imperial");
    expect(i.compactLabel).toBe("QK-001578 · Imperial");
    expect(i.service.isDraft).toBe(true);
    expect(i.service.label).toBe("BORRADOR");
  });

  it("no confunde draft con vacante: staffing pendiente nunca es 0", () => {
    const i = getCalendarServiceIdentity(imperialDraft, ctx);
    expect(i.staffing.pending).toBe(true);
    expect(i.staffing.slots).toBe(null);
    expect(i.staffing.label).toBe("Personal pendiente");
    expect(i.staffing.label).not.toContain("0/");
  });

  it("hora final pendiente no se inventa", () => {
    const i = getCalendarServiceIdentity(imperialDraft, ctx);
    expect(i.time.endMissing).toBe(true);
    expect(i.time.label).toContain("17:00");
  });

  it("readiness Connecteam se calcula individualmente y es explicable", () => {
    const i = getCalendarServiceIdentity(imperialDraft, ctx);
    expect(i.connecteam.ready).toBe(false);
    expect(i.connecteam.missingCount).toBeGreaterThan(0);
    expect(i.connecteam.label).toMatch(/^Faltan? \d+ dato/);
    for (const b of i.connecteam.blockers) {
      expect(b.reason.length).toBeGreaterThan(0);
      expect(b.action.anchorId).toBeTruthy();
    }
  });

  it("un draft completo sí queda listo para Connecteam", () => {
    const i = getCalendarServiceIdentity(
      {
        ...imperialDraft,
        end_time: "23:00",
        slots: 4,
        client_id: "client-1",
        notes: null,
      },
      { assignedCount: 2, clientName: "Imperial Events", locationName: "Imperial Ballroom", defaultTimezone: "America/New_York" },
    );
    expect(i.connecteam.ready).toBe(true);
    expect(i.staffing.label).toBe("2/4 · faltan 2");
  });

  it("servicio publicado no se etiqueta como borrador", () => {
    const i = getCalendarServiceIdentity(
      { ...imperialDraft, publication_status: "published" },
      ctx,
    );
    expect(i.service.isDraft).toBe(false);
    expect(i.service.label).toBe("Publicado");
  });

  it("turno histórico sin shift_ref no muestra UUID", () => {
    const i = getCalendarServiceIdentity(
      { ...imperialDraft, shift_ref: null, shift_code: null },
      ctx,
    );
    expect(i.ref).toBe(null);
    expect(i.refLabel).toBe("Sin referencia");
    expect(i.refLabel).not.toContain("s-1");
  });
});

describe("normalizeServiceState", () => {
  it("mapea alias y default", () => {
    expect(normalizeServiceState("canceled")).toBe("cancelled");
    expect(normalizeServiceState(null)).toBe("published");
    expect(normalizeServiceState("draft")).toBe("draft");
  });
});

describe("summarizeConnecteamSelection", () => {
  it("los incompletos no bloquean a los listos", () => {
    const ready = getCalendarServiceIdentity(
      { ...imperialDraft, end_time: "23:00", slots: 4, client_id: "c1", notes: null },
      { assignedCount: 1, clientName: "Imperial Events", defaultTimezone: "America/New_York" },
    );
    const pending = getCalendarServiceIdentity(imperialDraft, ctx);
    const s = summarizeConnecteamSelection([ready, ready, pending, pending, pending, pending]);
    expect(s.total).toBe(6);
    expect(s.ready).toBe(2);
    expect(s.pending).toBe(4);
    expect(s.exportLabel).toBe("Exportar 2 listos");
    expect(s.reviewLabel).toBe("Revisar 4 pendientes");
  });
});

describe("caso real Imperial — 9 fechas", () => {
  const dates = [
    "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
    "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07",
  ];
  it("cada draft tiene QK único, es BORRADOR y readiness propio", () => {
    const items = dates.map((date, idx) =>
      getCalendarServiceIdentity(
        { ...imperialDraft, id: `s-${idx}`, date, shift_ref: `QK-00157${idx}` },
        ctx,
      ),
    );
    expect(new Set(items.map((i) => i.ref)).size).toBe(9);
    expect(items.every((i) => i.service.isDraft)).toBe(true);
    expect(items.every((i) => i.staffing.pending)).toBe(true);
    expect(items.every((i) => !i.connecteam.ready)).toBe(true);
  });
});
