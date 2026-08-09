/**
 * Smart Service Intake — Fase 3: extracción visual.
 *
 * Cubre los criterios de aceptación del sprint sobre el módulo PURO
 * (`visual-extraction`), sin tocar la base de datos ni el extractor IA.
 */

import { describe, expect, it } from "vitest";
import {
  confidenceLevel,
  dedupeAcrossPages,
  hasMinimumEvidence,
  normalizeVisualExtraction,
  normalizeVisualTime,
  resolveVisualDate,
  type RawVisualExtraction,
} from "@/lib/intake/visual-extraction";
import { canCreateDraft, getCandidateReadiness } from "@/lib/intake/candidate";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER_COMPANY = "22222222-2222-2222-2222-222222222222";
const REF = "2026-10-01";

function run(extraction: RawVisualExtraction, companyId = COMPANY, fileName = "calendario.png") {
  return normalizeVisualExtraction({
    extraction,
    companyId,
    batchId: "batch-1",
    source: "image",
    referenceDate: REF,
    fileName,
  });
}

const CALENDAR_CELL = {
  service_date: "Oct 13",
  start_time: null,
  end_time: null,
  service_type: "Bar Mitzvah",
  client_name: null,
  venue_name: "Millennium",
  location_text: null,
  requested_workers: null,
  roles: null,
  notes: null,
  source_excerpt: "OCTOBER 13 Millennium Bar Mitzvah",
  page_number: 1,
  region_label: "semana 2, martes",
  color_group: "amarillo",
  extraction_notes: null,
  confidence: { date: 0.95, venue: 0.92, service_type: 0.9 },
};

describe("resolveVisualDate", () => {
  it("acepta ISO tal cual", () => {
    expect(resolveVisualDate("2026-10-13", REF)).toEqual({ date: "2026-10-13", assumedYear: false });
  });

  it("resuelve mes+día sin año hacia el futuro cercano", () => {
    expect(resolveVisualDate("Oct 13", REF)).toEqual({ date: "2026-10-13", assumedYear: true });
    expect(resolveVisualDate("10/13", REF).date).toBe("2026-10-13");
  });

  it("no inventa fecha cuando falta día o mes", () => {
    expect(resolveVisualDate("October", REF).date).toBeNull();
    expect(resolveVisualDate("", REF).date).toBeNull();
    expect(resolveVisualDate("13", REF).date).toBeNull();
  });

  it("rechaza fechas imposibles", () => {
    expect(resolveVisualDate("2026-02-30", REF).date).toBeNull();
  });
});

describe("normalizeVisualTime", () => {
  it("normaliza 24h y am/pm", () => {
    expect(normalizeVisualTime("9:30")).toBe("09:30");
    expect(normalizeVisualTime("7pm")).toBe("19:00");
    expect(normalizeVisualTime("12:15 am")).toBe("00:15");
  });

  it("nunca inventa una hora ilegible", () => {
    expect(normalizeVisualTime("tarde")).toBeNull();
    expect(normalizeVisualTime("")).toBeNull();
    expect(normalizeVisualTime("25:00")).toBeNull();
  });
});

describe("confidenceLevel", () => {
  it("mapea a HIGH/MEDIUM/LOW/MISSING", () => {
    expect(confidenceLevel(0.95)).toBe("HIGH");
    expect(confidenceLevel(0.7)).toBe("MEDIUM");
    expect(confidenceLevel(0.3)).toBe("LOW");
    expect(confidenceLevel(null)).toBe("MISSING");
    expect(confidenceLevel(0)).toBe("MISSING");
  });
});

describe("A. captura de calendario: una celda = un candidato", () => {
  const res = run({ services: [CALENDAR_CELL], unresolved: [], page_count: 1 });

  it("agrupa los cuatro fragmentos visuales en un solo servicio", () => {
    expect(res.candidates).toHaveLength(1);
    const c = res.candidates[0];
    expect(c.serviceDate).toBe("2026-10-13");
    expect(c.venueCandidate.raw).toBe("Millennium");
    expect(c.serviceType).toBe("Bar Mitzvah");
  });

  it("no inventa hora ni personal", () => {
    const c = res.candidates[0];
    expect(c.startTime).toBeNull();
    expect(c.endTime).toBeNull();
    expect(c.requestedWorkers).toBeNull();
  });

  it("expone confianza por campo, no sólo global", () => {
    const levels = res.meta[res.candidates[0].id].levels;
    expect(levels.date).toBe("HIGH");
    expect(levels.venue).toBe("HIGH");
    expect(levels.service_type).toBe("HIGH");
    expect(levels.start_time).toBe("MISSING");
    expect(levels.workers).toBe("MISSING");
  });

  it("permite el borrador y deja la hora como pendiente de publicación", () => {
    expect(canCreateDraft(res.candidates[0]).ok).toBe(true);
    expect(res.candidates[0].missingFields).toContain("start_time");
    expect(getCandidateReadiness(res.candidates[0]).publishGaps).toContain("start_time");
  });

  it("avisa que el color no define identidad", () => {
    const messages = res.notices.map((n) => n.message).join(" ");
    expect(messages).toMatch(/color no define el lugar/i);
  });
});

