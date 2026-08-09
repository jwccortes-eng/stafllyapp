/**
 * ELDM — decision-context.ts
 * `getDecisionContext` sólo aporta contexto. NUNCA ejecuta la decisión.
 */
import { STRONG_CONFIDENCE } from "./confidence";
import { filterReadable, type ReaderContext } from "./scopes";
import type {
  DecisionContext,
  DecisionContextQuery,
  DecisionReason,
  KnowledgeItem,
} from "./types";

/** Memoria disponible para responder la consulta (ya cargada por un adaptador). */
export interface MemorySnapshot {
  items: KnowledgeItem[];
}

function matchesSubject(item: KnowledgeItem, q: DecisionContextQuery): boolean {
  const s = item.subject;
  if (q.personId && s.personId && s.personId !== q.personId) return false;
  if (q.venueId && s.venueId && s.venueId !== q.venueId) return false;
  if (q.clientId && s.clientId && s.clientId !== q.clientId) return false;
  if (q.serviceType && s.serviceType && s.serviceType !== q.serviceType) return false;
  if (s.companyId && s.companyId !== q.companyId) return false;
  return true;
}

function reasonFrom(item: KnowledgeItem): DecisionReason {
  return {
    code: item.key,
    text: item.explanation,
    weight: item.kind === "fact" || item.kind === "confirmed_preference" ? 1 : item.confidence.confidence,
    evidenceCount: item.confidence.evidenceCount,
    sourceDomains: item.confidence.sourceDomains,
  };
}

/**
 * Devuelve hechos, preferencias confirmadas, patrones, contradicciones,
 * decisiones previas, outcomes y una explicación en lenguaje de negocio.
 */
export function getDecisionContext(
  query: DecisionContextQuery,
  snapshot: MemorySnapshot,
): DecisionContext {
  const now = query.now ?? new Date().toISOString();
  const reader: ReaderContext = {
    companyId: query.companyId,
    personId: query.personId,
    personConsent: query.personConsent,
  };

  const visible = filterReadable(snapshot.items, reader)
    .filter((i) => !i.supersededBy)
    .filter((i) => matchesSubject(i, query));

  const byKind = (kind: KnowledgeItem["kind"]) => visible.filter((i) => i.kind === kind);

  const facts = byKind("fact");
  const confirmedPreferences = byKind("confirmed_preference");
  const historicalPatterns = byKind("observation");
  const inferredPatterns = byKind("inference");
  const priorDecisions = byKind("decision");
  const relevantOutcomes = byKind("outcome");
  const contradictingEvidence = visible.filter((i) => i.confidence.contradictingEvidence > 0);

  const reasons: DecisionReason[] = [
    ...facts,
    ...confirmedPreferences,
    ...inferredPatterns.filter((i) => i.confidence.confidence >= 0.5),
    ...historicalPatterns,
  ]
    .map(reasonFrom)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);

  const weights = reasons.map((r) => r.weight);
  const confidence = weights.length
    ? Number((weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(4))
    : 0;

  return {
    query: { ...query, now },
    facts,
    confirmedPreferences,
    historicalPatterns,
    inferredPatterns,
    priorDecisions,
    relevantOutcomes,
    contradictingEvidence,
    reasons,
    explanation: explainContext(reasons, contradictingEvidence, confidence),
    confidence,
  };
}

/** Frase de negocio. Nunca un score suelto. */
export function explainContext(
  reasons: DecisionReason[],
  contradicting: KnowledgeItem[],
  confidence: number,
): string {
  if (reasons.length === 0) return "Sin historial suficiente. Decide con criterio propio.";
  const head = reasons
    .slice(0, 3)
    .map((r) => r.text)
    .join(" · ");
  const strength = confidence >= STRONG_CONFIDENCE ? "Patrón consistente" : "Señal preliminar";
  const caveat =
    contradicting.length > 0
      ? ` Hay ${contradicting.length} evidencia(s) en contra que conviene revisar.`
      : "";
  return `${strength}: ${head}.${caveat}`;
}
