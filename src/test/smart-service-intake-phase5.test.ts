/**
 * SMART SERVICE INTAKE — FASE 5: TENANT LEARNING DICTIONARY.
 *
 * Cubre las invariantes duras del diccionario por compañía:
 *  - aislamiento total entre tenants;
 *  - orden de resolución: exacto canónico > diccionario > fuzzy;
 *  - reutilización entre fuentes (audio → imagen → texto);
 *  - conflictos nunca automáticos;
 *  - jamás aprende datos personales ni de pago.
 */
import { describe, it, expect } from "vitest";
import {
  canLearnCorrection,
  expandWithDictionary,
  findDictionaryConflicts,
  isApplicableRule,
  isSensitiveDictionaryValue,
  lookupDictionary,
  mapDictionaryRow,
  normalizeDictionaryKey,
  type DictionaryRule,
} from "@/lib/intake/dictionary";
import { resolveCandidateEntities, type IntakeCatalogs } from "@/lib/intake/text-intake";
import { createCandidate } from "@/lib/intake/candidate";

const COMPANY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const VENUE_MILLENNIUM = "11111111-1111-1111-1111-111111111111";
const VENUE_ZEMER = "22222222-2222-2222-2222-222222222222";

function rule(partial: Partial<DictionaryRule> = {}): DictionaryRule {
  return {
    id: partial.id ?? "rule-1",
    companyId: partial.companyId ?? COMPANY_A,
    ruleType: partial.ruleType ?? "venue_alias",
    inputValue: partial.inputValue ?? "BM",
    inputNormalized:
      partial.inputNormalized ?? normalizeDictionaryKey(partial.inputValue ?? "BM"),
    resolvedValue: partial.resolvedValue ?? "Millennium Hall",
    resolvedEntityId: partial.resolvedEntityId ?? VENUE_MILLENNIUM,
    resolvedEntityKind: partial.resolvedEntityKind ?? "location",
    learnedFromSource: partial.learnedFromSource ?? "voice_note",
    usageCount: partial.usageCount ?? 3,
    successCount: partial.successCount ?? 3,
    conflictCount: partial.conflictCount ?? 0,
    confidence: partial.confidence ?? 0.8,
    active: partial.active ?? true,
    notes: null,
    version: partial.version ?? 1,
    confirmedAt: null,
    updatedAt: null,
  };
}

function catalogs(dictionary: DictionaryRule[] = []): IntakeCatalogs {
  return {
    clients: [{ id: "client-1", name: "Zemer Catering" }],
    venues: [
      { id: VENUE_MILLENNIUM, name: "Millennium Hall" },
      { id: VENUE_ZEMER, name: "Zemer Ballroom" },
    ],
    dictionary,
  };
}

function candidate(raw: string, extra: Record<string, any> = {}) {
  return createCandidate({
    id: "c1",
    companyId: COMPANY_A,
    source: "pasted_text",
    serviceDate: "2026-08-20",
    startTime: "17:00",
    endTime: "23:00",
    venueCandidate: {
      raw,
      resolvedId: null,
      suggestedId: null,
      suggestedLabel: null,
      confidence: 0,
      requiresConfirmation: false,
    },
    ...extra,
  });
}

describe("normalización y guardas", () => {
  it("normaliza igual que el backend (minúsculas, sin acentos, sin símbolos)", () => {
    expect(normalizeDictionaryKey("  Millénnium-Hall! ")).toBe("millennium hall");
    expect(normalizeDictionaryKey("B.M.")).toBe("b m");
  });

  it("bloquea datos personales y de pago", () => {
    expect(isSensitiveDictionaryValue("juan@empresa.com")).toBe(true);
    expect(isSensitiveDictionaryValue("+1 917 555 1234")).toBe(true);
    expect(isSensitiveDictionaryValue("tarifa 25")).toBe(true);
    expect(isSensitiveDictionaryValue("Millennium Hall")).toBe(false);
  });

  it("sólo aprende correcciones reales", () => {
    expect(canLearnCorrection({ rawValue: "BM", resolvedValue: "Millennium Hall" }).learnable).toBe(true);
    expect(canLearnCorrection({ rawValue: "BM", resolvedValue: "b.m." }).learnable).toBe(false);
    expect(canLearnCorrection({ rawValue: "", resolvedValue: "X" }).learnable).toBe(false);
    expect(
      canLearnCorrection({ rawValue: "contacto", resolvedValue: "juan@empresa.com" }).learnable,
    ).toBe(false);
  });
});

