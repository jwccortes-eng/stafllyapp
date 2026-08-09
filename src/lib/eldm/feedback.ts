/**
 * ELDM — feedback.ts
 * Feedback humano y cierre de outcome loop.
 * El sistema registra la decisión y su contexto; no juzga a la persona.
 */
import type { DecisionType, EcosystemSignal, KnowledgeItem, KnowledgeSubject } from "./types";
import { toDecision, toOutcome } from "./knowledge";

export type AdminFeedbackVerb =
  | "accepted_recommendation"
  | "rejected_recommendation"
  | "corrected_entity"
  | "selected_other_worker"
  | "changed_quantity"
  | "changed_venue"
  | "changed_schedule";

export interface AdminFeedbackInput {
  companyId: string;
  decisionType: DecisionType;
  verb: AdminFeedbackVerb;
  subject: KnowledgeSubject;
  occurredAt: string;
  /** Qué había recomendado el sistema, para poder contrastar después. */
  recommendedRef?: string;
  /** Qué eligió la persona. */
  chosenRef?: string;
  attributes?: EcosystemSignal["attributes"];
}

const FEEDBACK_TEXT: Record<AdminFeedbackVerb, string> = {
  accepted_recommendation: "El equipo aceptó la recomendación.",
  rejected_recommendation: "El equipo eligió no seguir la recomendación.",
  corrected_entity: "El equipo corrigió la entidad detectada.",
  selected_other_worker: "El equipo seleccionó a otra persona.",
  changed_quantity: "El equipo ajustó la cantidad de personas.",
  changed_venue: "El equipo cambió el lugar.",
  changed_schedule: "El equipo ajustó el horario.",
};

/** Convierte feedback humano en señal de decisión con contexto completo. */
export function recordAdminFeedback(input: AdminFeedbackInput): KnowledgeItem {
  const signal: EcosystemSignal = {
    id: `admin:${input.verb}:${input.occurredAt}`,
    domain: "admin",
    verb: input.verb,
    subject: { ...input.subject, companyId: input.companyId },
    scope: { level: "tenant", companyId: input.companyId },
    occurredAt: input.occurredAt,
    attributes: {
      decision_type: input.decisionType,
      recommended_ref: input.recommendedRef ?? null,
      chosen_ref: input.chosenRef ?? null,
      ...(input.attributes ?? {}),
    },
    evidenceRef: input.chosenRef,
  };
  return toDecision(signal, FEEDBACK_TEXT[input.verb]);
}

/** Etapas reales del ciclo. `scheduled` nunca cuenta como trabajo realizado. */
export type OutcomeStage =
  | "worker_response"
  | "attendance"
  | "time_entry"
  | "completion"
  | "rating"
  | "payroll_approved";

export interface OutcomeInput {
  companyId: string;
  stage: OutcomeStage;
  verb: string;
  subject: KnowledgeSubject;
  occurredAt: string;
  evidenceRef?: string;
  attributes?: EcosystemSignal["attributes"];
}

const STAGE_DOMAIN: Record<OutcomeStage, EcosystemSignal["domain"]> = {
  worker_response: "response",
  attendance: "attendance",
  time_entry: "timeclock",
  completion: "service",
  rating: "rating",
  payroll_approved: "payroll",
};

/** Cierra el ciclo: sólo hechos posteriores y verificables entran como outcome. */
export function recordOutcome(input: OutcomeInput): KnowledgeItem {
  const signal: EcosystemSignal = {
    id: `outcome:${input.stage}:${input.occurredAt}`,
    domain: STAGE_DOMAIN[input.stage],
    verb: input.verb,
    subject: { ...input.subject, companyId: input.companyId },
    scope: { level: "tenant", companyId: input.companyId },
    occurredAt: input.occurredAt,
    attributes: { stage: input.stage, ...(input.attributes ?? {}) },
    evidenceRef: input.evidenceRef,
  };
  return toOutcome(signal, `Resultado registrado: ${input.verb} (${input.stage}).`);
}

/** Guardia dura: horas programadas no son resultado de trabajo realizado. */
export function isValidWorkOutcome(source: string): boolean {
  return !/scheduled/i.test(source);
}
