/**
 * Smart Intake Premium Experience V1 — tests del módulo puro de lenguaje.
 * Sólo traduce el modelo canónico: nunca inventa memoria.
 */
import { describe, it, expect } from "vitest";
import { buildUnderstanding, confidencePhrase } from "@/lib/intake/understanding";
import { emptyRef, type ServiceCandidate } from "@/lib/intake/candidate";

function candidate(over: Partial<ServiceCandidate> = {}): ServiceCandidate {
  return {
    id: over.id ?? "c1",
    sourceBatchId: "b1",
    sourceRowId: null,
    sourceReference: "ref",
    source: "pasted_text",
    companyId: "co",
    serviceDate: "2026-08-20",
    startTime: "18:00",
    endTime: "23:00",
    clientCandidate: emptyRef(""),
    venueCandidate: emptyRef(""),
    locationCandidate: emptyRef(""),
    serviceType: null,
    requestedWorkers: null,
    roleCandidates: [],
    notes: null,
    confidenceByField: {},
    missingFields: [],
    duplicateStatus: "no_match",
    duplicateShiftId: null,
    reviewStatus: "pending",
    ...over,
  } as ServiceCandidate;
}

describe("buildUnderstanding", () => {
  it("cuenta servicios activos y excluye los descartados", () => {
    const s = buildUnderstanding([
      candidate({ id: "a" }),
      candidate({ id: "b", reviewStatus: "excluded" }),
    ]);
    expect(s.serviceCount).toBe(1);
    expect(s.lines[0].text).toBe("1 Servicio");
  });

  it("no muestra memoria cuando no hay entidades reconocidas", () => {
    expect(buildUnderstanding([candidate()]).memory).toEqual([]);
  });

  it("muestra memoria real de un venue ya existente", () => {
    const s = buildUnderstanding([
      candidate({
        venueCandidate: {
          ...emptyRef("Millenium"),
          suggestedLabel: "Millennium Hall",
          suggestedId: "v1",
          matchOrigin: "dictionary",
          confidence: 0.9,
        },
      }),
    ]);
    expect(s.memory.some((m) => m.includes("Millennium Hall ya existe"))).toBe(true);
    expect(s.memory.some((m) => m.includes('alias "Millenium"'))).toBe(true);
  });

  it("marca lo pendiente sin bloquear el plan", () => {
    const s = buildUnderstanding([
      candidate({
        clientCandidate: { ...emptyRef("Chef K"), requiresConfirmation: true },
        missingFields: ["start_time"],
      }),
    ]);
    expect(s.lines.some((l) => l.tone === "warn")).toBe(true);
    expect(s.plan.some((p) => p.text.includes("borrador"))).toBe(true);
  });

  it("nunca expone porcentajes de confianza", () => {
    expect(confidencePhrase(0.91)).toBe("Estoy bastante seguro.");
    expect(confidencePhrase(0.2)).toBe("Necesito que me confirmes.");
  });
});
