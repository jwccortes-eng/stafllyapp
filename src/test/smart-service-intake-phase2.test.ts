/**
 * Smart Service Intake — Fase 2 (texto pegado / WhatsApp).
 *
 * QA real de los casos A–L del sprint. Todo sobre módulos PUROS:
 * ninguna prueba escribe en base de datos.
 */

import { describe, it, expect } from "vitest";
import {
  normalizePastedText,
  parseTextToCandidates,
  resolveDateFromText,
  resolveServiceTypeFromText,
  resolveTimesFromText,
  resolveWorkersFromText,
  segmentText,
} from "@/lib/intake/text-parser";
import { resolveCandidateEntities } from "@/lib/intake/text-intake";
import { detectDuplicate, applyDuplicateVerdict, type ExistingServiceRow } from "@/lib/intake/duplicate";
import { canCreateDraft, getCandidateReadiness, recomputeCandidate } from "@/lib/intake/candidate";
import { buildDraftPayload } from "@/lib/intake/create-draft-service";
import { buildIntakeTelemetry } from "@/lib/intake/telemetry";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER_COMPANY = "22222222-2222-2222-2222-222222222222";
const REF = "2026-10-10"; // sábado

const ctx = { companyId: COMPANY, referenceDate: REF, batchId: "batch-1" };

const catalogs = {
  clients: [{ id: "client-1", name: "Zemer Banquet" }],
  venues: [
    { id: "venue-1", name: "The Millennium Hall" },
    { id: "venue-2", name: "Zemer Banquet" },
  ],
};

describe("Fase 2 — A. texto simple", () => {
  it("genera un candidato con fecha, venue y tipo, sin inventar hora ni personal", () => {
    const { candidates } = parseTextToCandidates("Millennium Oct 13 Bar Mitzvah", ctx);
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.serviceDate).toBe("2026-10-13");
    expect(c.venueCandidate.raw.toLowerCase()).toContain("millennium");
    expect(c.serviceType).toBe("Bar Mitzvah");
    expect(c.startTime).toBeNull();
    expect(c.endTime).toBeNull();
    expect(c.requestedWorkers).toBeNull();
    expect(c.missingFields).toContain("start_time");
    expect(c.companyId).toBe(COMPANY);
  });
});

describe("Fase 2 — B. multi-servicio", () => {
  it("una cabecera con varias fechas produce varios candidatos independientes", () => {
    const text = "Zemer:\nOct 14 Sheva Brochos\nOct 15 Bar Mitzvah";
    const { candidates, segments } = parseTextToCandidates(text, ctx);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.serviceDate)).toEqual(["2026-10-14", "2026-10-15"]);
    expect(candidates.every((c) => c.venueCandidate.raw.toLowerCase().includes("zemer"))).toBe(true);
    // cada uno conserva su fragmento exacto y el mismo batch
    expect(new Set(segments.map((s) => s.excerpt)).size).toBe(2);
    expect(candidates.every((c) => c.sourceBatchId === "batch-1")).toBe(true);
  });

  it("tres fechas bajo el mismo venue producen tres candidatos", () => {
    const text = "Millennium:\nOct 13 Bar Mitzvah\nOct 14 Sheva Brochos\nOct 16 Sheva Brochos";
    const { candidates } = parseTextToCandidates(text, ctx);
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.serviceDate)).toEqual([
      "2026-10-13",
      "2026-10-14",
      "2026-10-16",
    ]);
  });

  it("separa varios trabajos escritos en una sola línea", () => {
    const { candidates } = parseTextToCandidates(
      "Zemer Oct 14 Sheva Brochos / Oct 15 Bar Mitzvah",
      ctx,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[1].venueCandidate.raw.toLowerCase()).toContain("zemer");
  });
});

