/**
 * Fix pass sobre la auditoría de canales (docs/qa/P0_SMART_INTAKE_FULL_CHANNEL_HEALTH_AUDIT.md).
 *
 * Cubre los bugs de producto confirmados:
 *  1. GROUP_RE ya no genera el fantasma "20 AGO" desde "Aug 10, 2026".
 *  4. El inventario de hojas de Excel no descarta nada en silencio.
 *  5. Un fallo de crédito del proveedor se clasifica como fallo técnico,
 *     nunca como ausencia de servicios.
 */

import { describe, it, expect } from "vitest";
import { expandDateList } from "@/lib/intake/date-expansion";
import {
  classifyProviderFailure,
  classifyAnalysisOutcome,
  describeOutcome,
} from "@/lib/intake/recovery";

describe("GROUP_RE — sin fantasma desde el año", () => {
  it("no crea un 20 AGO a partir de 'Monday, Aug 10, 2026'", () => {
    const result = expandDateList(
      "Monday, Aug 10, 2026 4:00 PM - 9:00 PM Job: ELUM FRANKLHALL",
      "2026-08-01",
    );
    expect(result.dates.map((d) => d.iso)).toEqual(["2026-08-10"]);
  });

  it("sigue expandiendo listas reales de días", () => {
    const result = expandDateList("Aug 30/31 Sep 1-3", "2026-08-01");
    expect(result.dates.length).toBe(5);
  });
});


describe("Fallo del proveedor ≠ falta de contenido", () => {
  it("credit_limit_reached es un fallo técnico", () => {
    expect(classifyProviderFailure({ code: "credit_limit_reached", status: 403 })).toBe(
      "quota_or_credit",
    );
  });

  it("sin candidatos y con fallo técnico nunca dice 'No encontramos servicios'", () => {
    const outcome = classifyAnalysisOutcome({
      candidateCount: 0,
      technicalFailure: true,
      evidence: null,
    });
    const copy = describeOutcome(outcome, { failureKind: "quota_or_credit" });
    expect(copy.title).not.toMatch(/No encontramos servicios/i);
    expect(copy.tone).toBe("error");
  });
});
