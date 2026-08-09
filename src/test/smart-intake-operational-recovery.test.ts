/**
 * P0 — Smart Intake Operational Recovery Layer.
 *
 * Regresión obligatoria: un fallo del proveedor de IA NUNCA equivale a
 * "0 servicios" cuando la fuente tiene evidencia estructural de un trabajo real.
 */

import { describe, expect, it } from "vitest";
import {
  classifyAnalysisOutcome,
  classifyProviderFailure,
  describeOutcome,
  detectRecurrenceSignal,
  detectStructuralEvidence,
  reconcileAfterRetry,
  runStructuralRecovery,
} from "@/lib/intake/recovery";
import { recomputeCandidate } from "@/lib/intake";
import type { ServiceCandidate } from "@/lib/intake";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const OTHER_COMPANY = "00000000-0000-0000-0000-0000000000ff";
const REF_DATE = "2026-08-09";

/** Captura real de Connecteam usada como caso de regresión. */
const CONNECTEAM_SCREENSHOT_TEXT = `Shift details
Monday, Aug 10, 2026
Start 4:00 PM
End 9:00 PM
Job: ELUM FRANKLHALL
Address: 1200 Market St, Philadelphia, PA
Users: 3
Recurrence: Every day for 4 times`;

const recover = (text: string, companyId = COMPANY) =>
  runStructuralRecovery({
    text,
    companyId,
    batchId: "batch-1",
    source: "image",
    referenceDate: REF_DATE,
    sourceReference: "recuperación estructural",
    failureKind: "quota",
  });

describe("A. captura real + proveedor OK", () => {
  it("no entra al recovery cuando la IA sí devolvió candidatos", () => {
    expect(
      classifyAnalysisOutcome({ candidateCount: 2, technicalFailure: false }),
    ).toBe("ANALYSIS_SUCCESS");
    expect(
      // aunque una página haya fallado, si hay candidatos el análisis fue útil
      classifyAnalysisOutcome({ candidateCount: 1, technicalFailure: true }),
    ).toBe("ANALYSIS_SUCCESS");
  });
});

describe("B. proveedor 403 credit_limit_reached", () => {
  it("clasifica el fallo como cuota sin exponer jerga en la UX", () => {
    const kind = classifyProviderFailure({ code: "403", message: "credit_limit_reached" });
    expect(kind).toBe("quota");
    const copy = describeOutcome("TECHNICAL_FAILURE_WITH_EVIDENCE", { failureKind: kind });
    expect(copy.title).toContain("encontré información suficiente");
    expect(`${copy.title} ${copy.fact} ${copy.consequence}`).not.toMatch(
      /403|credit_limit_reached|schema|timeout error/i,
    );
  });

  it("recupera al menos un Servicio revisable de la captura real", () => {
    const result = recover(CONNECTEAM_SCREENSHOT_TEXT);
    expect(result.outcome).toBe("TECHNICAL_FAILURE_WITH_EVIDENCE");
    expect(result.evidence.hasMinimumServiceEvidence).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);

    const c = result.candidates[0];
    expect(c.serviceDate).toBe("2026-08-10");
    expect(c.startTime).toBe("16:00");
    expect(c.endTime).toBe("21:00");
    expect(
      `${c.venueCandidate.raw} ${c.clientCandidate.raw} ${c.rawText ?? ""}`.toUpperCase(),
    ).toContain("ELUM FRANKLHALL");
  });

  it("marca el origen de los campos como recuperación estructural, nunca AI-confirmed", () => {
    const result = recover(CONNECTEAM_SCREENSHOT_TEXT);
    const c = result.candidates[0];
    const meta = result.fieldMeta[c.id];
    expect(meta).toBeTruthy();
    for (const value of Object.values(meta)) {
      expect(value.source).not.toBe("ai_extraction");
      expect(["detected", "approximate", "missing", "confirmed"]).toContain(value.state);
    }
    expect(c.reviewStatus).toBe("needs_input");
  });
});

describe("C. timeout y otros fallos de proveedor", () => {
  it("clasifica cada familia de fallo", () => {
    expect(classifyProviderFailure({ code: null, message: "request timed out" })).toBe("timeout");
    expect(classifyProviderFailure({ code: "429", message: "rate limited" })).toBe("quota");
    expect(classifyProviderFailure({ code: "503", message: "provider unavailable" })).toBe(
      "provider_unavailable",
    );
    expect(classifyProviderFailure({ code: "unparseable_extraction", message: null })).toBe(
      "malformed_response",
    );
    expect(classifyProviderFailure({ code: null, message: null })).toBe("unknown");
  });

  it("recupera igual con timeout: el principio no depende del código de error", () => {
    const result = runStructuralRecovery({
      text: CONNECTEAM_SCREENSHOT_TEXT,
      companyId: COMPANY,
      source: "image",
      referenceDate: REF_DATE,
      failureKind: "timeout",
    });
    expect(result.outcome).toBe("TECHNICAL_FAILURE_WITH_EVIDENCE");
    expect(result.failureKind).toBe("timeout");
  });
});