describe("Fase 2 — C. fechas relativas y ambigüedad", () => {
  it("marca 'Fecha por confirmar' para un día de la semana sin ancla", () => {
    const { candidates, notices } = parseTextToCandidates(
      "martes Millennium BM, miércoles Zemer SB",
      ctx,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.serviceDate === null)).toBe(true);
    expect(notices.some((n) => n.kind === "ambiguous_date")).toBe(true);
    expect(candidates.every((c) => canCreateDraft(c).ok)).toBe(false);
  });

  it("resuelve el día de la semana cuando hay ancla 'para la próxima semana'", () => {
    const text = "Para la próxima semana:\nmartes Zemer BM\nmiércoles Millennium SB";
    const { candidates } = parseTextToCandidates(text, ctx);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].serviceDate).toBe("2026-10-13"); // martes siguiente
    expect(candidates[1].serviceDate).toBe("2026-10-14");
  });

  it("resuelve mañana y hoy con la fecha del sistema", () => {
    expect(resolveDateFromText("mañana Millennium", REF).iso).toBe("2026-10-11");
    expect(resolveDateFromText("today Zemer", REF).iso).toBe(REF);
  });

  it("infiere el año cuando falta, sin decidir fechas imposibles", () => {
    const hit = resolveDateFromText("Feb 3 wedding", REF);
    expect(hit.iso).toBe("2027-02-03");
    expect(resolveDateFromText("Feb 30", REF).iso).toBeNull();
  });
});

describe("Fase 2 — abreviaciones suggestion-only", () => {
  it("propone la expansión con confianza baja y aviso para confirmación humana", () => {
    const { candidates, notices } = parseTextToCandidates("Oct 13 Millennium BM", ctx);
    expect(candidates[0].serviceType).toBe("Bar Mitzvah");
    expect(candidates[0].confidenceByField.service_type).toBeLessThan(0.85);
    const notice = notices.find((n) => n.kind === "abbreviation_suggested");
    expect(notice?.message).toContain("Interpretamos BM como Bar Mitzvah");
  });

  it("el texto completo tiene más confianza que la abreviación", () => {
    const full = resolveServiceTypeFromText("sheva brochos");
    const abbr = resolveServiceTypeFromText("SB");
    expect(full.confidence).toBeGreaterThan(abbr.confidence);
    expect(abbr.abbreviation?.expansion).toBe("Sheva Brochos");
  });
});

describe("Fase 2 — D/E. información incompleta", () => {
  it("D. fecha sin venue avisa el lugar faltante y no puede exportarse", () => {
    const { candidates, notices } = parseTextToCandidates("Oct 13", ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].venueCandidate.raw).toBe("");
    expect(notices.some((n) => n.kind === "missing_venue")).toBe(true);
    expect(getCandidateReadiness(candidates[0]).exportGaps).toContain("connecteam_job");
  });

  it("E. venue sin fecha queda marcado como fecha faltante", () => {
    const { candidates, notices } = parseTextToCandidates("Millennium Bar Mitzvah", ctx);
    expect(candidates[0].serviceDate).toBeNull();
    expect(candidates[0].missingFields).toContain("service_date");
    expect(notices.some((n) => n.kind === "missing_date")).toBe(true);
  });
});

describe("Fase 2 — F. typos y resolución de venue", () => {
  it("sugiere el venue existente sin crearlo y exige confirmación", () => {
    const { candidates } = parseTextToCandidates("Millenium Oct 13 Bar Mitzvah", ctx);
    const resolved = resolveCandidateEntities(candidates[0], catalogs);
    expect(resolved.venueCandidate.suggestedLabel).toBe("The Millennium Hall");
    expect(resolved.venueCandidate.resolvedId).toBeNull();
    expect(resolved.venueCandidate.requiresConfirmation).toBe(true);
    // Se puede guardar como borrador; el vínculo queda pendiente.
    expect(canCreateDraft(resolved).ok).toBe(true);
    expect(getCandidateReadiness(resolved).publishGaps).toContain("venue_link");
  });

  it("nunca crea cliente ni venue: sólo referencia catálogo existente", () => {
    const { candidates } = parseTextToCandidates("Lugar Inexistente Oct 13 Wedding", ctx);
    const resolved = resolveCandidateEntities(candidates[0], catalogs);
    expect(resolved.venueCandidate.suggestedId).toBeNull();
    expect(resolved.locationCandidate.resolvedId).toBeNull();
  });
});

