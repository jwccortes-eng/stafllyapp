/**
 * P0 — Smart Intake Multi-Date Expansion.
 *
 * Regresión del caso real: un encabezado de venue seguido de dos listas de
 * días (con cambio de mes) debe detectar un servicio real por día, heredando
 * el contexto común, sin inventar hora final ni cantidad de personal.
 */
import { describe, expect, it } from "vitest";
import { parseTextToCandidates } from "@/lib/intake/text-parser";
import { expandDateList } from "@/lib/intake/date-expansion";
import {
  canCreateDraft,
  getCandidateReadiness,
  recomputeCandidate,
} from "@/lib/intake/candidate";
import { confirmRef } from "@/lib/intake/entity-resolution";
import { buildDraftPayload } from "@/lib/intake/create-draft-service";

const REF = "2026-08-09";
const ctx = { companyId: "c1", referenceDate: REF } as const;

const REAL_INPUT = `Imperial
Aug 30/31
Sep 1/2/3/4/5/6/7
sin hora definida pero aprox 5pm
cantidad de meseros pendientes`;

const EXPECTED = [
  "2026-08-30", "2026-08-31",
  "2026-09-01", "2026-09-02", "2026-09-03",
  "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07",
];

describe("expandDateList", () => {
  it("expande una lista con /", () => {
    expect(expandDateList("Sep 1/2/3/4/5/6/7", REF).dates.map((d) => d.iso)).toEqual([
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
      "2026-09-05", "2026-09-06", "2026-09-07",
    ]);
  });

  it("expande dos meses en la misma línea", () => {
    expect(expandDateList("Aug 30/31/ Sep 1/2/3", REF).dates.map((d) => d.iso)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
    ]);
  });

  it("expande listas con coma", () => {
    expect(expandDateList("Aug 30, 31", REF).dates).toHaveLength(2);
  });

  it("expande rangos explícitos", () => {
    expect(expandDateList("Sep 1-7", REF).dates.map((d) => d.iso)).toEqual([
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
      "2026-09-05", "2026-09-06", "2026-09-07",
    ]);
  });

  it("no confunde una hora con un día", () => {
    expect(expandDateList("aprox 5pm", REF).dates).toHaveLength(0);
  });

  it("descarta un día inexistente en vez de corregirlo", () => {
    const out = expandDateList("Feb 30", REF);
    expect(out.dates).toHaveLength(0);
    expect(out.invalid.length).toBeGreaterThan(0);
  });

  it("marca el año como inferido cuando la fuente no lo dice", () => {
    expect(expandDateList("Sep 1", REF).dates[0].yearInferred).toBe(true);
    expect(expandDateList("Sep 1 2027", REF).dates[0].yearInferred).toBe(false);
  });
});

describe("caso real Imperial", () => {
  const res = parseTextToCandidates(REAL_INPUT, ctx);

  it("detecta exactamente los 9 servicios reales con sus 9 fechas", () => {
    expect(res.candidates).toHaveLength(9);
    expect(res.candidates.map((c) => c.serviceDate)).toEqual(EXPECTED);
  });

  it("los 9 heredan Imperial", () => {
    expect(res.candidates.every((c) => /imperial/i.test(c.venueCandidate.raw))).toBe(true);
  });

  it("la hora es sugerida y aproximada, sin hora final inventada", () => {
    for (const c of res.candidates) {
      expect(c.startTime).toBe("17:00");
      expect(c.endTime).toBeNull();
      expect(c.confidenceByField.start_time).toBeLessThanOrEqual(0.6);
    }
    expect(res.notices.some((n) => n.kind === "approximate_time")).toBe(true);
  });

  it("el personal queda pendiente, nunca 0", () => {
    expect(res.candidates.every((c) => c.requestedWorkers === null)).toBe(true);
    expect(res.notices.some((n) => n.kind === "pending_workers")).toBe(true);
  });

  it("propone el rol server sin inventar cantidad", () => {
    expect(res.candidates[0].roleCandidates).toContain("server");
  });

  it("no crea nada: todos siguen en revisión", () => {
    expect(res.candidates.every((c) => c.createdShiftId === null)).toBe(true);
  });

  it("reintentar reconoce exactamente los mismos 9 servicios, sin duplicados", () => {
    const again = parseTextToCandidates(REAL_INPUT, ctx);
    expect(again.candidates.map((c) => c.serviceDate)).toEqual(EXPECTED);
    expect(new Set(again.candidates.map((c) => c.serviceDate)).size).toBe(9);
  });
});

