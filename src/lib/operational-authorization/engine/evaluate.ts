/**
 * OAI F1 — simulated evaluation (PURE, deterministic, rule-based).
 *
 * NO AI. NO I/O. NO clock: `evaluatedAt` is always injected.
 * The result is a simulation. It never reaches an operational surface.
 */
import { isSatisfied, summarizeEvidence } from "./evidence";
import { resolveCascade } from "./cascade";
import type {
  EvidenceGradeSummary,
  ObservationFacts,
  SimulatedEvaluation,
  SimulatedOutcome,
} from "./types";

function byCode(summaries: EvidenceGradeSummary[]): Map<string, EvidenceGradeSummary> {
  const map = new Map<string, EvidenceGradeSummary>();
  for (const s of summaries) map.set(s.requirementCode, s);
  return map;
}

export function evaluateSimulated(
  facts: ObservationFacts,
  evaluatedAt: string,
): SimulatedEvaluation {
  const evidenceGradeSummary = summarizeEvidence(facts.evidence, evaluatedAt);
  const evidenceByCode = byCode(evidenceGradeSummary);
  const reasonCodes: string[] = [];

  const unsatisfied = new Set<string>();
  let anyExpired = false;
  let anyRevoked = false;
  let anyReceivedNotReviewed = false;
  let anyUnresolvedEvidence = false;
  let anyMissing = false;

  for (const requirement of facts.requirements) {
    const summary = evidenceByCode.get(requirement.code);
    if (!summary) {
      unsatisfied.add(requirement.code);
      anyMissing = true;
      reasonCodes.push(`evidence_absent:${requirement.code}`);
      continue;
    }
    if (isSatisfied(summary)) continue;

    unsatisfied.add(requirement.code);
    if (summary.validity === "revoked") {
      anyRevoked = true;
      reasonCodes.push(`evidence_revoked:${requirement.code}`);
    } else if (summary.validity === "expired" || summary.grade === "E5") {
      anyExpired = true;
      reasonCodes.push(`evidence_expired_or_contradicted:${requirement.code}`);
    } else if (summary.grade === "E2") {
      anyReceivedNotReviewed = true;
      reasonCodes.push(`evidence_received_not_reviewed:${requirement.code}`);
    } else if (summary.grade === "unresolved") {
      anyUnresolvedEvidence = true;
      reasonCodes.push(`evidence_unresolved:${requirement.code}`);
    } else {
      anyMissing = true;
      reasonCodes.push(`evidence_insufficient:${requirement.code}`);
    }
  }

  const cascade = resolveCascade(facts.requirements, unsatisfied);
  for (const code of cascade.unclassifiedRequirements) {
    reasonCodes.push(`requirement_unclassified:${code}`);
  }
  for (const level of cascade.missingConfiguration) {
    reasonCodes.push(`configuration_absent:${level}`);
  }
  for (const code of cascade.cascadeConflicts) {
    reasonCodes.push(`cascade_conflict:${code}`);
  }

  const outcome = decideOutcome(facts, {
    hasRequirements: facts.requirements.length > 0,
    unsatisfied,
    anyExpired,
    anyRevoked,
    anyReceivedNotReviewed,
    anyUnresolvedEvidence,
    anyMissing,
    unclassifiedCount: cascade.unclassifiedRequirements.length,
    reasonCodes,
  });

  return {
    outcome,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    winningRequirementSource: cascade.winningRequirementSource,
    winningRequirementCode: cascade.winningRequirementCode,
    subordinateRequirements: cascade.subordinateRequirements,
    cascadeConflicts: cascade.cascadeConflicts,
    unclassifiedRequirements: cascade.unclassifiedRequirements,
    missingConfiguration: cascade.missingConfiguration,
    evidenceGradeSummary,
  };
}

interface DecisionInput {
  hasRequirements: boolean;
  unsatisfied: Set<string>;
  anyExpired: boolean;
  anyRevoked: boolean;
  anyReceivedNotReviewed: boolean;
  anyUnresolvedEvidence: boolean;
  anyMissing: boolean;
  unclassifiedCount: number;
  reasonCodes: string[];
}

function decideOutcome(facts: ObservationFacts, input: DecisionInput): SimulatedOutcome {
  // 1. Explicit, human-classified, in-force hard stop. The ONLY path to
  //    `legally_prohibited`. Absence of configuration can never reach here.
  const hardStop = facts.requirements.find(
    (r) =>
      r.source === "legal_regulatory" &&
      r.classification !== "unclassified" &&
      r.explicitHardStop?.inForce === true &&
      input.unsatisfied.has(r.code),
  );
  if (hardStop) {
    input.reasonCodes.push(`explicit_hard_stop:${hardStop.code}`);
    return "legally_prohibited";
  }

  if (!input.hasRequirements) {
    input.reasonCodes.push("no_requirements_observable");
    return "unknown";
  }

  if (input.anyRevoked) return "revoked";
  if (input.anyExpired) return "expired_authorization";

  if (input.unsatisfied.size === 0) {
    if (input.unclassifiedCount > 0) {
      input.reasonCodes.push("satisfied_but_unclassified_requirements_present");
      return "authorized_with_conditions";
    }
    return "authorized";
  }

  if (input.anyUnresolvedEvidence) return "unknown";
  if (input.anyReceivedNotReviewed) return "decision_required";
  if (input.anyMissing) return "insufficient_evidence";

  return "decision_required";
}
