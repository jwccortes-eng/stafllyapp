/**
 * ELDM — patterns.ts
 * Constructores de memoria: continuidad por persona y memoria por compañía.
 * Ambas viven en la MISMA infraestructura, sólo cambia el scope.
 */
import { contradictingSignals, supportingSignals, toInference, toObservation } from "./knowledge";
import type { EcosystemSignal, KnowledgeItem, KnowledgeScope, KnowledgeSubject } from "./types";

export interface BuildPatternsInput {
  signals: EcosystemSignal[];
  now: string;
}

/** Patrones observables por persona dentro de una compañía. */
export const PERSON_PATTERN_KEYS = [
  "accepts:service",
  "worked:venue",
  "worked:role",
  "documents_valid",
  "rated_positive",
] as const;

/** Patrones observables por compañía (venue, cliente, tipo de servicio). */
export const COMPANY_PATTERN_KEYS = [
  "staffing:venue",
  "staffing:service_type",
  "schedule:frequent_start",
  "cancellation:client",
  "response_rate",
  "correction:common",
] as const;

interface AggregateSpec {
  key: string;
  verb: string;
  subject: KnowledgeSubject;
  scope: KnowledgeScope;
  explanation: (supporting: number, total: number) => string;
}

function buildPair(spec: AggregateSpec, input: BuildPatternsInput): KnowledgeItem[] {
  const supporting = supportingSignals(spec.verb, input.signals);
  const contradicting = contradictingSignals(spec.verb, input.signals);
  if (supporting.length === 0 && contradicting.length === 0) return [];
  const total = supporting.length + contradicting.length;

  const agg = {
    key: spec.key,
    subject: spec.subject,
    scope: spec.scope,
    supporting,
    contradicting,
    now: input.now,
  };

  const out: KnowledgeItem[] = [toObservation(agg)];
  const inference = toInference(agg, spec.explanation(supporting.length, total));
  if (inference) out.push(inference);
  return out;
}

/** Continuidad por persona: qué sabemos de alguien al volver a verlo. */
export function buildPersonPatterns(params: {
  personId: string;
  companyId: string;
  signals: EcosystemSignal[];
  now: string;
}): KnowledgeItem[] {
  const subject: KnowledgeSubject = { personId: params.personId, companyId: params.companyId };
  const scope: KnowledgeScope = { level: "tenant", companyId: params.companyId };
  const input = { signals: params.signals, now: params.now };

  return [
    ...buildPair(
      {
        key: "accepts:service",
        verb: "accepted",
        subject,
        scope,
        explanation: (s, t) => `Aceptó ${s} de ${t} servicios similares.`,
      },
      input,
    ),
    ...buildPair(
      {
        key: "worked:venue",
        verb: "worked",
        subject,
        scope,
        explanation: (s) => `Trabajó ${s} veces en este lugar.`,
      },
      input,
    ),
    ...buildPair(
      {
        key: "rated_positive",
        verb: "rated_positive",
        subject,
        scope,
        explanation: (s, t) => `Recibió ${s} de ${t} valoraciones positivas.`,
      },
      input,
    ),
  ];
}

/** Memoria de la compañía: cómo suele operar este tenant. No se comparte. */
export function buildCompanyPatterns(params: {
  companyId: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  signals: EcosystemSignal[];
  now: string;
}): KnowledgeItem[] {
  const subject: KnowledgeSubject = {
    companyId: params.companyId,
    venueId: params.venueId,
    clientId: params.clientId,
    serviceType: params.serviceType,
  };
  const scope: KnowledgeScope = { level: "tenant", companyId: params.companyId };
  const input = { signals: params.signals, now: params.now };

  return [
    ...buildPair(
      {
        key: "staffing:venue",
        verb: "staffed",
        subject,
        scope,
        explanation: (s) => `Este lugar se cubrió ${s} veces con la misma configuración.`,
      },
      input,
    ),
    ...buildPair(
      {
        key: "cancellation:client",
        verb: "cancelled_by_client",
        subject,
        scope,
        explanation: (s, t) => `Este cliente canceló ${s} de ${t} servicios.`,
      },
      input,
    ),
    ...buildPair(
      {
        key: "correction:common",
        verb: "corrected_entity",
        subject,
        scope,
        explanation: (s) => `El equipo corrigió este dato ${s} veces al importar.`,
      },
      input,
    ),
  ];
}
