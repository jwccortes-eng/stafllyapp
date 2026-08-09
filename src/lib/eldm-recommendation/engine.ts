/**
 * ELDM Fase 1C — motor de recomendación de workers (puro, read-only).
 *
 * "¿Qué workers conviene considerar para este servicio?"
 *
 * - ELDM aporta contexto; el admin decide. No asigna, no publica, no invita.
 * - Los filtros duros salen de `eligibility.ts` (reglas operativas canónicas).
 * - El orden se deriva de contadores explicables, nunca de un score opaco.
 * - Cero I/O: recibe candidatos y señales ya acotadas al tenant.
 */
import {
  buildPersonPatterns,
  getDecisionContext,
  type EcosystemSignal,
  type KnowledgeItem,
} from "@/lib/eldm";
import { confidenceLabel } from "@/lib/eldm-adapters/explainability";
import { evaluateEligibility } from "./eligibility";
import type {
  RecommendationEvidence,
  RecommendationSortMode,
  WorkerCandidateInput,
  WorkerRecommendation,
  WorkerRecommendationQuery,
  WorkerRecommendationResult,
} from "./types";

const POSITIVE_VERBS = new Set(["worked", "service_completed", "rated_positive"]);
const NEGATIVE_VERBS = new Set(["no_show", "rated_negative", "cancelled_by_worker"]);

export interface WorkerRecommendationInput {
  query: WorkerRecommendationQuery;
  candidates: WorkerCandidateInput[];
  /** Señales vigentes por persona, ya acotadas a `query.companyId`. */
  signalsByPerson: Map<string, EcosystemSignal[]>;
  sort?: RecommendationSortMode;
}

function count(signals: EcosystemSignal[], predicate: (s: EcosystemSignal) => boolean): number {
  return signals.filter(predicate).length;
}

