/**
 * P0 — VISUAL INTAKE FALSE NEGATIVE
 *
 * Regresión del caso real: captura de "Shift details" con fecha, horario,
 * Job, dirección, usuarios y recurrencia que devolvía "No encontramos servicios".
 */

import { describe, it, expect } from "vitest";
import {
  detectVisualRecurrence,
  hasMinimumEvidence,
  normalizeVisualExtraction,
  type RawVisualExtraction,
} from "@/lib/intake/visual-extraction";
import { describeVisualFailure } from "@/lib/intake/visual-intake";
import { canCreateDraft } from "@/lib/intake/candidate";

const REF = "2026-08-09";

function service(over: Record<string, unknown> = {}) {
  return {
    service_date: null,
    start_time: null,
    end_time: null,
    service_type: null,
    client_name: null,
    venue_name: null,
    location_text: null,
    requested_workers: null,
    roles: null,
    notes: null,
    source_excerpt: null,
    page_number: null,
    region_label: null,
    color_group: null,
    extraction_notes: null,
    confidence: null,
    ...over,
  };
}

function normalize(services: unknown[]) {
  const extraction: RawVisualExtraction = {
    services: services as never,
    unresolved: [],
    page_count: 1,
    notes: null,
  };
  return normalizeVisualExtraction({
    extraction,
    companyId: "c1",
    batchId: "b1",
    source: "screenshot",
    referenceDate: REF,
  });
}

// Caso exacto de la captura reportada.
const SHIFT_SCREENSHOT = service({
  service_date: "Monday, Aug 10, 2026",
  start_time: "4:00 pm",
  end_time: "9:00 pm",
  venue_name: "ELUM FRANKLHALL",
  location_text: "220 Franklin Ave",
  notes: "Recurrence: Every day for 4 times",
  confidence: { date: 0.95, venue: 0.8, start_time: 0.9, end_time: 0.9 },
});

describe("mínimo de servicio visual", () => {
  it("fecha + horario ya es servicio, aunque no haya Job", () => {
    expect(hasMinimumEvidence(service({ service_date: "Aug 10, 2026", start_time: "4:00 pm" }))).toBe(true);
  });

  it("fecha + Job es servicio", () => {
    expect(hasMinimumEvidence(service({ service_date: "Aug 10, 2026", venue_name: "ELUM" }))).toBe(true);
  });

  it("fecha + dirección es servicio", () => {
    expect(hasMinimumEvidence(service({ service_date: "Aug 10, 2026", location_text: "220 Franklin Ave" }))).toBe(true);
  });

  it("sin fecha no hay servicio", () => {
    expect(hasMinimumEvidence(service({ start_time: "4:00 pm", venue_name: "ELUM" }))).toBe(false);
  });
});

describe("captura de Shift details (caso real)", () => {
  const res = normalize([SHIFT_SCREENSHOT]);

  it("detecta al menos un servicio", () => {
    expect(res.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("resuelve fecha, inicio y fin", () => {
    const c = res.candidates[0];
    expect(c.serviceDate).toBe("2026-08-10");
    expect(c.startTime).toBe("16:00");
    expect(c.endTime).toBe("21:00");
  });

  it("conserva el Job detectado y permite borrador", () => {
    const c = res.candidates[0];
    expect(c.venueCandidate.raw).toBe("ELUM FRANKLHALL");
    expect(canCreateDraft(c).ok).toBe(true);
  });

  it("no lo manda a 'necesitan revisión'", () => {
    expect(res.unresolved).toHaveLength(0);
  });

  it("conserva la recurrencia como dato detectado, sin expandirla", () => {
    expect(res.candidates).toHaveLength(1);
    expect(res.notices.some((n) => /recurrencia/i.test(n.message) && /4/.test(n.message))).toBe(true);
  });
});

describe("detectVisualRecurrence", () => {
  it("lee 'Every day for 4 times'", () => {
    expect(detectVisualRecurrence("Recurrence: Every day for 4 times")?.times).toBe(4);
  });

  it("lee 'cada día por 3 veces'", () => {
    expect(detectVisualRecurrence("cada día por 3 veces")?.times).toBe(3);
  });

  it("no inventa recurrencia", () => {
    expect(detectVisualRecurrence("Monday, Aug 10, 2026")).toBeNull();
  });
});

describe("un fallo técnico no es 'cero servicios'", () => {
  it("cada código de fallo tiene lenguaje de análisis incompleto", () => {
    expect(describeVisualFailure("ai_error")).toMatch(/no se completó/);
    expect(describeVisualFailure("unparseable_extraction")).toMatch(/no se pudo leer/);
    expect(describeVisualFailure("file_unreadable")).toMatch(/abrir el archivo/);
  });
});

describe("bloques sin evidencia siguen visibles", () => {
  it("un bloque sólo con hora va a revisión, no se descarta", () => {
    const res = normalize([service({ start_time: "4:00 pm" })]);
    expect(res.candidates).toHaveLength(0);
    expect(res.unresolved).toHaveLength(1);
  });
});
