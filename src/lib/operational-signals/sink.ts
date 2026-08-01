import { supabase } from "@/integrations/supabase/client";
import { evaluateOperationalSignal } from "./engine";
import { isKillSwitchEngaged, isShadowModeEnabled, isShadowPersistenceEnabled } from "./flags";
import type { OperationalSignalEvent, SignalContext, SignalDecision } from "./types";

/**
 * Records a shadow decision. NEVER blocks or delays the primary event:
 * fire-and-forget, all errors swallowed.
 */
export function observeOperationalEvent(
  event: OperationalSignalEvent,
  context?: SignalContext,
): SignalDecision | null {
  if (isKillSwitchEngaged() || !isShadowModeEnabled()) return null;

  let decision: SignalDecision;
  try {
    decision = evaluateOperationalSignal(event, context);
  } catch {
    return null;
  }

  if (isShadowPersistenceEnabled()) {
    // Deferred so the shadow layer never sits in the critical path.
    const persist = () => {
      void supabase
        .from("operational_signal_shadow_decisions")
        .insert([{
          company_id: event.companyId,
          event_id: event.eventId,
          correlation_id: event.correlationId ?? null,
          event_type: event.eventType,
          source_system: event.sourceSystem,
          shift_id: event.shiftId ?? null,
          actor_id: event.actorId ?? null,
          subject_user_id: event.subjectUserId ?? null,
          occurred_at: event.occurredAt,
          notification_family: decision.notificationFamily,
          priority: decision.priority,
          recommended_channel: decision.recommendedChannel,
          dedupe_key: decision.dedupeKey,
          should_group: decision.shouldGroup,
          group_window_seconds: decision.groupWindowSeconds,
          requires_acknowledgement: decision.requiresAcknowledgement,
          acknowledgement_deadline_seconds: decision.acknowledgementDeadlineSeconds,
          urgency_reason: decision.urgencyReason,
          suppress_reason: decision.suppressReason,
          recommended_send_time: decision.recommendedSendTime,
          current_system_action: event.currentSystemAction ?? null,
          actual_recipients_count: event.actualRecipientsCount ?? 0,
          recommended_recipients_count: decision.recommendedAudience.length,
          estimated_noise_reduction: estimateNoiseReduction(
            event.actualRecipientsCount ?? 0,
            decision.recommendedAudience.length,
          ),
          risk_detected: decision.riskDetected,
          recommended_audience: JSON.parse(JSON.stringify(decision.recommendedAudience)),
          excluded_audience: JSON.parse(JSON.stringify(decision.excludedAudience)),
          decision_payload: JSON.parse(
            JSON.stringify({
              escalation_hint: decision.escalationHint,
              event_payload: event.eventPayload ?? {},
            }),
          ),
          decision_version: decision.decisionVersion,
        }])
        .then(
          () => undefined,
          () => undefined,
        );
    };
    if (typeof queueMicrotask === "function") queueMicrotask(persist);
    else setTimeout(persist, 0);
  }

  return decision;
}

export function estimateNoiseReduction(actual: number, recommended: number): number {
  if (actual <= 0) return 0;
  const reduction = (actual - recommended) / actual;
  return Math.max(0, Math.min(1, Number(reduction.toFixed(4))));
}