describe("variantes de escritura", () => {
  it("Aug 30/31/ Sep 1/2/3 en una línea", () => {
    const res = parseTextToCandidates("Imperial\nAug 30/31/ Sep 1/2/3", ctx);
    expect(res.candidates.map((c) => c.serviceDate)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
    ]);
  });

  it("con comas produce el mismo resultado", () => {
    const res = parseTextToCandidates("Imperial\nAug 30, 31\nSep 1, 2, 3", ctx);
    expect(res.candidates.map((c) => c.serviceDate)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
    ]);
  });

  it("con rangos produce el mismo resultado", () => {
    const res = parseTextToCandidates("Imperial\nAug 30-31\nSep 1-7", ctx);
    expect(res.candidates).toHaveLength(9);
    expect(res.candidates.map((c) => c.serviceDate)).toEqual(EXPECTED);
  });

  it("dos venues no se mezclan las fechas", () => {
    const res = parseTextToCandidates("Imperial\nAug 30/31\nMillennium\nSep 1/2", ctx);
    const imperial = res.candidates.filter((c) => /imperial/i.test(c.venueCandidate.raw));
    const millennium = res.candidates.filter((c) => /millennium/i.test(c.venueCandidate.raw));
    expect(imperial.map((c) => c.serviceDate)).toEqual(["2026-08-30", "2026-08-31"]);
    expect(millennium.map((c) => c.serviceDate)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("el contexto común no salta al bloque equivocado", () => {
    const res = parseTextToCandidates(
      "Imperial\nAug 30/31\naprox 5pm\nMillennium\nSep 1/2",
      ctx,
    );
    const imperial = res.candidates.filter((c) => /imperial/i.test(c.venueCandidate.raw));
    const millennium = res.candidates.filter((c) => /millennium/i.test(c.venueCandidate.raw));
    expect(imperial.every((c) => c.startTime === "17:00")).toBe(true);
    expect(millennium.every((c) => c.startTime === null)).toBe(true);
  });
});

/**
 * P0 — Creación de borradores con entidades pendientes.
 *
 * Los 9 trabajos reales deben poder guardarse como `scheduled_shifts` draft
 * aunque Imperial siga sin vincularse y falten hora final y personal.
 */
describe("READY_TO_CREATE_DRAFT con entidades pendientes", () => {
  const { candidates } = parseTextToCandidates(REAL_INPUT, ctx);

  it("los 9 servicios son creables como borrador", () => {
    expect(candidates).toHaveLength(9);
    expect(candidates.filter((c) => canCreateDraft(c).ok)).toHaveLength(9);
  });

  it("ninguno está listo para publicar ni exportar a Connecteam", () => {
    for (const c of candidates) {
      const r = getCandidateReadiness(c);
      expect(r.readyToCreateDraft).toBe(true);
      expect(r.publishGaps.length).toBeGreaterThan(0);
      expect(r.exportGaps.length).toBeGreaterThan(0);
      expect(r.pendingEntities).toContain("Imperial");
    }
  });

  it("el payload preserva lo detectado y no inventa personal", () => {
    const payload = buildDraftPayload(candidates[0], { companyId: "c1", userId: "u1" });
    expect(payload.publication_status).toBe("draft");
    expect(payload.date).toBe("2026-08-30");
    expect(payload.start_time).toBe("17:00");
    expect(payload.slots).toBeNull();
    expect(payload.client_id).toBeNull();
    expect(payload.location_id).toBeNull();
    expect(String(payload.title)).toContain("Imperial");
    expect(String(payload.notes)).toContain("pendiente de vincular");
    expect(String(payload.notes)).toContain("Cantidad de personal pendiente");
  });

  it("completar un servicio no afecta a los otros ocho", () => {
    const completed = recomputeCandidate({
      ...candidates[0],
      endTime: "23:00",
      requestedWorkers: 6,
      clientCandidate: confirmRef(candidates[0].clientCandidate, "client-1", "Imperial"),
      locationCandidate: confirmRef(candidates[0].locationCandidate, "loc-1", "Imperial"),
      venueCandidate: confirmRef(candidates[0].venueCandidate, "loc-1", "Imperial"),
    });
    expect(getCandidateReadiness(completed).exportGaps).toHaveLength(0);
    expect(getCandidateReadiness(candidates[1]).exportGaps.length).toBeGreaterThan(0);
  });
});
