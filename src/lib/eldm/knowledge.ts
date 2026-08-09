/**
 * ELDM — knowledge.ts
 * Traduce señales en conocimiento tipado. Nada se promueve solo.
 */
import { computeConfidence, isUsableInference, MIN_EVIDENCE_FOR_INFERENCE } from "./confidence";
import { stripSensitiveAttributes } from "./scopes";
import type {
  ConfidenceEnvelope,
  EcosystemSignal,
  KnowledgeItem,
  KnowledgeKind,
  KnowledgeScope,
  KnowledgeSubject,
} from "./types";

/** Verbos que contradicen a un patrón dado. Explícito, no adivinado. */
const CONTRADICTS: Record<string, string[]> = {
  accepted: ["rejected", "no_show", "cancelled_by_worker"],
  worked: ["no_show"],
  rated_positive: ["rated_negative"],
  documents_valid: ["documents_expired"],
};

export interface NormalizedSignal extends EcosystemSignal {}

/** Toda señal entra por aquí: se limpia y queda auditable. */
export function normalizeSignal(signal: EcosystemSignal): NormalizedSignal {
  return { ...signal, attributes: stripSensitiveAttributes(signal.attributes) };
}

function itemId(kind: KnowledgeKind, key: string, subject: KnowledgeSubject): string {
  const parts = [
    kind,
    key,
    subject.personId ?? "-",
    subject.companyId ?? "-",
    subject.venueId ?? "-",
    subject.clientId ?? "-",
    subject.serviceType ?? "-",
  ];
  return parts.join("|");
}

function envelopeFor(signals: EcosystemSignal[], scope: KnowledgeScope, now: string): ConfidenceEnvelope {
  return computeConfidence({
    supporting: signals,
    contradicting: [],
    tenantScope: scope.level,
    now,
  });
}

/** FACT — hecho confirmado y trazable. Confianza plena, sin inferencia. */
export function toFact(signal: EcosystemSignal, explanation: string): KnowledgeItem {
  const s = normalizeSignal(signal);
  return {
    id: itemId("fact", `${s.domain}:${s.verb}`, s.subject),
    kind: "fact",
    subject: s.subject,
    scope: s.scope,
    key: `${s.domain}:${s.verb}`,
    value: s.evidenceRef ?? true,
    explanation,
    confidence: {
      evidenceCount: 1,
      contradictingEvidence: 0,
      confidence: 1,
      lastObservedAt: s.occurredAt,
      sourceDomains: [s.domain],
      tenantScope: s.scope.level,
    },
    createdAt: s.occurredAt,
  };
}

export interface AggregateInput {
  key: string;
  subject: KnowledgeSubject;
  scope: KnowledgeScope;
  supporting: EcosystemSignal[];
  contradicting: EcosystemSignal[];
  now: string;
}

/** OBSERVATION — conteo histórico. Describe, no predice. */
export function toObservation(input: AggregateInput): KnowledgeItem {
  const total = input.supporting.length + input.contradicting.length;
  const confidence = computeConfidence({
    supporting: input.supporting,
    contradicting: input.contradicting,
    tenantScope: input.scope.level,
    now: input.now,
  });
  return {
    id: itemId("observation", input.key, input.subject),
    kind: "observation",
    subject: input.subject,
    scope: input.scope,
    key: input.key,
    value: `${input.supporting.length}/${total}`,
    explanation: `Registrado ${input.supporting.length} de ${total} veces.`,
    confidence,
    createdAt: input.now,
  };
}

/**
 * INFERENCE — patrón. Sólo existe si hay volumen mínimo.
 * Una observación aislada nunca se convierte en patrón, y un patrón nunca
 * se convierte en preferencia confirmada sin declaración humana.
 */
export function toInference(input: AggregateInput, explanation: string): KnowledgeItem | null {
  if (input.supporting.length < MIN_EVIDENCE_FOR_INFERENCE) return null;
  const confidence = computeConfidence({
    supporting: input.supporting,
    contradicting: input.contradicting,
    tenantScope: input.scope.level,
    now: input.now,
  });
  if (!isUsableInference(confidence)) return null;
  return {
    id: itemId("inference", input.key, input.subject),
    kind: "inference",
    subject: input.subject,
    scope: input.scope,
    key: input.key,
    value: confidence.confidence,
    explanation,
    confidence,
    createdAt: input.now,
  };
}

/** CONFIRMED PREFERENCE — sólo con declaración explícita de la persona. */
export function toConfirmedPreference(params: {
  personId: string;
  key: string;
  value: string;
  explanation: string;
  declaredAt: string;
  consented: boolean;
}): KnowledgeItem {
  const subject: KnowledgeSubject = { personId: params.personId };
  const scope: KnowledgeScope = {
    level: "person",
    personId: params.personId,
    consented: params.consented,
  };
  return {
    id: itemId("confirmed_preference", params.key, subject),
    kind: "confirmed_preference",
    subject,
    scope,
    key: params.key,
    value: params.value,
    explanation: params.explanation,
    confidence: {
      evidenceCount: 1,
      contradictingEvidence: 0,
      confidence: 1,
      lastObservedAt: params.declaredAt,
      sourceDomains: ["passport"],
      tenantScope: "person",
    },
    createdAt: params.declaredAt,
  };
}

/** DECISION — lo que una persona decidió, con su contexto. Nunca "error". */
export function toDecision(signal: EcosystemSignal, explanation: string): KnowledgeItem {
  const s = normalizeSignal(signal);
  return {
    id: itemId("decision", `${s.domain}:${s.verb}`, s.subject),
    kind: "decision",
    subject: s.subject,
    scope: s.scope,
    key: `decision:${s.verb}`,
    value: s.evidenceRef ?? s.verb,
    explanation,
    confidence: envelopeFor([s], s.scope, s.occurredAt),
    createdAt: s.occurredAt,
  };
}

/** OUTCOME — resultado real posterior. Cierra el ciclo de aprendizaje. */
export function toOutcome(signal: EcosystemSignal, explanation: string): KnowledgeItem {
  const s = normalizeSignal(signal);
  return {
    id: itemId("outcome", `${s.domain}:${s.verb}`, s.subject),
    kind: "outcome",
    subject: s.subject,
    scope: s.scope,
    key: `outcome:${s.verb}`,
    value: s.evidenceRef ?? s.verb,
    explanation,
    confidence: envelopeFor([s], s.scope, s.occurredAt),
    createdAt: s.occurredAt,
  };
}

/** Señales que contradicen un verbo dado. Base para bajar la confianza. */
export function contradictingSignals(verb: string, signals: EcosystemSignal[]): EcosystemSignal[] {
  const opposites = CONTRADICTS[verb] ?? [];
  return signals.filter((s) => opposites.includes(s.verb));
}

export function supportingSignals(verb: string, signals: EcosystemSignal[]): EcosystemSignal[] {
  return signals.filter((s) => s.verb === verb);
}
