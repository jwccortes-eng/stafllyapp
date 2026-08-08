/**
 * Smart Service Intake — FASE 5: TENANT LEARNING DICTIONARY (módulo PURO).
 *
 * Memoria operativa POR COMPAÑÍA construida SÓLO con correcciones humanas
 * confirmadas. Sirve a todas las fuentes del carril canónico (excel, csv,
 * texto pegado/WhatsApp, imagen/PDF, audio) porque se aplica en el único
 * punto de resolución compartido (`resolveCandidateEntities`).
 *
 * ORDEN DE RESOLUCIÓN (no negociable):
 *   1. match canónico exacto (catálogo real del tenant)
 *   2. diccionario del tenant (regla activa y con confianza suficiente)
 *   3. resolver fuzzy (sugerencia)
 *   4. sugerencia de IA (suggestion-only)
 *   5. revisión humana
 *
 * REGLAS DURAS:
 *  - Nunca aprende solo: toda regla nace de una confirmación humana.
 *  - Nunca cruza compañías: cada regla vive atada a `company_id`.
 *  - Nunca aprende datos personales ni de pago.
 *  - Una regla ambigua (conflicto) NO se aplica: vuelve a revisión humana.
 *
 * Cero I/O. 100% testeable.
 */

export const DICTIONARY_RULE_TYPES = [
  "venue_alias",
  "client_alias",
  "service_type_alias",
  "role_alias",
  "abbreviation",
  "spelling_variant",
] as const;

export type DictionaryRuleType = (typeof DICTIONARY_RULE_TYPES)[number];

export const RULE_TYPE_LABEL: Record<DictionaryRuleType, string> = {
  venue_alias: "Nombre de lugar",
  client_alias: "Nombre de cliente",
  service_type_alias: "Tipo de servicio",
  role_alias: "Rol",
  abbreviation: "Abreviación",
  spelling_variant: "Variante de escritura",
};

export interface DictionaryRule {
  id: string;
  companyId: string;
  ruleType: DictionaryRuleType;
  inputValue: string;
  inputNormalized: string;
  resolvedValue: string;
  resolvedEntityId: string | null;
  resolvedEntityKind: "location" | "client" | "none" | null;
  learnedFromSource: string | null;
  usageCount: number;
  successCount: number;
  conflictCount: number;
  confidence: number;
  active: boolean;
  notes: string | null;
  version: number;
  confirmedAt: string | null;
  updatedAt: string | null;
}

/**
 * Confianza mínima para aplicar una regla sin volver a preguntar.
 * Debajo de este umbral la regla sólo sugiere.
 */
export const DICTIONARY_APPLY_THRESHOLD = 0.6;

/**
 * Normalización canónica de la clave del diccionario.
 * DEBE coincidir con `public.intake_dictionary_normalize` en el backend:
 * minúsculas, sin acentos, todo lo no alfanumérico → espacio, sin bordes.
 */
export function normalizeDictionaryKey(raw: string | null | undefined): string {
  const source = raw ?? "";
  const deaccented = source.replace(/[\u0300-\u036f]/g, "");
  return deaccented
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Patrones que el diccionario NUNCA debe memorizar. */
const SENSITIVE_PATTERNS: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\+?\d[\d\s().-]{6,}\d/,
  /\b(ssn|social security|passport|pasaporte|routing|iban|salary|salario|rate|tarifa|payroll|n[oó]mina)\b/i,
];