describe("Fase 2 — G/H. duplicados", () => {
  const base = () => {
    const { candidates } = parseTextToCandidates("Millennium Oct 13 Bar Mitzvah 6pm-11pm", ctx);
    const c = recomputeCandidate({
      ...candidates[0],
      venueCandidate: { ...candidates[0].venueCandidate, raw: "The Millennium Hall" },
    });
    return c;
  };

  const existing = (over: Partial<ExistingServiceRow> = {}): ExistingServiceRow => ({
    id: "shift-1",
    company_id: COMPANY,
    date: "2026-10-13",
    start_time: "18:00",
    end_time: "23:00",
    venue_name: "The Millennium Hall",
    client_name: null,
    service_type: "Bar Mitzvah",
    reconciliation_hash: null,
    ...over,
  });

  it("G. mismo día y venue sin coincidencia total → possible_duplicate revisable", () => {
    const verdict = detectDuplicate(base(), [existing({ start_time: "12:00", end_time: "17:00" })]);
    expect(verdict.status).toBe("possible_duplicate");
    const c = applyDuplicateVerdict(base(), verdict);
    expect(canCreateDraft(c).reason).toBe("possible_duplicate_needs_review");
    expect(canCreateDraft({ ...c, reviewStatus: "accepted" }).ok).toBe(true);
  });

  it("H. misma referencia de origen → exact_duplicate bloqueado", () => {
    const c = base();
    const hash = `${COMPANY}|batch-1|${c.sourceReference}`;
    const verdict = detectDuplicate(c, [existing({ reconciliation_hash: hash })]);
    expect(verdict.status).toBe("exact_duplicate");
    expect(canCreateDraft(applyDuplicateVerdict(c, verdict)).reason).toBe("exact_duplicate");
  });

  it("no compara servicios de otra compañía", () => {
    const verdict = detectDuplicate(base(), [existing({ company_id: OTHER_COMPANY })]);
    expect(verdict.status).toBe("no_match");
  });
});