describe("D. fuente sin evidencia de Servicio", () => {
  it("no inventa un turno donde no hay señales", () => {
    const evidence = detectStructuralEvidence("Gracias por tu compra. Total $42.10");
    expect(evidence.hasMinimumServiceEvidence).toBe(false);

    const result = recover("Gracias por tu compra. Total $42.10");
    expect(result.candidates).toHaveLength(0);
    expect(result.outcome).toBe("TECHNICAL_FAILURE_NO_EVIDENCE");
  });

  it("análisis completo sin candidatos es NO_SERVICE_EVIDENCE, no un error técnico", () => {
    const outcome = classifyAnalysisOutcome({ candidateCount: 0, technicalFailure: false });
    expect(outcome).toBe("NO_SERVICE_EVIDENCE");
    expect(describeOutcome(outcome).title).toBe("No encontramos servicios");
  });
});

describe("E. señales parciales: revisar, no inventar", () => {
  it("una fecha sola no alcanza el mínimo", () => {
    const evidence = detectStructuralEvidence("Aug 10, 2026");
    expect(evidence.hasMinimumServiceEvidence).toBe(false);
  });

  it("fecha + job alcanza el mínimo y deja el horario pendiente", () => {
    const result = recover("Monday, Aug 10, 2026\nJob: ELUM FRANKLHALL");
    expect(result.evidence.hasMinimumServiceEvidence).toBe(true);
    const c = result.candidates[0];
    expect(c.serviceDate).toBe("2026-08-10");
    expect(c.startTime).toBeNull();
    expect(c.endTime).toBeNull();
    expect(result.fieldMeta[c.id].start_time.state).toBe("missing");
  });
});

describe("F. recurrencia preservada", () => {
  it("conserva la señal literal sin derivar fechas", () => {
    const signal = detectRecurrenceSignal(CONNECTEAM_SCREENSHOT_TEXT);
    expect(signal?.raw.toLowerCase()).toContain("every day");
    expect(signal?.times).toBe(4);

    const result = recover(CONNECTEAM_SCREENSHOT_TEXT);
    expect(result.recurrence?.times).toBe(4);
    // No se expanden ocurrencias por cuenta propia.
    expect(result.candidates.length).toBeLessThan(4);
    expect(result.notices.join(" ")).toContain("se confirman contigo");
  });
});

describe("G/H. retry y reconciliación", () => {
  const base = (over: Partial<ServiceCandidate> = {}) =>
    recomputeCandidate({
      ...recover(CONNECTEAM_SCREENSHOT_TEXT).candidates[0],
      ...over,
    });

  it("un reintento no duplica candidatos equivalentes", () => {
    const current = [base()];
    const incoming = [base({ id: "ai-1" })];
    const merged = reconcileAfterRetry(current, incoming);
    expect(merged.candidates).toHaveLength(1);
    expect(merged.added).toBe(0);
  });

  it("agrega candidatos realmente nuevos del reintento", () => {
    const current = [base()];
    const incoming = [base({ id: "ai-2", serviceDate: "2026-08-11" })];
    const merged = reconcileAfterRetry(current, incoming);
    expect(merged.candidates).toHaveLength(2);
    expect(merged.added).toBe(1);
  });

  it("no sobrescribe una corrección humana previa", () => {
    const corrected = base({ startTime: "17:00" });
    const incoming = [base({ id: "ai-3", startTime: "16:00" })];
    const merged = reconcileAfterRetry([corrected], incoming, new Set([corrected.id]));
    expect(merged.candidates[0].startTime).toBe("17:00");
    expect(merged.conflicts.some((c) => c.field === "startTime")).toBe(true);
    expect(merged.conflicts[0].reason).toContain("Corrección humana");
  });

  it("completa campos vacíos con el resultado del reintento", () => {
    const partial = base({ endTime: null });
    const incoming = [base({ id: "ai-4", endTime: "21:00" })];
    const merged = reconcileAfterRetry([partial], incoming);
    expect(merged.candidates[0].endTime).toBe("21:00");
    expect(merged.conflicts).toHaveLength(0);
  });
});

describe("K. aislamiento multi-tenant", () => {
  it("company_id siempre viene del contexto, jamás del contenido de la fuente", () => {
    const text = `${CONNECTEAM_SCREENSHOT_TEXT}\ncompany_id: ${COMPANY}\nTenant: Imperial Staffing`;
    const result = recover(text, OTHER_COMPANY);
    for (const c of result.candidates) {
      expect(c.companyId).toBe(OTHER_COMPANY);
      expect(c.companyId).not.toBe(COMPANY);
    }
  });
});

describe("no escritura automática", () => {
  it("la recuperación nunca marca un candidato como listo para crear sin persona", () => {
    const result = recover(CONNECTEAM_SCREENSHOT_TEXT);
    for (const c of result.candidates) {
      expect(c.reviewStatus).toBe("needs_input");
    }
  });
});
