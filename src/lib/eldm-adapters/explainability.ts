/**
 * ELDM Fase 1B — explicabilidad de cara al usuario.
 * Nunca un número suelto: evidencia, contradicciones, alcance y motivo humano.
 */
import { describeScope, STRONG_CONFIDENCE, type DecisionContext, type KnowledgeItem } from "@/lib/eldm";

export type ConfidenceLabel = "HIGH" | "MEDIUM" | "LOW";

export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= STRONG_CONFIDENCE) return "HIGH";
  if (confidence >= 0.4) return "MEDIUM";
  return "LOW";
}

export interface ExplainedRecommendation {
  label: ConfidenceLabel;
  confidence: number;
  /** Frase de negocio: "Recomendado porque…". */
  headline: string;
  reasons: Array<{ text: string; evidenceCount: number; weight: number }>;
  contradictions: string[];
  lastObservedAt: string | null;
  scopes: string[];
  evidenceCount: number;
}

function lastObserved(items: KnowledgeItem[]): string | null {
  const dates = items.map((i) => i.confidence.lastObservedAt).filter((d): d is string => !!d);
  return dates.length ? dates.sort().at(-1)! : null;
}

/** Traduce un `DecisionContext` en una explicación mostrable. No decide nada. */
export function explainRecommendation(context: DecisionContext): ExplainedRecommendation {
  const all = [
    ...context.facts,
    ...context.confirmedPreferences,
    ...context.historicalPatterns,
    ...context.inferredPatterns,
    ...context.relevantOutcomes,
  ];
  const evidenceCount = all.reduce((s, i) => s + i.confidence.evidenceCount, 0);
  const headline =
    context.reasons.length === 0
      ? "Sin historial suficiente. Decide con criterio propio."
      : `Recomendado porque ${context.reasons
          .slice(0, 3)
          .map((r) => r.text.replace(/\.$/, "").toLowerCase())
          .join("; ")}.`;

  return {
    label: confidenceLabel(context.confidence),
    confidence: context.confidence,
    headline,
    reasons: context.reasons.map((r) => ({
      text: r.text,
      evidenceCount: r.evidenceCount,
      weight: r.weight,
    })),
    contradictions: context.contradictingEvidence.map((i) => i.explanation),
    lastObservedAt: lastObserved(all),
    scopes: Array.from(new Set(all.map((i) => describeScope(i.scope)))),
    evidenceCount,
  };
}