export function isSensitiveDictionaryValue(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  if (!text) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

export interface LearnabilityVerdict {
  learnable: boolean;
  reason?: string;
}

/**
 * ¿Podemos aprender esta corrección? Se exige corrección humana real:
 * el término escrito y su interpretación deben ser distintos y utilizables.
 */
export function canLearnCorrection(input: {
  rawValue: string | null | undefined;
  resolvedValue: string | null | undefined;
}): LearnabilityVerdict {
  const raw = (input.rawValue ?? "").trim();
  const resolved = (input.resolvedValue ?? "").trim();
  if (!raw || !resolved) {
    return { learnable: false, reason: "Falta el término original o su interpretación." };
  }
  if (isSensitiveDictionaryValue(raw) || isSensitiveDictionaryValue(resolved)) {
    return {
      learnable: false,
      reason: "El diccionario no guarda datos personales ni información de pago.",
    };
  }
  const key = normalizeDictionaryKey(raw);
  if (!key) return { learnable: false, reason: "El término no es utilizable." };
  if (key === normalizeDictionaryKey(resolved)) {
    return { learnable: false, reason: "No hay nada que recordar: el texto ya coincide." };
  }
  return { learnable: true };
}

export interface DictionaryLookup {
  rule: DictionaryRule;
  /** true cuando hay más de una regla activa compitiendo (no se aplica sola). */
  ambiguous: boolean;
}

/**
 * Busca en el diccionario del tenant. Devuelve `null` si no hay regla,
 * y marca `ambiguous` cuando existe conflicto entre reglas activas.
 */
export function lookupDictionary(
  raw: string | null | undefined,
  rules: DictionaryRule[] | null | undefined,
  ruleTypes: DictionaryRuleType[],
): DictionaryLookup | null {
  const key = normalizeDictionaryKey(raw);
  if (!key || !rules?.length) return null;

  const matches = rules.filter(
    (r) => r.active && r.inputNormalized === key && ruleTypes.includes(r.ruleType),
  );
  if (matches.length === 0) return null;

  const distinct = new Set(
    matches.map((r) => r.resolvedEntityId ?? normalizeDictionaryKey(r.resolvedValue)),
  );
  const best = matches
    .slice()
    .sort((a, b) => b.confidence - a.confidence || b.successCount - a.successCount)[0];

  return { rule: best, ambiguous: distinct.size > 1 };
}

/** ¿La regla es lo bastante sólida para aplicarse sin preguntar otra vez? */
export function isApplicableRule(lookup: DictionaryLookup | null): boolean {
  if (!lookup) return false;
  if (lookup.ambiguous) return false;
  return lookup.rule.active && lookup.rule.confidence >= DICTIONARY_APPLY_THRESHOLD;
}

/**
 * Expansión de texto libre (tipos de servicio, roles, abreviaciones).
 * Sólo reemplaza el término completo; nunca reescribe frases enteras.
 */
export function expandWithDictionary(
  value: string | null | undefined,
  rules: DictionaryRule[] | null | undefined,
  ruleTypes: DictionaryRuleType[] = ["service_type_alias", "role_alias", "abbreviation", "spelling_variant"],
): { value: string | null; ruleId: string | null } {
  const text = (value ?? "").trim();
  if (!text) return { value: value ?? null, ruleId: null };
  const lookup = lookupDictionary(text, rules, ruleTypes);
  if (!isApplicableRule(lookup) || !lookup) return { value: text, ruleId: null };
  return { value: lookup.rule.resolvedValue, ruleId: lookup.rule.id };
}

/** Conflictos activos del diccionario (mismo término, distinta interpretación). */
export interface DictionaryConflict {
  key: string;
  ruleType: DictionaryRuleType;
  rules: DictionaryRule[];
}

export function findDictionaryConflicts(rules: DictionaryRule[]): DictionaryConflict[] {
  const groups = new Map<string, DictionaryRule[]>();
  for (const rule of rules) {
    if (!rule.active) continue;
    const key = `${rule.ruleType}|${rule.inputNormalized}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  const conflicts: DictionaryConflict[] = [];
  for (const [key, group] of groups) {
    const distinct = new Set(
      group.map((r) => r.resolvedEntityId ?? normalizeDictionaryKey(r.resolvedValue)),
    );
    if (group.length > 1 && distinct.size > 1) {
      conflicts.push({
        key: group[0].inputNormalized,
        ruleType: group[0].ruleType,
        rules: group,
      });
    }
    void key;
  }
  return conflicts;
}

/** Mapea la fila del backend al modelo del cliente. */
export function mapDictionaryRow(row: Record<string, any>): DictionaryRule {
  return {
    id: row.id,
    companyId: row.company_id,
    ruleType: row.rule_type,
    inputValue: row.input_value ?? "",
    inputNormalized: row.input_normalized ?? normalizeDictionaryKey(row.input_value),
    resolvedValue: row.resolved_value ?? "",
    resolvedEntityId: row.resolved_entity_id ?? null,
    resolvedEntityKind: row.resolved_entity_kind ?? null,
    learnedFromSource: row.learned_from_source ?? null,
    usageCount: row.usage_count ?? 0,
    successCount: row.success_count ?? 0,
    conflictCount: row.conflict_count ?? 0,
    confidence: Number(row.confidence ?? 0),
    active: row.active !== false,
    notes: row.notes ?? null,
    version: row.version ?? 1,
    confirmedAt: row.confirmed_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}
