import { resolveAudience } from "./audience";
import { buildDedupeKey } from "./dedupe";
import { FAMILY_RULES, resolveFamily } from "./taxonomy";
import type {
  OperationalSignalEvent,
  SignalContext,
  SignalDecision,
  SignalPriority,
} from "./types";
import { OSE_DECISION_VERSION } from "./version";

const PRIORITY_ORDER: SignalPriority[] = ["silent", "low", "medium", "high", "critical"];

function raise(base: SignalPriority, to: SignalPriority): SignalPriority {
  return PRIORITY_ORDER.indexOf(to) > PRIORITY_ORDER.indexOf(base) ? to : base;
}

/** Time-proximity escalation: closer to shift start ⇒ more urgent. */
function applyUrgency(
  base: SignalPriority,
  minutesToStart: number | null | undefined,
  family: string,
): { priority: SignalPriority; reason: string | null } {
  if (minutesToStart == null) return { priority: base, reason: null };
  const timeSensitive = [
    "meeting_point",
    "transportation",
    "cancellation",
    "replacement",
    "shift_change",
    "clock_in",
    "no_show",
  ].includes(family);
  if (!timeSensitive) return { priority: base, reason: null };

  if (minutesToStart <= 120 && minutesToStart >= -240) {
    return {
      priority: raise(base, "critical"),
      reason: `a ${Math.round(minutesToStart)} min del inicio del turno: sin margen de reacción`,
    };
  }
  if (minutesToStart <= 720) {
    return {
      priority: raise(base, "high"),
      reason: `a ${Math.round(minutesToStart)} min del inicio del turno`,
    };
  }
  return { priority: base, reason: null };
}

/**
 * `notify_operational_event_shadow` — the single operational decision layer.
 *
 * PURE and SIDE-EFFECT FREE. It never sends, never mutates, never suppresses a
 * real notification. It only answers: quién, cuándo, con qué prioridad, por qué
 * canal, si agrupar y si requiere confirmación.
 */
export function evaluateOperationalSignal(
  event: OperationalSignalEvent,
  context: SignalContext = { companyId: event.companyId },
): SignalDecision {
  const family = resolveFamily(event.eventType);
  const rule = FAMILY_RULES[family];

  const { recommended, excluded } = resolveAudience(family, {
    ...context,
    companyId: event.companyId,
  });

  const urgency = applyUrgency(rule.basePriority, context.minutesToShiftStart, family);
  let priority = urgency.priority;
  let suppressReason: string | null = null;

  if (recommended.length === 0) {
    priority = "silent";
    suppressReason = "sin audiencia con acción requerida: útil solo para historial";
  } else if (family === "general_information" && (context.recentSameKeyEventCount ?? 0) > 0) {
    priority = "silent";
    suppressReason = "evento informativo repetido dentro de la ventana: solo historial";
  }

  const repeatCount = context.recentSameKeyEventCount ?? 0;
  const shouldGroup = rule.groupable && priority !== "critical" && repeatCount >= 1;

  const dedupeKey = buildDedupeKey({
    companyId: event.companyId,
    shiftId: event.shiftId,
    family,
    subject: event.subjectUserId ?? event.eventType,
    occurredAt: event.occurredAt,
    windowSeconds: rule.groupWindowSeconds,
  });

  const recommendedSendTime =
    priority === "critical" || priority === "high" || !shouldGroup
      ? event.occurredAt
      : new Date(Date.parse(event.occurredAt) + rule.groupWindowSeconds * 1000).toISOString();

  const risks: string[] = [];
  const actual = event.actualRecipientsCount ?? 0;
  if (actual > recommended.length * 2 && actual > 3) {
    risks.push("over_broad_audience");
  }
  if (priority === "critical" && (event.currentSystemAction ?? "").includes("generic")) {
    risks.push("critical_buried_in_generic_feed");
  }
  if (rule.requiresAcknowledgement && priority !== "silent") {
    risks.push("missing_acknowledgement_loop");
  }

  const channels =
    priority === "silent" ? (["in_app"] as const).slice() : [...rule.channels];

  return {
    eventId: event.eventId,
    companyId: event.companyId,
    eventType: event.eventType,
    notificationFamily: family,
    priority,
    recommendedAudience: priority === "silent" ? [] : recommended,
    excludedAudience:
      priority === "silent"
        ? [...excluded, ...recommended.map((m) => ({ ...m, reason: suppressReason ?? m.reason }))]
        : excluded,
    recommendedChannel: channels,
    dedupeKey,
    shouldGroup,
    groupWindowSeconds: shouldGroup ? rule.groupWindowSeconds : 0,
    requiresAcknowledgement: rule.requiresAcknowledgement && priority !== "silent",
    acknowledgementDeadlineSeconds:
      rule.requiresAcknowledgement && priority !== "silent"
        ? rule.acknowledgementDeadlineSeconds
        : null,
    escalationHint:
      rule.requiresAcknowledgement && priority !== "silent" ? rule.escalationHint : null,
    urgencyReason: urgency.reason,
    suppressReason,
    recommendedSendTime,
    riskDetected: risks,
    decisionVersion: OSE_DECISION_VERSION,
  };
}
