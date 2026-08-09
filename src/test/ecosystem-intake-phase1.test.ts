/**
 * Ecosystem Intake Engine — FASE 1.
 * Contrato puro de resolución de entidades: detectar, buscar, recomendar,
 * confirmar. La creación real vive en `assisted-creation.ts` (I/O).
 */
import { describe, expect, it } from "vitest";
import {
  buildEntityResolution,
  decisionFromRef,
  pendingResolutions,
  rankCatalogMatches,
} from "@/lib/intake/entity-linking";
import { emptyRef } from "@/lib/intake/candidate";
import type { CatalogEntry } from "@/lib/intake/entity-resolution";

const VENUES: CatalogEntry[] = [
  { id: "v1", name: "Millennium Hall" },
  { id: "v2", name: "Imperial Ballroom" },
  { id: "v3", name: "Luminance Events" },
];

const CLIENTS: CatalogEntry[] = [
  { id: "c1", name: "Imperial Catering" },
  { id: "c2", name: "Imperial Catering LLC" },
];

describe("entity-linking", () => {
  it("vincula sin fricción cuando el match es exacto y único", () => {
    const d = buildEntityResolution("venue", "Millennium Hall", VENUES);
    expect(d.status).toBe("linked");
    expect(d.requiresHumanConfirmation).toBe(false);
    expect(d.best?.id).toBe("v1");
  });

  it("recomienda pero exige confirmación ante un typo", () => {
    const d = buildEntityResolution("venue", "Millenium Hall", VENUES);
    expect(d.status).toBe("suggested");
    expect(d.requiresHumanConfirmation).toBe(true);
    expect(d.best?.id).toBe("v1");
    expect(d.explanation).toContain("Millennium Hall");
  });

  it("marca ambigüedad cuando dos opciones empatan", () => {
    const d = buildEntityResolution("client", "Imperial Catering", CLIENTS);
    expect(d.status).toBe("ambiguous");
    expect(d.requiresHumanConfirmation).toBe(true);
    expect(d.options.length).toBeGreaterThan(1);
  });

  it("ofrece crear sólo cuando no existe nada parecido", () => {
    const d = buildEntityResolution("venue", "Rooftop Zeta 9", VENUES);
    expect(d.status).toBe("unknown");
    expect(d.canCreateNew).toBe(true);
    expect(d.requiresHumanConfirmation).toBe(true);
  });

  it("no inventa nada cuando no hay texto detectado", () => {
    const d = buildEntityResolution("client", "   ", CLIENTS);
    expect(d.status).toBe("empty");
    expect(d.requiresHumanConfirmation).toBe(false);
    expect(d.canCreateNew).toBe(false);
  });

  it("respeta el aprendizaje del tenant en una referencia ya resuelta", () => {
    const ref = {
      ...emptyRef("MH"),
      resolvedId: "v1",
      suggestedId: "v1",
      suggestedLabel: "Millennium Hall",
      confidence: 0.9,
      requiresConfirmation: false,
      matchOrigin: "dictionary" as const,
    };
    const d = decisionFromRef("venue", ref, VENUES);
    expect(d.status).toBe("linked");
    expect(d.explanation).toContain("ya aprendió");
  });

  it("ordena las recomendaciones por score y limita a 3", () => {
    const ranked = rankCatalogMatches("Imperial", [...VENUES, ...CLIENTS]);
    expect(ranked.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  it("lista sólo lo que bloquea la creación del servicio", () => {
    const decisions = [
      buildEntityResolution("venue", "Millennium Hall", VENUES),
      buildEntityResolution("client", "Imperial Catering", CLIENTS),
    ];
    expect(pendingResolutions(decisions)).toHaveLength(1);
  });
});