describe("aislamiento por compañía", () => {
  it("una regla de la empresa A nunca se carga en catálogos de la empresa B", () => {
    // El store filtra por company_id; aquí verificamos el modelo puro:
    const ruleA = rule({ companyId: COMPANY_A });
    const dictionaryOfB = [ruleA].filter((r) => r.companyId === COMPANY_B);
    expect(lookupDictionary("BM", dictionaryOfB, ["venue_alias"])).toBeNull();
    expect(lookupDictionary("BM", [ruleA], ["venue_alias"])?.rule.companyId).toBe(COMPANY_A);
  });

  it("resolver con el diccionario de otra empresa no resuelve nada", () => {
    const resolved = resolveCandidateEntities(candidate("BM"), catalogs([]));
    expect(resolved.venueCandidate.resolvedId).toBeNull();
    expect(resolved.venueCandidate.matchOrigin).not.toBe("dictionary");
  });
});

describe("orden de resolución", () => {
  it("el match canónico exacto gana sobre el diccionario", () => {
    const misleading = rule({
      inputValue: "Millennium Hall",
      resolvedEntityId: VENUE_ZEMER,
      resolvedValue: "Zemer Ballroom",
    });
    const resolved = resolveCandidateEntities(candidate("Millennium Hall"), catalogs([misleading]));
    expect(resolved.venueCandidate.resolvedId).toBe(VENUE_MILLENNIUM);
    expect(resolved.venueCandidate.matchOrigin).toBe("exact");
  });

  it("el diccionario gana sobre el fuzzy y no pide confirmación", () => {
    const resolved = resolveCandidateEntities(candidate("BM"), catalogs([rule()]));
    expect(resolved.venueCandidate.resolvedId).toBe(VENUE_MILLENNIUM);
    expect(resolved.venueCandidate.requiresConfirmation).toBe(false);
    expect(resolved.venueCandidate.matchOrigin).toBe("dictionary");
    expect(resolved.venueCandidate.dictionaryRuleId).toBe("rule-1");
  });

  it("sin regla, el fuzzy sigue pidiendo confirmación humana", () => {
    const resolved = resolveCandidateEntities(candidate("Millenium Hal"), catalogs([]));
    expect(resolved.venueCandidate.resolvedId).toBeNull();
    expect(resolved.venueCandidate.requiresConfirmation).toBe(true);
    expect(resolved.venueCandidate.matchOrigin).toBe("fuzzy");
  });

  it("una regla que apunta a un lugar inexistente no se aplica", () => {
    const stale = rule({ resolvedEntityId: "99999999-9999-9999-9999-999999999999" });
    const resolved = resolveCandidateEntities(candidate("BM"), catalogs([stale]));
    expect(resolved.venueCandidate.resolvedId).toBeNull();
  });
});

