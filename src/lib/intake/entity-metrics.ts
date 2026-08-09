/**
 * Ecosystem Intake Engine — FASE 1.1: métricas de resolución de entidades.
 *
 * Mide COMPORTAMIENTO, nunca contenido: no guarda nombres de personas,
 * emails, teléfonos ni direcciones. Sólo conteos, ids de empresa y tiempos.
 *
 * Módulo PURO: acumula y construye el evento; el llamador decide qué hacer.
 */

export type EntityResolutionOutcome =
  | "exact_match"
  | "fuzzy_match"
  | "dictionary_match"
  | "manual_correction"
  | "entity_created"
  | "duplicate_prevented"
  | "retry"
  | "failure"
  | "cross_tenant_denied";

export interface EntityResolutionMetrics {
  companyId: string;
  resolutions: number;
  exactMatches: number;
  fuzzyMatches: number;
  dictionaryMatches: number;
  manualCorrections: number;
  entitiesCreated: number;
  duplicatesPrevented: number;
  retries: number;
  failures: number;
  crossTenantDenials: number;
  /** Milisegundos acumulados desde que se abre la resolución hasta confirmar. */
  totalTimeToResolutionMs: number;
  /** Promedio derivado, en milisegundos. */
  averageTimeToResolutionMs: number;
}

export function emptyEntityMetrics(companyId: string): EntityResolutionMetrics {
  return {
    companyId,
    resolutions: 0,
    exactMatches: 0,
    fuzzyMatches: 0,
    dictionaryMatches: 0,
    manualCorrections: 0,
    entitiesCreated: 0,
    duplicatesPrevented: 0,
    retries: 0,
    failures: 0,
    crossTenantDenials: 0,
    totalTimeToResolutionMs: 0,
    averageTimeToResolutionMs: 0,
  };
}

const FIELD_BY_OUTCOME: Record<EntityResolutionOutcome, keyof EntityResolutionMetrics> = {
  exact_match: "exactMatches",
  fuzzy_match: "fuzzyMatches",
  dictionary_match: "dictionaryMatches",
  manual_correction: "manualCorrections",
  entity_created: "entitiesCreated",
  duplicate_prevented: "duplicatesPrevented",
  retry: "retries",
  failure: "failures",
  cross_tenant_denied: "crossTenantDenials",
};

/** Suma un resultado. `elapsedMs` sólo cuenta cuando la resolución se cierra. */
export function recordEntityOutcome(
  metrics: EntityResolutionMetrics,
  outcome: EntityResolutionOutcome,
  elapsedMs = 0,
): EntityResolutionMetrics {
  const field = FIELD_BY_OUTCOME[outcome];
  const next: EntityResolutionMetrics = {
    ...metrics,
    [field]: (metrics[field] as number) + 1,
  } as EntityResolutionMetrics;

  const closes =
    outcome === "exact_match" ||
    outcome === "fuzzy_match" ||
    outcome === "dictionary_match" ||
    outcome === "entity_created";

  if (closes) {
    next.resolutions = metrics.resolutions + 1;
    next.totalTimeToResolutionMs = metrics.totalTimeToResolutionMs + Math.max(0, elapsedMs);
    next.averageTimeToResolutionMs =
      next.resolutions > 0 ? Math.round(next.totalTimeToResolutionMs / next.resolutions) : 0;
  }
  return next;
}

/** Log estructurado, sin contenido sensible. */
export function logEntityMetrics(metrics: EntityResolutionMetrics): void {
  console.info("[intake][entity-resolution][metrics]", metrics);
}
