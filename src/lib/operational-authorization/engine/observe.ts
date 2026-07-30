/**
 * OAI F1 — orchestrator (PURE). facts -> ObservationRecordOAI.
 *
 * Deterministic given `evaluatedAt`. No I/O, no side effects, no transport.
 */
import { evaluateSimulated } from "./evaluate";
import { detectContradiction } from "./contradiction";
import { OAI_CONTRACT_VERSION, OAI_ENGINE_VERSION, OAI_RULE_VERSION } from "../version";
import type {
  DocumentStateSummary,
  EvidenceGradeSummary,
  ObservationFacts,
  ObservationRecordOAI,
} from "./types";

const CONTEXT_FIELDS: Array<[string, (f: ObservationFacts) => unknown]> = [
  ["company_id", (f) => f.companyId],
  ["worker_ref", (f) => f.workerRef],
  ["shift_ref", (f) => f.shiftRef],
  ["actor_ref", (f) => f.actorRef],
  ["client_ref", (f) => f.clientRef],
  ["location_ref", (f) => f.locationRef],
  ["shift_start_at", (f) => f.shiftStartAt],
  ["role_code", (f) => f.roleCode],
  ["service_code", (f) => f.serviceCode],
];

function summarizeDocuments(
  facts: ObservationFacts,
  grades: EvidenceGradeSummary[],
): DocumentStateSummary {
  const byCode = new Map(grades.map((g) => [g.requirementCode, g]));
  const summary: DocumentStateSummary = {
    required: facts.requirements.length,
    approved: 0,
    receivedNotReviewed: 0,
    expired: 0,
    missing: 0,
    unknown: 0,
  };
  for (const requirement of facts.requirements) {
    const grade = byCode.get(requirement.code);
    if (!grade) {
      summary.missing += 1;
      continue;
    }
    switch (grade.grade) {
      case "E3":
      case "E4":
        if (grade.validity === "valid") summary.approved += 1;
        else summary.expired += 1;
        break;
      case "E2":
        summary.receivedNotReviewed += 1;
        break;
      case "E5":
        summary.expired += 1;
        break;
      case "E0":
      case "E1":
        summary.missing += 1;
        break;
      default:
        summary.unknown += 1;
    }
  }
  return summary;
}

export interface ObserveOptions {
  evaluatedAt: string;
  /** Provided by the journey tracker when a document changed mid-journey. */
  evidenceChangedBetween?: boolean;
}

export function observeAuthorization(
  facts: ObservationFacts,
  { evaluatedAt, evidenceChangedBetween }: ObserveOptions,
): ObservationRecordOAI {
  const evaluation = evaluateSimulated(facts, evaluatedAt);

  const contextAvailable: string[] = [];
  const contextMissing: string[] = [];
  for (const [name, read] of CONTEXT_FIELDS) {
    const value = read(facts);
    if (value === null || value === undefined || value === "") contextMissing.push(name);
    else contextAvailable.push(name);
  }

  return {
    contractVersion: OAI_CONTRACT_VERSION,
    engineVersion: OAI_ENGINE_VERSION,
    ruleVersion: OAI_RULE_VERSION,

    observationId: facts.observationId,
    correlationId: facts.correlationId,
    observedAt: facts.observedAt,
    evaluatedAt,

    companyId: facts.companyId,
    workerRef: facts.workerRef,
    shiftRef: facts.shiftRef ?? null,
    actorRef: facts.actorRef ?? null,
    clientRef: facts.clientRef ?? null,
    locationRef: facts.locationRef ?? null,

    sourceSurface: facts.sourceSurface,
    triggerType: facts.triggerType,

    systemReadinessState: facts.systemReadinessState,
    systemBlockReasons: [...facts.systemBlockReasons].sort(),
    // profile_status is recorded only as presence of a legacy mixed signal.
    legacyMixedSignalPresent: Boolean(facts.legacyMixedSignal),

    documentStateSummary: summarizeDocuments(facts, evaluation.evidenceGradeSummary),
    evidenceGradeSummary: evaluation.evidenceGradeSummary,

    contextAvailable,
    contextMissing,

    simulatedOaiOutcome: evaluation.outcome,
    simulatedReasonCodes: evaluation.reasonCodes,
    winningRequirementSource: evaluation.winningRequirementSource,
    unclassifiedRequirements: evaluation.unclassifiedRequirements,
    cascadeConflicts: evaluation.cascadeConflicts,

    humanAction: facts.humanAction,
    assignmentResult: facts.assignmentResult,
    contradictionDetected: detectContradiction({
      systemReadinessState: facts.systemReadinessState,
      humanAction: facts.humanAction,
      assignmentResult: facts.assignmentResult,
      evidenceChangedBetween,
    }),
    authorityStatus: facts.authority.status,
    eventualOutcome: facts.eventualOutcome ?? "unknown",

    navigationCount: facts.navigationCount ?? 0,
    contextLossDetected: facts.contextLossDetected ?? false,
    persistenceIssueDetected: facts.persistenceIssueDetected ?? false,
    latencyMsFromBlock: facts.latencyMsFromBlock ?? null,

    observationOnly: true,
  };
}
