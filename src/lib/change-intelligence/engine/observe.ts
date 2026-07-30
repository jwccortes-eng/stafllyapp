/**
 * Orchestrator. PURE. event -> ObservationRecord.
 * No side effects, no I/O, no transport. Deterministic given evaluatedAt.
 */
import { detectMaterialDeltas } from "./detect";
import { classify } from "./classify";
import { resolveAudience } from "./audience";
import { compose } from "./compose";
import { route } from "./route";
import { ChangeTypeRegistry } from "./registry";
import { ENGINE_VERSION } from "./version";
import type {
  DomainChangeEvent,
  ObservationRecord,
  Reachability,
  SimulatedMessage,
} from "./types";

export interface ObserveOptions {
  registry: ChangeTypeRegistry;
  evaluatedAt?: string;
}

export function observe(
  event: DomainChangeEvent,
  { registry, evaluatedAt = new Date().toISOString() }: ObserveOptions,
): ObservationRecord {
  const registration = registry.get(event.changeType);
  const { materialDeltas, discarded } = detectMaterialDeltas(event.fields);
  const { level, suppressionReason } = classify(materialDeltas, registration);

  const reachabilityStatus: Record<string, Reachability> = {};
  for (const hint of event.audienceHints) {
    reachabilityStatus[hint.partyId] = hint.reachability;
  }

  if (!registration) {
    return {
      engineVersion: ENGINE_VERSION,
      eventId: event.eventId,
      correlationId: event.correlationId,
      companyId: event.tenantId,
      domain: event.domain,
      changeType: event.changeType,
      aggregateType: event.aggregateType,
      aggregateId: event.subject.id,
      actorId: event.actor.id,
      occurredAt: event.occurredAt,
      evaluatedAt,
      deltas: event.fields,
      materialDeltas,
      materiality: event.fields.map((f) => f.materiality),
      impactLevel: 0,
      audienceCandidates: event.audienceHints,
      resolvedAudiences: [],
      unresolvedAudiences: event.audienceHints.map((h) => ({
        partyId: h.partyId,
        relation: h.relation,
        reason: "change_type_not_registered",
      })),
      deduplicatedRecipients: 0,
      reachabilityStatus,
      managerResolution: {
        status: "unresolved",
        evidence: [],
        unresolvedCause: "change_type_not_registered",
      },
      simulatedMessages: [],
      acknowledgementRequired: "none",
      suppressionReason: "change_type_not_registered",
      legacyBehaviorComparison: {
        legacyRecipientCount: event.legacyAudience?.length ?? 0,
        ciRecipientCount: 0,
        suppressedCount: event.legacyAudience?.length ?? 0,
        legacyManagersWithoutExplicitRelation: 0,
      },
      context: event.context,
      observationOnly: true,
    };
  }

  const audience = resolveAudience(
    event.audienceHints,
    registration,
    level,
    evaluatedAt,
    event.actor.id,
  );

  const simulatedMessages: SimulatedMessage[] = [];
  for (const recipient of audience.resolved) {
    const body = compose(event, materialDeltas, registration, recipient);
    if (!body) continue;
    const decision = route(recipient, level, registration);
    simulatedMessages.push({
      partyId: recipient.partyId,
      relation: recipient.relation,
      deduplicationKey: recipient.deduplicationKey,
      level,
      simulatedChannel: decision.simulatedChannel,
      simulatedMessage: body,
      acknowledgementRequired: level === 3 ? registration.requiresAck : "none",
      reachability: recipient.reachability,
      reachabilityReason: recipient.reachabilityReason,
      coalescingWindowSeconds: decision.coalescingWindowSeconds,
    });
  }

  const explicitManagerIds = new Set(
    audience.managerResolution.evidence.map((e) => e.managerId),
  );
  const legacyManagerNoise = (event.legacyAudience ?? []).filter((id) => {
    const hint = event.audienceHints.find((h) => h.partyId === id);
    if (hint?.partyType !== "manager" && hint !== undefined) return false;
    return !explicitManagerIds.has(id);
  }).length;

  const legacyCount = event.legacyAudience?.length ?? 0;
  const ciCount = simulatedMessages.length;

  return {
    engineVersion: ENGINE_VERSION,
    eventId: event.eventId,
    correlationId: event.correlationId,
    companyId: event.tenantId,
    domain: event.domain,
    changeType: event.changeType,
    aggregateType: event.aggregateType,
    aggregateId: event.subject.id,
    actorId: event.actor.id,
    occurredAt: event.occurredAt,
    evaluatedAt,
    deltas: event.fields,
    materialDeltas,
    materiality: event.fields.map((f) => f.materiality),
    impactLevel: level,
    audienceCandidates: audience.candidates,
    resolvedAudiences: audience.resolved,
    unresolvedAudiences: [
      ...audience.excluded,
      ...discarded.map((d) => ({
        partyId: "-",
        relation: "observer" as const,
        reason: `delta_discarded:${d.field}:${d.reason}`,
      })),
    ],
    deduplicatedRecipients: audience.deduplicatedRecipients,
    reachabilityStatus,
    managerResolution: audience.managerResolution,
    simulatedMessages,
    acknowledgementRequired: level === 3 ? registration.requiresAck : "none",
    suppressionReason,
    legacyBehaviorComparison: {
      legacyRecipientCount: legacyCount,
      ciRecipientCount: ciCount,
      suppressedCount: Math.max(0, legacyCount - ciCount),
      legacyManagersWithoutExplicitRelation: legacyManagerNoise,
    },
    context: event.context,
    observationOnly: true,
  };
}