describe("confianza y conflictos", () => {
  it("una regla de baja confianza no se aplica sola", () => {
    const weak = rule({ confidence: 0.4 });
    expect(isApplicableRule(lookupDictionary("BM", [weak], ["venue_alias"]))).toBe(false);
    const resolved = resolveCandidateEntities(candidate("BM"), catalogs([weak]));
    expect(resolved.venueCandidate.resolvedId).toBeNull();
    expect(resolved.venueCandidate.requiresConfirmation).toBe(true);
  });

  it("una regla desactivada deja de aplicarse", () => {
    const off = rule({ active: false });
    expect(lookupDictionary("BM", [off], ["venue_alias"])).toBeNull();
  });

  it("dos interpretaciones del mismo término son ambiguas y vuelven a revisión", () => {
    const a = rule({ id: "r-a" });
    const b = rule({ id: "r-b", resolvedEntityId: VENUE_ZEMER, resolvedValue: "Zemer Ballroom" });
    const lookup = lookupDictionary("BM", [a, b], ["venue_alias"]);
    expect(lookup?.ambiguous).toBe(true);
    expect(isApplicableRule(lookup)).toBe(false);

    const resolved = resolveCandidateEntities(candidate("BM"), catalogs([a, b]));
    expect(resolved.venueCandidate.resolvedId).toBeNull();
    expect(resolved.venueCandidate.requiresConfirmation).toBe(true);
    expect(findDictionaryConflicts([a, b])).toHaveLength(1);
  });

  it("no reporta conflicto cuando ambas reglas apuntan al mismo lugar", () => {
    const a = rule({ id: "r-a" });
    const b = rule({ id: "r-b" });
    expect(findDictionaryConflicts([a, b])).toHaveLength(0);
  });
});

describe("reutilización entre fuentes", () => {
  it("lo aprendido desde una nota de voz se aplica a imagen y a texto", () => {
    const learned = rule({ learnedFromSource: "voice_note" });
    const sources = ["image", "pdf", "whatsapp_text", "excel"] as const;
    for (const source of sources) {
      const c = createCandidate({
        id: `c-${source}`,
        companyId: COMPANY_A,
        source,
        serviceDate: "2026-08-20",
        startTime: "17:00",
        endTime: "23:00",
        venueCandidate: {
          raw: "bm",
          resolvedId: null,
          suggestedId: null,
          suggestedLabel: null,
          confidence: 0,
          requiresConfirmation: false,
        },
      });
      const resolved = resolveCandidateEntities(c, catalogs([learned]));
      expect(resolved.venueCandidate.resolvedId).toBe(VENUE_MILLENNIUM);
      expect(resolved.venueCandidate.matchOrigin).toBe("dictionary");
    }
  });

  it("expande abreviaciones de tipo de servicio y roles", () => {
    const typeRule = rule({
      id: "r-type",
      ruleType: "service_type_alias",
      inputValue: "BM",
      resolvedValue: "Bar Mitzvah",
      resolvedEntityId: null,
      resolvedEntityKind: "none",
    });
    const roleRule = rule({
      id: "r-role",
      ruleType: "role_alias",
      inputValue: "srv",
      resolvedValue: "Mesero",
      resolvedEntityId: null,
      resolvedEntityKind: "none",
    });
    expect(expandWithDictionary("BM", [typeRule]).value).toBe("Bar Mitzvah");
    const resolved = resolveCandidateEntities(
      candidate("Millennium Hall", { serviceType: "BM", roleCandidates: ["srv"] }),
      catalogs([typeRule, roleRule]),
    );
    expect(resolved.serviceType).toBe("Bar Mitzvah");
    expect(resolved.roleCandidates).toEqual(["Mesero"]);
  });
});

describe("mapeo de filas", () => {
  it("mapea la fila del backend sin perder evidencia", () => {
    const mapped = mapDictionaryRow({
      id: "x",
      company_id: COMPANY_A,
      rule_type: "venue_alias",
      input_value: "BM",
      input_normalized: "bm",
      resolved_value: "Millennium Hall",
      resolved_entity_id: VENUE_MILLENNIUM,
      resolved_entity_kind: "location",
      usage_count: 5,
      success_count: 4,
      conflict_count: 1,
      confidence: "0.750",
      active: true,
      version: 3,
    });
    expect(mapped.confidence).toBeCloseTo(0.75);
    expect(mapped.version).toBe(3);
    expect(mapped.resolvedEntityId).toBe(VENUE_MILLENNIUM);
  });
});
