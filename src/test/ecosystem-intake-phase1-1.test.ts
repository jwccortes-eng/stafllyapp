/**
 * Ecosystem Intake Engine — FASE 1.1 (QA real + consolidación del patrón).
 *
 * Cubre lo que no puede fallar en operación: prevención de duplicados,
 * integridad del plan "VAMOS A", aislamiento por empresa y métricas.
 */
import { describe, expect, it } from "vitest";
import {
  buildCreationPlan,
  describePlanAction,
  planMatchesExecution,
  buildEntityResolution,
  decisionFromRef,
} from "@/lib/intake/entity-linking";
import { nearDuplicates, DUPLICATE_THRESHOLD } from "@/lib/intake/assisted-creation";
import {
  emptyEntityMetrics,
  recordEntityOutcome,
} from "@/lib/intake/entity-metrics";
import { emptyRef } from "@/lib/intake/candidate";
import type { CatalogEntry } from "@/lib/intake/entity-resolution";

const COMPANY_A: CatalogEntry[] = [
  { id: "a1", name: "The Millennium Hall" },
  { id: "a2", name: "Imperial Catering" },
];
const COMPANY_B: CatalogEntry[] = [{ id: "b1", name: "Northside Events" }];

const ROWS = [
  { id: "r1", name: "Imperial Catering", address: "120 Main St, Boston" },
  { id: "r2", name: "Luminance Events", address: "9 Rooftop Ave, Boston" },
];

describe("Fase 1.1 — prevención de duplicados", () => {
  it("detecta un cliente casi idéntico antes de crear", () => {
    const matches = nearDuplicates(ROWS, "Imperial Catering LLC");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].id).toBe("r1");
  });

  it("detecta duplicado por dirección equivalente aunque cambie el nombre", () => {
    const matches = nearDuplicates(ROWS, "Rooftop Lounge", "9 Rooftop Ave Boston");
    expect(matches.some((m) => m.id === "r2")).toBe(true);
  });

  it("no bloquea nombres realmente distintos", () => {
    expect(nearDuplicates(ROWS, "Zeta Nine Warehouse")).toHaveLength(0);
    expect(DUPLICATE_THRESHOLD).toBeGreaterThan(0.7);
  });
});

describe("Fase 1.1 — integridad del plan de creación", () => {
  it("muestra exactamente lo que se va a ejecutar", () => {
    const plan = buildCreationPlan({
      client: { mode: "link", label: "Imperial Catering" },
      venue: { mode: "create", label: "Rooftop Lounge" },
      contact: { mode: "create", label: "Ana Ruiz" },
      createDraftService: true,
    });
    expect(plan.map(describePlanAction)).toEqual([
      "Vincular cliente existente: Imperial Catering",
      "Crear lugar: Rooftop Lounge",
      "Crear contacto: Ana Ruiz",
      "Crear servicio: Servicio en borrador",
    ]);
  });

  it("falla si lo ejecutado no coincide con lo mostrado", () => {
    const planned = buildCreationPlan({
      client: { mode: "link", label: "Imperial Catering" },
      createDraftService: true,
    });
    const executedExtra = buildCreationPlan({
      client: { mode: "link", label: "Imperial Catering" },
      venue: { mode: "create", label: "Extra no anunciado" },
      createDraftService: true,
    });
    expect(planMatchesExecution(planned, planned)).toBe(true);
    expect(planMatchesExecution(planned, executedExtra)).toBe(false);
  });

  it("omite entidades que no se tocan", () => {
    const plan = buildCreationPlan({
      client: { mode: "none", label: "" },
      createDraftService: true,
    });
    expect(plan).toHaveLength(1);
  });
});

describe("Fase 1.1 — alias aprendido y aislamiento por empresa", () => {
  it("explica el alias confirmado previamente por la empresa", () => {
    const ref = {
      ...emptyRef("Millenium"),
      resolvedId: "a1",
      suggestedId: "a1",
      suggestedLabel: "The Millennium Hall",
      confidence: 0.93,
      requiresConfirmation: false,
      matchOrigin: "dictionary" as const,
    };
    const d = decisionFromRef("venue", ref, COMPANY_A);
    expect(d.status).toBe("linked");
    expect(d.explanation).toContain("Alias confirmado previamente por esta empresa");
  });

  it("no encuentra entidades de otra empresa (fail-closed)", () => {
    const d = buildEntityResolution("venue", "The Millennium Hall", COMPANY_B);
    expect(d.status).toBe("unknown");
    expect(d.best).toBeNull();
    expect(d.requiresHumanConfirmation).toBe(true);
  });
});

describe("Fase 1.1 — métricas sin contenido sensible", () => {
  it("acumula resultados y tiempo medio de resolución", () => {
    let m = emptyEntityMetrics("company-a");
    m = recordEntityOutcome(m, "exact_match", 1000);
    m = recordEntityOutcome(m, "fuzzy_match", 3000);
    m = recordEntityOutcome(m, "duplicate_prevented");
    m = recordEntityOutcome(m, "cross_tenant_denied");
    m = recordEntityOutcome(m, "retry");

    expect(m.resolutions).toBe(2);
    expect(m.exactMatches).toBe(1);
    expect(m.fuzzyMatches).toBe(1);
    expect(m.duplicatesPrevented).toBe(1);
    expect(m.crossTenantDenials).toBe(1);
    expect(m.retries).toBe(1);
    expect(m.averageTimeToResolutionMs).toBe(2000);
    expect(Object.keys(m)).not.toContain("names");
  });
});
