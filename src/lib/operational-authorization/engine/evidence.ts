/**
 * OAI F1 — evidence grading (PURE).
 *
 * Hard rule: an artifact being present NEVER raises the grade above E2.
 * E3 requires an observed manual review, E4 requires a real verifier reference.
 */
import type {
  EvidenceFact,
  EvidenceGrade,
  EvidenceGradeSummary,
  EvidenceValidity,
} from "./types";

export function resolveValidity(fact: EvidenceFact, evaluatedAt: string): EvidenceValidity {
  if (fact.reviewStatus === "expired") return "expired";
  if (fact.contradictions?.includes("revoked")) return "revoked";
  if (!fact.validUntil) {
    return fact.reviewStatus === "unknown" || fact.reviewStatus === null ? "unknown" : "valid";
  }
  const until = Date.parse(fact.validUntil);
  const now = Date.parse(evaluatedAt);
  if (Number.isNaN(until) || Number.isNaN(now)) return "unknown";
  return until < now ? "expired" : "valid";
}

export function gradeEvidence(fact: EvidenceFact, evaluatedAt: string): EvidenceGrade {
  const validity = resolveValidity(fact, evaluatedAt);
  if (validity === "expired" || validity === "revoked") return "E5";
  if (fact.contradictions && fact.contradictions.length > 0) return "E5";

  if (!fact.artifactPresent) {
    // Declared-only signals are E1, and only when the declaration is explicit.
    if (fact.type === "attestation" || fact.source === "declared") return "E1";
    if (fact.reviewStatus === "unknown") return "unresolved";
    if (fact.type === "unknown") return "unresolved";
    return "E0";
  }

  // Artifact exists. Ceiling is E2 unless a review/verification was observed.
  switch (fact.reviewStatus) {
    case "rejected":
      return "E5";
    case "pending":
      return "E2";
    case "approved":
      return fact.verifierRef ? "E4" : "E3";
    default:
      return "unresolved";
  }
}

export function summarizeEvidence(
  facts: EvidenceFact[],
  evaluatedAt: string,
): EvidenceGradeSummary[] {
  return facts.map((fact) => {
    const grade = gradeEvidence(fact, evaluatedAt);
    return {
      requirementCode: fact.requirementCode,
      grade,
      validity: resolveValidity(fact, evaluatedAt),
      verified: grade === "E4",
    };
  });
}

/** A requirement counts as satisfied only at E3 or E4 with valid validity. */
export function isSatisfied(summary: EvidenceGradeSummary): boolean {
  return (summary.grade === "E3" || summary.grade === "E4") && summary.validity === "valid";
}
