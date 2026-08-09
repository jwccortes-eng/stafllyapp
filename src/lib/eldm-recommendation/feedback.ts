/**
 * ELDM Fase 1C — feedback del admin sobre la recomendación.
 *
 * Elegir a otra persona NO significa que la recomendación fuera incorrecta:
 * se registra la decisión con su contexto, sin penalizar a nadie.
 */
import { recordAdminFeedback, type AdminFeedbackVerb } from "@/lib/eldm";
import { fromAssignmentEvent } from "@/lib/eldm-adapters";
import { recordSignal } from "@/lib/eldm-store";

export type RecommendationDecision =
  | "chose_recommended"
  | "chose_other"
  | "dismissed_recommendation"
  | "changed_role";

const VERB: Record<RecommendationDecision, AdminFeedbackVerb> = {
  chose_recommended: "accepted_recommendation",
  chose_other: "selected_other_worker",
  dismissed_recommendation: "rejected_recommendation",
  changed_role: "changed_schedule",
};

export interface RecommendationDecisionInput {
  companyId: string;
  serviceId: string;
  decision: RecommendationDecision;
  /** Persona finalmente elegida, si hubo elección. */
  chosenPersonId?: string;
  /** Persona que el sistema había recomendado primero. */
  recommendedPersonId?: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  role?: string;
  occurredAt?: string;
}

/** Registra la decisión humana como memoria persistente e idempotente. */
export async function recordRecommendationDecision(
  input: RecommendationDecisionInput,
): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  // Memoria de la decisión (explicable, sin juicio sobre la persona).
  recordAdminFeedback({
    companyId: input.companyId,
    decisionType: "recommend_worker",
    verb: VERB[input.decision],
    subject: {
      personId: input.chosenPersonId,
      venueId: input.venueId,
      clientId: input.clientId,
      serviceType: input.serviceType,
      role: input.role,
    },
    occurredAt,
    recommendedRef: input.recommendedPersonId,
    chosenRef: input.chosenPersonId,
  });

  if (!input.chosenPersonId) return;

  await recordSignal(
    fromAssignmentEvent({
      companyId: input.companyId,
      verb: input.decision === "chose_recommended" ? "selected" : "rejected_recommendation",
      personId: input.chosenPersonId,
      shiftId: input.serviceId,
      venueId: input.venueId,
      clientId: input.clientId,
      serviceType: input.serviceType,
      role: input.role,
      occurredAt,
      recommendedPersonId: input.recommendedPersonId,
    }),
  );
}
