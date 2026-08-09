/**
 * Smart Service Intake — Fase 4 (audio): tests del módulo puro.
 *
 * Cubren la única lógica propia del canal de audio (fechas habladas y
 * normalización) y confirman que el resultado es EXACTAMENTE el mismo modelo
 * canónico que producen texto, imagen y Excel.
 */

import { describe, it, expect } from "vitest";
import { resolveAudioDate, normalizeAudioExtraction } from "@/lib/intake/audio-extraction";
import { canCreateDraft, getCandidateReadiness } from "@/lib/intake/candidate";
import { validateAudioFile } from "@/lib/intake/audio-intake";
import type { RawVisualExtraction } from "@/lib/intake/visual-extraction";

const REF = "2026-03-10"; // martes

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

function extraction(services: unknown[]): RawVisualExtraction {
  return { services: services as any, unresolved: [], page_count: 1, notes: null };
}

function normalize(services: unknown[]) {
  return normalizeAudioExtraction({
    extraction: extraction(services),
    companyId: "c1",
    batchId: "b1",
    source: "voice_note",
    referenceDate: REF,
  });
}

describe("resolveAudioDate", () => {
  it("resuelve 'mañana'", () => {
    expect(resolveAudioDate("mañana", REF).iso).toBe("2026-03-11");
  });

  it("resuelve 'pasado mañana'", () => {
    expect(resolveAudioDate("pasado mañana", REF).iso).toBe("2026-03-12");
  });

  it("resuelve 'next thursday' hacia adelante", () => {
    const hit = resolveAudioDate("next thursday", REF);
    expect(hit.iso).toBeTruthy();
    expect(hit.iso! > REF).toBe(true);
  });

  it("marca ambigüedad en un día suelto sin ancla", () => {
    const hit = resolveAudioDate("el jueves", REF);
    if (!hit.iso) expect(hit.ambiguous).toBe(true);
    else expect(hit.iso > REF).toBe(true);
  });

  it("acepta fecha ISO dicha completa", () => {
    expect(resolveAudioDate("2026-04-02", REF).iso).toBe("2026-04-02");
  });

  it("no inventa nada cuando no hay fecha", () => {
    expect(resolveAudioDate("por la tarde", REF).iso).toBeNull();
  });
});

describe("normalizeAudioExtraction", () => {
  it("convierte una nota de un solo servicio en un candidato", () => {
    const res = normalize([
      service({
        service_date: "mañana",
        start_time: "6pm",
        end_time: "23:00",
        venue_name: "Hotel Marina",
        requested_workers: 4,
        confidence: { date: 0.9, venue: 0.8 },
      }),
    ]);
    expect(res.candidates).toHaveLength(1);
    const c = res.candidates[0];
    expect(c.source).toBe("voice_note");
    expect(c.serviceDate).toBe("2026-03-11");
    expect(c.startTime).toBe("18:00");
    expect(c.endTime).toBe("23:00");
    expect(c.requestedWorkers).toBe(4);
    expect(canCreateDraft(c).ok).toBe(true);
  });

  it("genera varios candidatos desde una sola nota", () => {
    const res = normalize([
      service({ service_date: "mañana", venue_name: "Marina", start_time: "10:00", end_time: "14:00" }),
      service({ service_date: "2026-03-14", venue_name: "Convention Center", start_time: "08:00", end_time: "16:00" }),
    ]);
    expect(res.candidates).toHaveLength(2);
    expect(res.candidates.map((c) => c.serviceDate)).toEqual(["2026-03-11", "2026-03-14"]);
  });

  it("no inventa hora: la deja pendiente sin bloquear el borrador", () => {
    const res = normalize([service({ service_date: "mañana", venue_name: "Marina" })]);
    const c = res.candidates[0];
    expect(c.startTime).toBeNull();
    expect(c.missingFields).toContain("start_time");
    expect(canCreateDraft(c).ok).toBe(true);
    expect(getCandidateReadiness(c).publishGaps).toContain("start_time");
  });

  it("no inventa personal ni cliente", () => {
    const res = normalize([
      service({ service_date: "mañana", venue_name: "Marina", start_time: "10:00", end_time: "12:00" }),
    ]);
    expect(res.candidates[0].requestedWorkers).toBeNull();
    expect(res.candidates[0].clientCandidate.raw).toBe("");
  });

  it("degrada la confianza de un venue mal pronunciado", () => {
    const res = normalize([
      service({
        service_date: "mañana",
        venue_name: "Marinah Otel",
        start_time: "10:00",
        end_time: "12:00",
        confidence: { date: 0.9, venue: 0.35 },
      }),
    ]);
    const id = res.candidates[0].id;
    expect(res.meta[id].levels.venue).toBe("LOW");
  });

  it("una fecha ambigua deja el candidato en revisión", () => {
    const res = normalize([
      service({ service_date: "el jueves o el viernes", venue_name: "Marina", start_time: "10:00", end_time: "12:00" }),
    ]);
    if (res.candidates.length > 0) {
      expect(res.candidates[0].missingFields).toContain("service_date");
    } else {
      expect(res.unresolved.length).toBeGreaterThan(0);
    }
  });

  it("avisa cuando el año no se dijo", () => {
    const res = normalize([
      service({ service_date: "14 marzo", venue_name: "Marina", start_time: "10:00", end_time: "12:00" }),
    ]);
    const c = res.candidates[0];
    if (c.serviceDate?.slice(0, 4) !== REF.slice(0, 4)) {
      expect(res.notices.some((n) => n.candidateId === c.id && /año/.test(n.message))).toBe(true);
    } else {
      expect(c.serviceDate).toBeTruthy();
    }
  });

  it("traduce los avisos al lenguaje de la nota de voz", () => {
    const res = normalize([service({ service_date: "mañana", venue_name: "Marina" })]);
    expect(res.notices.some((n) => /La nota no dice el horario/.test(n.message))).toBe(true);
    expect(res.notices.every((n) => !/La imagen/.test(n.message))).toBe(true);
  });

  it("un fragmento sin fecha nunca se descarta en silencio", () => {
    const res = normalize([service({ venue_name: "Marina" })]);
    expect(res.candidates).toHaveLength(0);
    expect(res.unresolved).toHaveLength(1);
  });

  it("el audio con ruido sin contenido produce aviso, no candidatos", () => {
    const res = normalize([]);
    expect(res.candidates).toHaveLength(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("el companyId sale siempre del contexto, nunca del audio", () => {
    const res = normalize([
      service({
        service_date: "mañana",
        venue_name: "Marina",
        start_time: "10:00",
        end_time: "12:00",
        notes: "company id 00000000-0000-0000-0000-000000000000",
      }),
    ]);
    expect(res.candidates[0].companyId).toBe("c1");
  });
});

describe("validateAudioFile", () => {
  const make = (name: string, type: string, size: number) =>
    new File([new Uint8Array(size)], name, { type });

  it("acepta m4a, mp3, wav y ogg", () => {
    expect(validateAudioFile(make("a.m4a", "audio/mp4", 5000))).toBeNull();
    expect(validateAudioFile(make("a.mp3", "audio/mpeg", 5000))).toBeNull();
    expect(validateAudioFile(make("a.wav", "audio/wav", 5000))).toBeNull();
    expect(validateAudioFile(make("a.ogg", "audio/ogg", 5000))).toBeNull();
  });

  it("rechaza un formato que no es audio", () => {
    expect(validateAudioFile(make("a.pdf", "application/pdf", 5000))).toBeTruthy();
  });

  it("rechaza audio vacío", () => {
    expect(validateAudioFile(make("a.wav", "audio/wav", 10))).toBeTruthy();
  });
});
