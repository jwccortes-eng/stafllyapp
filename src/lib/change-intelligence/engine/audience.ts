/**
 * L3 — Audience resolution. PURE.
 *
 * Implements D3 (manager_directo) generically: among hints with
 * relation='responsible', only the lowest resolutionPriority present survives.
 * There is NO input that allows hierarchy expansion or role-based fallback.
 */
import type {
  AudienceRef,
  ChangeTypeRegistration,
  ExcludedParty,
  ImpactLevel,
  ManagerResolution,
  ManagerResolutionEvidence,
} from "./types";
import { RELATIONSHIP_PRIORITY } from "./types";

export interface AudienceResult {
  candidates: AudienceRef[];
  resolved: AudienceRef[];
  excluded: ExcludedParty[];
  managerResolution: ManagerResolution;
  deduplicatedRecipients: number;
}

function priorityOf(ref: AudienceRef): number {
  if (ref.resolutionPriority) return ref.resolutionPriority;
  if (ref.relationshipType) return RELATIONSHIP_PRIORITY[ref.relationshipType];
  return Number.POSITIVE_INFINITY;
}

export function resolveAudience(
  candidates: AudienceRef[],
  registration: ChangeTypeRegistration,
  level: ImpactLevel,
  evaluatedAt: string,
  actorId: string | null,
): AudienceResult {
  const excluded: ExcludedParty[] = [];
  const kept: AudienceRef[] = [];

  const responsible = candidates.filter((c) => c.relation === "responsible");
  const others = candidates.filter((c) => c.relation !== "responsible");

  // --- D3 precedence: strict, no level mixing. -----------------------------
  const withEvidence: AudienceRef[] = [];
  for (const ref of responsible) {
    if (!ref.relationshipType || !ref.sourceObjectId) {
      excluded.push({
        partyId: ref.partyId,
        relation: ref.relation,
        reason: "responsible_without_verifiable_evidence",
      });
      continue;
    }
    withEvidence.push(ref);
  }

  let winningManagers: AudienceRef[] = [];
  if (withEvidence.length > 0) {
    const best = Math.min(...withEvidence.map(priorityOf));
    for (const ref of withEvidence) {
      if (priorityOf(ref) === best) winningManagers.push(ref);
      else
        excluded.push({
          partyId: ref.partyId,
          relation: ref.relation,
          reason: `lower_precedence_than_${best}`,
        });
    }
  }

  // --- Registry audience matrix -------------------------------------------
  const admit = (ref: AudienceRef): boolean => {
    const relationLevel = registration.audienceMatrix[ref.relation];
    if (relationLevel === undefined) {
      excluded.push({
        partyId: ref.partyId,
        relation: ref.relation,
        reason: "relation_not_in_catalog_audience_for_change_type",
      });
      return false;
    }
    if (relationLevel === 0) {
      excluded.push({
        partyId: ref.partyId,
        relation: ref.relation,
        reason: "catalog_level_0_for_this_relation",
      });
      return false;
    }
    if (level === 0) {
      excluded.push({
        partyId: ref.partyId,
        relation: ref.relation,
        reason: "change_classified_level_0",
      });
      return false;
    }
    // The actor is never a recipient by authorship (D3 security rule 3 & 4).
    if (actorId && ref.partyId === actorId && ref.relation === "observer") {
      excluded.push({
        partyId: ref.partyId,
        relation: ref.relation,
        reason: "actor_is_not_a_recipient_by_authorship",
      });
      return false;
    }
    return true;
  };

  winningManagers = winningManagers.filter(admit);
  const admittedOthers = others.filter(admit);

  // --- Deduplication (one consolidated communication per person) ----------
  const byKey = new Map<string, AudienceRef>();
  const relationRank: Record<string, number> = {
    responsible: 0,
    supervisor: 1,
    assigned: 2,
    removed: 2,
    candidate: 3,
    owner: 3,
    observer: 4,
  };
  let duplicatesCollapsed = 0;

  for (const ref of [...winningManagers, ...admittedOthers]) {
    const existing = byKey.get(ref.deduplicationKey);
    if (!existing) {
      byKey.set(ref.deduplicationKey, ref);
      continue;
    }
    duplicatesCollapsed += 1;
    const keepNew =
      (relationRank[ref.relation] ?? 9) < (relationRank[existing.relation] ?? 9);
    if (keepNew) byKey.set(ref.deduplicationKey, ref);
    excluded.push({
      partyId: keepNew ? existing.partyId : ref.partyId,
      relation: keepNew ? existing.relation : ref.relation,
      reason: "deduplicated_into_single_consolidated_communication",
    });
  }

  for (const ref of byKey.values()) kept.push(ref);

  // --- Manager resolution evidence ----------------------------------------
  const managerRequired = registration.audienceMatrix.responsible !== undefined;
  const evidence: ManagerResolutionEvidence[] = winningManagers.map((ref) => ({
    managerId: ref.partyId,
    relationshipType: ref.relationshipType!,
    sourceObjectId: ref.sourceObjectId ?? null,
    resolutionPriority: ref.resolutionPriority ?? RELATIONSHIP_PRIORITY[ref.relationshipType!],
    resolvedAt: evaluatedAt,
    reason: `explicit_${ref.relationshipType}_relation`,
    whetherNotificationWasRequired: managerRequired && level > 0,
    deduplicationKey: ref.deduplicationKey,
  }));

  const managerResolution: ManagerResolution =
    evidence.length > 0
      ? { status: "resolved", evidence }
      : {
          status: "unresolved",
          evidence: [],
          unresolvedCause: "no_explicit_manager_relation_for_shift",
        };

  return {
    candidates,
    resolved: kept,
    excluded,
    managerResolution,
    deduplicatedRecipients: duplicatesCollapsed,
  };
}