function lastAt(signals: EcosystemSignal[]): string | null {
  const dates = signals.map((s) => s.occurredAt).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function evidence(
  code: string,
  text: string,
  evidenceCount: number,
  lastObservedAt: string | null,
): RecommendationEvidence {
  return { code, text, evidenceCount, lastObservedAt };
}

/** Contadores explicables. Sólo hechos operativos, nunca datos sensibles. */
function summarize(signals: EcosystemSignal[], q: WorkerRecommendationQuery) {
  const sameVenue = q.venueId ? signals.filter((s) => s.subject.venueId === q.venueId) : [];
  const sameClient = q.clientId ? signals.filter((s) => s.subject.clientId === q.clientId) : [];
  const sameType = q.serviceType
    ? signals.filter((s) => s.subject.serviceType === q.serviceType)
    : [];

  return {
    venueExperience: count(sameVenue, (s) => POSITIVE_VERBS.has(s.verb)),
    clientExperience: count(sameClient, (s) => POSITIVE_VERBS.has(s.verb)),
    serviceTypeExperience: count(sameType, (s) => POSITIVE_VERBS.has(s.verb)),
    acceptedCount: count(signals, (s) => s.verb === "accepted"),
    rejectedCount: count(signals, (s) => s.verb === "rejected"),
    positiveOutcomes: count(signals, (s) => POSITIVE_VERBS.has(s.verb)),
    negativeOutcomes: count(signals, (s) => NEGATIVE_VERBS.has(s.verb)),
    lastRelevantActivityAt: lastAt(signals),
  };
}

/** 2–4 razones máximas, en lenguaje de negocio. */
function buildSupporting(
  s: ReturnType<typeof summarize>,
  candidate: WorkerCandidateInput,
  items: KnowledgeItem[],
): RecommendationEvidence[] {
  const out: RecommendationEvidence[] = [];
  if (s.venueExperience > 0)
    out.push(
      evidence(
        "venue_experience",
        `Trabajó ${s.venueExperience} ${s.venueExperience === 1 ? "vez" : "veces"} en este lugar.`,
        s.venueExperience,
        s.lastRelevantActivityAt,
      ),
    );
  if (s.clientExperience > 0)
    out.push(
      evidence(
        "client_experience",
        `Trabajó ${s.clientExperience} ${s.clientExperience === 1 ? "vez" : "veces"} para este cliente.`,
        s.clientExperience,
        s.lastRelevantActivityAt,
      ),
    );
  if (s.serviceTypeExperience > 0)
    out.push(
      evidence(
        "service_type_experience",
        `Tiene experiencia en este tipo de servicio (${s.serviceTypeExperience}).`,
        s.serviceTypeExperience,
        s.lastRelevantActivityAt,
      ),
    );
  const responses = s.acceptedCount + s.rejectedCount;
  if (s.acceptedCount > 0)
    out.push(
      evidence(
        "acceptance",
        `Aceptó ${s.acceptedCount} de ${responses} servicios similares.`,
        s.acceptedCount,
        s.lastRelevantActivityAt,
      ),
    );
  if (s.positiveOutcomes > 0)
    out.push(
      evidence(
        "positive_outcomes",
        `Últimos resultados positivos: ${s.positiveOutcomes}.`,
        s.positiveOutcomes,
        s.lastRelevantActivityAt,
      ),
    );
  if (candidate.availability === "available")
    out.push(evidence("availability", "Disponibilidad confirmada para esta fecha.", 1, null));
  if (candidate.compliance === "current")
    out.push(evidence("compliance", "Documentación vigente.", 1, null));

  // Preferencias confirmadas por la persona (sólo si ELDM las expone).
  for (const item of items.filter((i) => i.kind === "confirmed_preference")) {
    out.push(
      evidence("confirmed_preference", item.explanation, item.confidence.evidenceCount, item.confidence.lastObservedAt),
    );
  }

  return out.slice(0, 4);
}

function buildContradicting(
  s: ReturnType<typeof summarize>,
  items: KnowledgeItem[],
): RecommendationEvidence[] {
  const out: RecommendationEvidence[] = [];
  if (s.rejectedCount > 0)
    out.push(
      evidence(
        "rejections",
        `Rechazó ${s.rejectedCount} ${s.rejectedCount === 1 ? "servicio" : "servicios"} recientes.`,
        s.rejectedCount,
        s.lastRelevantActivityAt,
      ),
    );
  if (s.negativeOutcomes > 0)
    out.push(
      evidence(
        "negative_outcomes",
        `Registra ${s.negativeOutcomes} ${s.negativeOutcomes === 1 ? "resultado" : "resultados"} no favorables.`,
        s.negativeOutcomes,
        s.lastRelevantActivityAt,
      ),
    );
  for (const item of items.filter((i) => i.confidence.contradictingEvidence > 0)) {
    out.push(
      evidence(
        `pattern:${item.key}`,
        item.explanation,
        item.confidence.contradictingEvidence,
        item.confidence.lastObservedAt,
      ),
    );
  }
  return out.slice(0, 3);
}

/** Motivo no penalizante de por qué alguien no aparece arriba. */
function notHighlightedReason(
  s: ReturnType<typeof summarize>,
  q: WorkerRecommendationQuery,
): string | null {
  if (s.positiveOutcomes === 0 && s.acceptedCount === 0)
    return "Todavía no hay historial comparable con esta compañía.";
  if (q.venueId && s.venueExperience === 0) return "Sin historial en este lugar.";
  if (q.serviceType && s.serviceTypeExperience === 0)
    return "Sin historial en este tipo de servicio.";
  return "Evidencia limitada para este contexto.";
}

function headlineFor(
  candidate: WorkerCandidateInput,
  supporting: RecommendationEvidence[],
): string {
  if (supporting.length === 0)
    return `Sin historial suficiente para ${candidate.name}. Decide con criterio propio.`;
  return `Recomendado porque ${supporting
    .slice(0, 3)
    .map((r) => r.text.replace(/\.$/, "").toLowerCase())
    .join("; ")}.`;
}

const SORTERS: Record<
  RecommendationSortMode,
  (a: WorkerRecommendation, b: WorkerRecommendation) => number
> = {
  best_context: (a, b) =>
    b.contextConfidence - a.contextConfidence ||
    b.supporting.length - a.supporting.length ||
    b.venueExperience - a.venueExperience,
  venue_experience: (a, b) => b.venueExperience - a.venueExperience,
  availability: (a, b) => Number(b.availability === "available") - Number(a.availability === "available"),
  acceptance_history: (a, b) => b.acceptedCount - a.acceptedCount,
  recent_outcomes: (a, b) =>
    (b.lastRelevantActivityAt ?? "").localeCompare(a.lastRelevantActivityAt ?? "") ||
    b.positiveOutcomes - a.positiveOutcomes,
};

/**
 * Genera recomendaciones explicables. No asigna ni ordena la realidad:
 * devuelve recomendados, otros elegibles y no elegibles, todos visibles.
 */
export function getWorkerRecommendations(
  input: WorkerRecommendationInput,
): WorkerRecommendationResult {
  const { query, candidates, signalsByPerson } = input;
  const sort = input.sort ?? "best_context";
  const now = query.now ?? new Date().toISOString();

  const rows: WorkerRecommendation[] = candidates.map((candidate) => {
    const blockers = evaluateEligibility(candidate, query);
    const signals = (signalsByPerson.get(candidate.personId) ?? []).filter(
      // Tenant safety: nunca se usa historia de otra compañía.
      (s) => !s.subject.companyId || s.subject.companyId === query.companyId,
    );

    const items = buildPersonPatterns({
      personId: candidate.personId,
      companyId: query.companyId,
      signals,
      now,
    });

    const context = getDecisionContext(
      {
        companyId: query.companyId,
        personId: candidate.personId,
        venueId: query.venueId,
        clientId: query.clientId,
        serviceType: query.serviceType,
        decisionType: "recommend_worker",
        now,
      },
      { items },
    );

    const summary = summarize(signals, query);
    const supporting = buildSupporting(summary, candidate, items);
    const contradicting = buildContradicting(summary, items);

    return {
      personId: candidate.personId,
      name: candidate.name,
      role: candidate.role ?? null,
      eligible: blockers.length === 0,
      blockers,
      availability: candidate.availability,
      compliance: candidate.compliance,
      confidence: confidenceLabel(context.confidence),
      contextConfidence: context.confidence,
      headline: headlineFor(candidate, supporting),
      supporting,
      contradicting,
      lastRelevantActivityAt: summary.lastRelevantActivityAt,
      venueExperience: summary.venueExperience,
      clientExperience: summary.clientExperience,
      serviceTypeExperience: summary.serviceTypeExperience,
      acceptedCount: summary.acceptedCount,
      rejectedCount: summary.rejectedCount,
      positiveOutcomes: summary.positiveOutcomes,
      negativeOutcomes: summary.negativeOutcomes,
      notHighlightedReason: notHighlightedReason(summary, query),
    };
  });

  const eligible = rows.filter((r) => r.eligible);
  const notEligible = rows.filter((r) => !r.eligible);

  const withContext = eligible.filter((r) => r.supporting.length > 0 && r.contextConfidence > 0);
  const withoutContext = eligible.filter((r) => !withContext.includes(r));

  withContext.sort(SORTERS[sort]);
  withoutContext.sort((a, b) => a.name.localeCompare(b.name));

  const limit = query.limit ?? withContext.length;

  return {
    query,
    sort,
    recommended: withContext.slice(0, limit),
    otherEligible: [...withContext.slice(limit), ...withoutContext],
    notEligible,
    generatedAt: now,
  };
}