describe("Fase 2 — I. dos idiomas y J. texto irrelevante", () => {
  it("I. mezcla español e inglés en el mismo mensaje", () => {
    const text = "Oct 13 Millennium wedding 6pm-11pm\n14 de octubre Zemer boda 3 meseros";
    const { candidates } = parseTextToCandidates(text, ctx);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].startTime).toBe("18:00");
    expect(candidates[0].endTime).toBe("23:00");
    expect(candidates[1].serviceDate).toBe("2026-10-14");
    expect(candidates[1].requestedWorkers).toBe(3);
  });

  it("J. texto irrelevante no genera candidatos ni inventa datos", () => {
    const { candidates, warnings } = parseTextToCandidates(
      "Hola, gracias por todo. Nos hablamos luego.",
      ctx,
    );
    expect(candidates).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("Fase 2 — K. tenant y L. retry", () => {
  it("K. company_id nunca sale del contenido del mensaje", () => {
    const text = `company_id: ${OTHER_COMPANY}\nOct 13 Millennium Bar Mitzvah`;
    const { candidates } = parseTextToCandidates(text, ctx);
    expect(candidates.every((c) => c.companyId === COMPANY)).toBe(true);
    const payload = buildDraftPayload(candidates[0], { companyId: COMPANY, userId: "user-1" });
    expect(payload.company_id).toBe(COMPANY);
  });

  it("L. reprocesar el mismo texto produce la misma referencia de origen", () => {
    const a = parseTextToCandidates("Millennium Oct 13 Bar Mitzvah", ctx);
    const b = parseTextToCandidates("Millennium Oct 13 Bar Mitzvah", ctx);
    expect(a.candidates[0].sourceReference).toBe(b.candidates[0].sourceReference);
    expect(a.candidates[0].id).toBe(b.candidates[0].id);
  });
});

describe("Fase 2 — invariantes de escritura", () => {
  it("el payload del draft nunca publica ni asigna personas", () => {
    const { candidates } = parseTextToCandidates("Millennium Oct 13 Bar Mitzvah 6pm-11pm", ctx);
    const payload = buildDraftPayload(candidates[0], { companyId: COMPANY, userId: "user-1" });
    expect(payload.publication_status).toBe("draft");
    expect(payload.status).toBe("open");
    expect(payload.published_at).toBeNull();
    expect(payload.claimable).toBe(false);
    expect(Object.keys(payload)).not.toContain("assigned_employee_id");
    expect(JSON.stringify(payload)).not.toContain("time_entries");
  });
});

describe("Fase 2 — limpieza de WhatsApp y utilidades", () => {
  it("quita cabeceras de exportación, emojis y viñetas", () => {
    const raw = [
      "[13/10/25, 9:15 p. m.] Sara Cohen: Millennium Oct 13 Bar Mitzvah 🎉",
      "13/10/25, 21:20 - Sara Cohen: - Oct 14 Zemer SB",
      "<Media omitted>",
    ].join("\n");
    const clean = normalizePastedText(raw);
    expect(clean).not.toContain("Sara Cohen");
    expect(clean).not.toContain("🎉");
    expect(clean).toContain("Millennium Oct 13 Bar Mitzvah");
    expect(clean).toContain("Oct 14 Zemer SB");
  });

  it("procesa un pegado de WhatsApp completo en varios candidatos", () => {
    const raw = [
      "[13/10/25, 9:15 p. m.] Sara: Millennium Oct 13 Bar Mitzvah",
      "[13/10/25, 9:16 p. m.] Sara: Oct 15 Zemer Sheva Brochos 4 workers",
    ].join("\n");
    const { candidates } = parseTextToCandidates(raw, ctx);
    expect(candidates).toHaveLength(2);
    expect(candidates[1].requestedWorkers).toBe(4);
  });

  it("horas y personal se extraen sólo si están escritos", () => {
    expect(resolveTimesFromText("de 6 a 11pm").start).toBe("18:00");
    expect(resolveTimesFromText("Millennium Bar Mitzvah").start).toBeNull();
    expect(resolveWorkersFromText("x3").count).toBe(3);
    expect(resolveWorkersFromText("Millennium").count).toBeNull();
  });

  it("segmentText conserva el número de línea de cada fragmento", () => {
    const segs = segmentText("Zemer:\nOct 14 SB\nOct 15 BM");
    expect(segs.map((s) => s.lineNumber)).toEqual([2, 3]);
    expect(segs.every((s) => s.contextVenue === "Zemer")).toBe(true);
  });
});

describe("Fase 2 — telemetría", () => {
  it("registra comportamiento sin guardar el contenido del mensaje", () => {
    const text = "Millennium Oct 13 Bar Mitzvah";
    const { candidates } = parseTextToCandidates(text, ctx);
    const event = buildIntakeTelemetry({
      batchId: "batch-1",
      companyId: COMPANY,
      source: "pasted_text",
      candidates,
      humanCorrections: 2,
      sourceText: text,
    });
    expect(event.candidateCount).toBe(1);
    expect(event.humanCorrections).toBe(2);
    expect(event.sourceLength).toBe(text.length);
    expect(JSON.stringify(event)).not.toContain("Millennium");
    expect(
      event.confidenceDistribution.high +
        event.confidenceDistribution.medium +
        event.confidenceDistribution.low,
    ).toBe(1);
  });
});