describe("B/F. multi-servicio y dos venues en una imagen", () => {
  const res = run({
    services: [
      CALENDAR_CELL,
      { ...CALENDAR_CELL, service_date: "Oct 14", venue_name: "Zemer", service_type: "Sheva Brochos" },
      { ...CALENDAR_CELL, service_date: "Oct 15", venue_name: "Eminence Hall", service_type: "Wedding" },
    ],
    unresolved: [],
    page_count: 1,
  });

  it("produce N candidatos, no sólo el primero", () => {
    expect(res.candidates).toHaveLength(3);
    expect(res.candidates.map((c) => c.venueCandidate.raw)).toEqual([
      "Millennium",
      "Zemer",
      "Eminence Hall",
    ]);
  });

  it("conserva batch, referencia de origen y región visual", () => {
    for (const c of res.candidates) {
      expect(c.sourceBatchId).toBe("batch-1");
      expect(c.sourceReference).toContain("calendario.png");
      expect(res.meta[c.id].region.page).toBe(1);
      expect(res.meta[c.id].region.label).toBe("semana 2, martes");
    }
  });
});

describe("C/G/H/I. elementos ambiguos nunca desaparecen", () => {
  it("un bloque sin fecha va a 'Necesitan revisión'", () => {
    const res = run({
      services: [{ ...CALENDAR_CELL, service_date: null, source_excerpt: "Millennium (sin fecha)" }],
      unresolved: [],
      page_count: 1,
    });
    expect(res.candidates).toHaveLength(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/fecha/i);
  });

  it("un bloque con fecha pero sin identidad va a 'Necesitan revisión'", () => {
    const res = run({
      services: [
        {
          ...CALENDAR_CELL,
          venue_name: null,
          client_name: null,
          service_type: null,
          source_excerpt: "13",
        },
      ],
      unresolved: [],
      page_count: 1,
    });
    expect(res.candidates).toHaveLength(0);
    expect(res.unresolved[0].detectedText).toBe("13");
  });

  it("conserva los elementos ambiguos que reporta el extractor", () => {
    const res = run({
      services: [CALENDAR_CELL],
      unresolved: [
        { detected_text: "Zmr?", reason: "Texto borroso", suggestion: "¿Zemer?", page_number: 1, region_label: "esquina" },
      ],
      page_count: 1,
    });
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].suggestion).toBe("¿Zemer?");
  });

  it("texto irrelevante sin fecha ni servicio no genera candidatos", () => {
    const res = run({ services: [], unresolved: [], page_count: 1 });
    expect(res.candidates).toHaveLength(0);
    expect(res.warnings.join(" ")).toMatch(/No encontramos servicios/i);
  });

  it("hasMinimumEvidence exige fecha + identidad", () => {
    expect(hasMinimumEvidence({ service_date: "Oct 13", venue_name: "Zemer" })).toBe(true);
    expect(hasMinimumEvidence({ service_date: "Oct 13" })).toBe(false);
    expect(hasMinimumEvidence({ venue_name: "Zemer" })).toBe(false);
  });
});

describe("D/J. PDF multipágina y duplicados exactos", () => {
  it("conserva page_number y unifica el mismo servicio repetido entre páginas", () => {
    const res = run({
      services: [
        { ...CALENDAR_CELL, page_number: 1 },
        { ...CALENDAR_CELL, page_number: 2 },
        { ...CALENDAR_CELL, service_date: "Oct 20", page_number: 2 },
      ],
      unresolved: [],
      page_count: 2,
    });
    expect(res.candidates).toHaveLength(3);
    const deduped = dedupeAcrossPages(res.candidates);
    expect(deduped.candidates).toHaveLength(2);
    expect(deduped.removed).toBe(1);
    expect(res.meta[res.candidates[1].id].region.page).toBe(2);
  });
});

describe("E. flyer con una sola fecha", () => {
  it("produce un candidato con hora si el flyer la muestra", () => {
    const res = run({
      services: [
        {
          ...CALENDAR_CELL,
          service_date: "2026-11-02",
          start_time: "6pm",
          end_time: "23:00",
          requested_workers: 8,
          confidence: { date: 0.99, venue: 0.8, start_time: 0.9, end_time: 0.9, workers: 0.7 },
        },
      ],
      unresolved: [],
      page_count: 1,
    });
    const c = res.candidates[0];
    expect(c.startTime).toBe("18:00");
    expect(c.endTime).toBe("23:00");
    expect(c.requestedWorkers).toBe(8);
    expect(res.meta[c.id].levels.workers).toBe("MEDIUM");
  });
});

describe("K. aislamiento de tenant", () => {
  it("el candidato siempre lleva la compañía del contexto, nunca la del contenido", () => {
    const res = run({ services: [CALENDAR_CELL], unresolved: [], page_count: 1 }, OTHER_COMPANY);
    expect(res.candidates[0].companyId).toBe(OTHER_COMPANY);
    expect(res.candidates[0].companyId).not.toBe(COMPANY);
  });
});

describe("L. reintento estable", () => {
  it("dos ejecuciones del mismo archivo producen las mismas referencias", () => {
    const a = run({ services: [CALENDAR_CELL], unresolved: [], page_count: 1 });
    const b = run({ services: [CALENDAR_CELL], unresolved: [], page_count: 1 });
    expect(a.candidates[0].id).toBe(b.candidates[0].id);
    expect(a.candidates[0].sourceReference).toBe(b.candidates[0].sourceReference);
  });
});

describe("Ningún candidato nace publicado ni asignado", () => {
  it("el estado inicial es de revisión, nunca creado", () => {
    const res = run({ services: [CALENDAR_CELL], unresolved: [], page_count: 1 });
    expect(res.candidates[0].createdShiftId).toBeNull();
    expect(["pending", "needs_input"]).toContain(res.candidates[0].reviewStatus);
  });
});
