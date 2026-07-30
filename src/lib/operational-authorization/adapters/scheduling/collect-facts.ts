/**
 * OAI F1 — scheduling adapter: fact collection.
 *
 * Translates ALREADY-COMPUTED, already-rendered host state into observable
 * facts. It performs no queries of its own, so it can never slow down or alter
 * the assignment flow. It never reads `profile_status` as truth: that value
 * travels only as `legacyMixedSignal`.
 */
import type {
  EvidenceFact,
  HumanAction,
  ObservationFacts,
  RequirementFact,
  SourceSurface,
  SystemReadinessState,
  AssignmentResult,
} from "../../engine/types";

export interface ObservedDocument {
  /** Requirement/category code, e.g. "work_authorization". */
  code: string;
  artifactPresent: boolean;
  reviewStatus: "approved" | "pending" | "rejected" | "expired" | "unknown" | null;
  verifierRef?: string | null;
  validUntil?: string | null;
}

export interface SchedulingObservationInput {
  observationId: string;
  correlationId: string;
  observedAt: string;
  companyId: string;
  workerRef: string;
  shiftRef: string | null;
  actorRef: string | null;
  clientRef?: string | null;
  locationRef?: string | null;
  shiftStartAt?: string | null;
  roleCode?: string | null;
  serviceCode?: string | null;
  surface: SourceSurface;
  trigger: ObservationFacts["triggerType"];
  systemReadinessState: SystemReadinessState;
  systemBlockReasons?: string[];
  /** employees.profile_status — untrusted, presence only. */
  legacyProfileStatus?: string | null;
  /** Required document categories as resolved by the existing host logic. */
  requiredDocumentCodes: string[];
  observedDocuments: ObservedDocument[];
  humanAction?: HumanAction;
  assignmentResult?: AssignmentResult;
  navigationCount?: number;
  contextLossDetected?: boolean;
  persistenceIssueDetected?: boolean;
  latencyMsFromBlock?: number | null;
}

export function collectSchedulingFacts(input: SchedulingObservationInput): ObservationFacts {
  const documents = new Map(input.observedDocuments.map((d) => [d.code, d]));

  // Every requirement resolved today comes from company-level configuration.
  // Client and location requirement configuration DOES NOT EXIST — we do not
  // invent it, and its absence is reported as `configuration_absent`.
  const requirements: RequirementFact[] = input.requiredDocumentCodes.map((code) => ({
    code,
    source: "company_policy",
    classification: "unclassified",
  }));

  const evidence: EvidenceFact[] = input.requiredDocumentCodes.map((code) => {
    const doc = documents.get(code);
    if (!doc) {
      return {
        requirementCode: code,
        type: "document",
        artifactPresent: false,
        reviewStatus: null,
        source: "readiness_projection",
      } satisfies EvidenceFact;
    }
    return {
      requirementCode: code,
      type: "document",
      artifactPresent: doc.artifactPresent,
      reviewStatus: doc.reviewStatus,
      verifierRef: doc.verifierRef ?? null,
      validUntil: doc.validUntil ?? null,
      source: "employee_documents",
    } satisfies EvidenceFact;
  });

  return {
    observationId: input.observationId,
    correlationId: input.correlationId,
    observedAt: input.observedAt,
    companyId: input.companyId,
    workerRef: input.workerRef,
    shiftRef: input.shiftRef,
    actorRef: input.actorRef,
    clientRef: input.clientRef ?? null,
    locationRef: input.locationRef ?? null,
    shiftStartAt: input.shiftStartAt ?? null,
    roleCode: input.roleCode ?? null,
    serviceCode: input.serviceCode ?? null,
    sourceSurface: input.surface,
    triggerType: input.trigger,
    systemReadinessState: input.systemReadinessState,
    systemBlockReasons: input.systemBlockReasons ?? [],
    legacyMixedSignal: input.legacyProfileStatus ?? null,
    requirements,
    evidence,
    humanAction: input.humanAction ?? "not_observed",
    assignmentResult: input.assignmentResult ?? "unknown",
    // No authority model exists today. It is `unresolved`, never inferred.
    authority: { status: "unresolved" },
    navigationCount: input.navigationCount ?? 0,
    contextLossDetected: input.contextLossDetected ?? false,
    persistenceIssueDetected: input.persistenceIssueDetected ?? false,
    latencyMsFromBlock: input.latencyMsFromBlock ?? null,
    eventualOutcome: "unknown",
  };
}
