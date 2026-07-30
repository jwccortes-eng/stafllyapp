/**
 * Divergence report — answers the 10 F1 questions from observation records.
 * PURE aggregation, no I/O.
 */
import type { ObservationRecord } from "../engine/types";

export interface UnresolvedCauseBucket {
  cause: string;
  count: number;
  sampleAggregateIds: string[];
}

export interface DivergenceReport {
  generatedAt: string;
  engineVersions: string[];
  totalEvents: number;
  /** 1 */ legacyRecipients: number;
  /** 2 */ ciRecipients: number;
  /** 3 */ suppressedInterruptions: number;
  /** 4 */ unresolvedManagerEvents: number;
  /** 5 */ affectedButUnreachable: number;
  /** 6 */ consolidatedOperations: number;
  /** 7 */ duplicateNotificationsAvoided: number;
  /** 8 */ level0Silenced: number;
  /** 9 */ legacyManagersWithoutExplicitRelation: number;
  /** 10 */ unresolvedCauses: UnresolvedCauseBucket[];
  volumeReductionPct: number;
}

export function buildDivergenceReport(
  records: ObservationRecord[],
  generatedAt = new Date().toISOString(),
): DivergenceReport {
  const causes = new Map<string, UnresolvedCauseBucket>();
  const correlationIds = new Set<string>();
  const unreachable = new Set<string>();

  let legacyRecipients = 0;
  let ciRecipients = 0;
  let suppressed = 0;
  let unresolvedManagerEvents = 0;
  let duplicatesAvoided = 0;
  let level0 = 0;
  let legacyManagerNoise = 0;

  for (const r of records) {
    correlationIds.add(r.correlationId);
    legacyRecipients += r.legacyBehaviorComparison.legacyRecipientCount;
    ciRecipients += r.legacyBehaviorComparison.ciRecipientCount;
    suppressed += r.legacyBehaviorComparison.suppressedCount;
    legacyManagerNoise += r.legacyBehaviorComparison.legacyManagersWithoutExplicitRelation;
    duplicatesAvoided += r.deduplicatedRecipients;
    if (r.impactLevel === 0) level0 += 1;

    for (const [partyId, status] of Object.entries(r.reachabilityStatus)) {
      if (status === "unreachable") unreachable.add(partyId);
    }

    if (r.managerResolution.status === "unresolved") {
      unresolvedManagerEvents += 1;
      const cause = r.managerResolution.unresolvedCause ?? "unknown";
      const bucket = causes.get(cause) ?? { cause, count: 0, sampleAggregateIds: [] };
      bucket.count += 1;
      if (bucket.sampleAggregateIds.length < 10) bucket.sampleAggregateIds.push(r.aggregateId);
      causes.set(cause, bucket);
    }
  }

  return {
    generatedAt,
    engineVersions: [...new Set(records.map((r) => r.engineVersion))],
    totalEvents: records.length,
    legacyRecipients,
    ciRecipients,
    suppressedInterruptions: suppressed,
    unresolvedManagerEvents,
    affectedButUnreachable: unreachable.size,
    consolidatedOperations: records.length - correlationIds.size,
    duplicateNotificationsAvoided: duplicatesAvoided,
    level0Silenced: level0,
    legacyManagersWithoutExplicitRelation: legacyManagerNoise,
    unresolvedCauses: [...causes.values()].sort((a, b) => b.count - a.count),
    volumeReductionPct:
      legacyRecipients === 0 ? 0 : Math.round(((legacyRecipients - ciRecipients) / legacyRecipients) * 100),
  };
}

/** Aggregated simulated config alerts: (company, cause, 24h window). */
export interface SimulatedConfigAlert {
  companyId: string;
  cause: string;
  windowDay: string;
  count: number;
  sampleAggregateIds: string[];
}

export function buildSimulatedConfigAlerts(records: ObservationRecord[]): SimulatedConfigAlert[] {
  const map = new Map<string, SimulatedConfigAlert>();
  for (const r of records) {
    if (r.managerResolution.status !== "unresolved") continue;
    const cause = r.managerResolution.unresolvedCause ?? "unknown";
    const windowDay = r.evaluatedAt.slice(0, 10);
    const key = `${r.companyId}|${cause}|${windowDay}`;
    const entry =
      map.get(key) ?? { companyId: r.companyId, cause, windowDay, count: 0, sampleAggregateIds: [] };
    entry.count += 1;
    if (entry.sampleAggregateIds.length < 10) entry.sampleAggregateIds.push(r.aggregateId);
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
