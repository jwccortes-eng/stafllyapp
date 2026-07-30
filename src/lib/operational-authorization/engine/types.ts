/**
 * OAI F1 — Observation Mode contract (versioned).
 *
 * PURE TYPES ONLY. This file must never import a domain module, a Supabase
 * client, a React module or anything with I/O (see isolation test).
 *
 * Vocabulary rules enforced across the engine:
 *  - `observationOnly` is a literal `true`. There is no code path to false.
 *  - There is no "override" concept. A divergence is a `contradiction`.
 *  - Absence of data is `unknown` / `unclassified` / `unresolved` /
 *    `not_observable` — never a negative assertion.
 */

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

export const SIMULATED_OUTCOMES = [
  "authorized",
  "authorized_with_conditions",
  "decision_required",
  "not_authorized",
  "legally_prohibited",
  "insufficient_evidence",
  "expired_authorization",
  "revoked",
  "unknown",
] as const;

export type SimulatedOutcome = (typeof SIMULATED_OUTCOMES)[number];

/* ------------------------------------------------------------------ */
/* Evidence (E0–E5)                                                    */
/* ------------------------------------------------------------------ */

/**
 * E0 none · E1 declared · E2 received not reviewed · E3 manually reviewed
 * E4 verified through a real verification process · E5 expired/revoked/contradicted
 * `unresolved` when the available data cannot sustain any grade.
 */
export type EvidenceGrade = "E0" | "E1" | "E2" | "E3" | "E4" | "E5" | "unresolved";

export type EvidenceValidity = "valid" | "expired" | "not_yet_valid" | "revoked" | "unknown";

export type EvidenceType =
  | "document"
  | "attestation"
  | "system_flag"
  | "legacy_mixed_signal"
  | "unknown";

export interface EvidenceFact {
  /** Catalog code of the requirement this evidence answers. */
  requirementCode: string;
  type: EvidenceType;
  /** True only when a stored artifact was observed. NEVER implies verification. */
  artifactPresent: boolean;
  /** Raw review status as stored (e.g. employee_documents.review_status). */
  reviewStatus: "approved" | "pending" | "rejected" | "expired" | "unknown" | null;
  /** Only set when a real verifier reference exists. Absent => not verified. */
  verifierRef?: string | null;
  validUntil?: string | null;
  /** Opaque provenance label, never free text from a user. */
  source: "employee_documents" | "readiness_projection" | "declared" | "unknown";
  contradictions?: string[];
}

/* ------------------------------------------------------------------ */
/* Requirements & cascade                                              */
/* ------------------------------------------------------------------ */

export type RequirementSource =
  | "legal_regulatory"
  | "client"
  | "location"
  | "role_service"
  | "company_policy"
  | "operational_preference"
  | "unclassified";

/** Cascade precedence — index 0 wins. */
export const CASCADE_ORDER: RequirementSource[] = [
  "legal_regulatory",
  "client",
  "location",
  "role_service",
  "company_policy",
  "operational_preference",
  "unclassified",
];

/** L0–L5 human policy classification. `unclassified` when no human classified it. */
export type PolicyClassification = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "unclassified";

export interface RequirementFact {
  code: string;
  source: RequirementSource;
  classification: PolicyClassification;
  /**
   * A hard stop can ONLY exist when a human classified the policy AND it is in
   * force AND traceable. The engine never infers this.
   */
  explicitHardStop?: {
    approvedBy: string;
    approvedAt: string;
    inForce: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Observable facts                                                    */
/* ------------------------------------------------------------------ */

export type SourceSurface =
  | "shift_detail"
  | "quick_create"
  | "roster"
  | "mobile_assign"
  | "documents"
  | "unknown";

export type TriggerType =
  | "assignment_attempt"
  | "block_shown"
  | "warning_shown"
  | "assignment_completed"
  | "assignment_abandoned"
  | "navigation"
  | "document_review_observed"
  | "persistence_check";

export type SystemReadinessState = "blocked" | "warned" | "clear" | "unknown";

export type HumanAction =
  | "proceeded"
  | "abandoned"
  | "navigated_away"
  | "rejected_ready_worker"
  | "not_observed";

export type AssignmentResult = "assigned" | "not_assigned" | "unknown";

export type AuthorityStatus = "explicit" | "unresolved" | "not_observable";

export type EventualOutcome =
  | "evidence_completed_before_shift"
  | "evidence_completed_after_shift"
  | "evidence_pending_at_payroll"
  | "evidence_still_pending"
  | "unknown";

export interface ObservationFacts {
  observationId: string;
  /** Groups block -> navigation -> assignment into one journey. */
  correlationId: string;
  observedAt: string;
  companyId: string;
  /** Opaque reference. NEVER a name, email, phone or document number. */
  workerRef: string;
  shiftRef: string | null;
  actorRef: string | null;
  clientRef?: string | null;
  locationRef?: string | null;
  shiftStartAt?: string | null;
  roleCode?: string | null;
  serviceCode?: string | null;
  sourceSurface: SourceSurface;
  triggerType: TriggerType;

  /** What the CURRENT production system displayed. Not an OAI judgement. */
  systemReadinessState: SystemReadinessState;
  systemBlockReasons: string[];

  /**
   * `profile_status` may only travel here, as an explicitly untrusted signal.
   * The engine must never read it for a decision.
   */
  legacyMixedSignal?: string | null;

  requirements: RequirementFact[];
  evidence: EvidenceFact[];

  humanAction: HumanAction;
  assignmentResult: AssignmentResult;
  authority: { status: AuthorityStatus; evidenceRef?: string | null };

  navigationCount?: number;
  contextLossDetected?: boolean;
  persistenceIssueDetected?: boolean;
  latencyMsFromBlock?: number | null;
  eventualOutcome?: EventualOutcome;
}

/* ------------------------------------------------------------------ */
/* Record persisted / inspected                                        */
/* ------------------------------------------------------------------ */

export interface EvidenceGradeSummary {
  requirementCode: string;
  grade: EvidenceGrade;
  validity: EvidenceValidity;
  verified: boolean;
}

export interface DocumentStateSummary {
  required: number;
  approved: number;
  receivedNotReviewed: number;
  expired: number;
  missing: number;
  unknown: number;
}

export interface SimulatedEvaluation {
  outcome: SimulatedOutcome;
  reasonCodes: string[];
  winningRequirementSource: RequirementSource | "none";
  winningRequirementCode: string | null;
  subordinateRequirements: string[];
  cascadeConflicts: string[];
  unclassifiedRequirements: string[];
  missingConfiguration: string[];
  evidenceGradeSummary: EvidenceGradeSummary[];
}

export interface ObservationRecordOAI {
  contractVersion: number;
  engineVersion: string;
  ruleVersion: string;

  observationId: string;
  correlationId: string;
  observedAt: string;
  evaluatedAt: string;

  companyId: string;
  workerRef: string;
  shiftRef: string | null;
  actorRef: string | null;
  clientRef: string | null;
  locationRef: string | null;

  sourceSurface: SourceSurface;
  triggerType: TriggerType;

  systemReadinessState: SystemReadinessState;
  systemBlockReasons: string[];
  legacyMixedSignalPresent: boolean;

  documentStateSummary: DocumentStateSummary;
  evidenceGradeSummary: EvidenceGradeSummary[];

  contextAvailable: string[];
  contextMissing: string[];

  simulatedOaiOutcome: SimulatedOutcome;
  simulatedReasonCodes: string[];
  winningRequirementSource: RequirementSource | "none";
  unclassifiedRequirements: string[];
  cascadeConflicts: string[];

  humanAction: HumanAction;
  assignmentResult: AssignmentResult;
  contradictionDetected: boolean;
  authorityStatus: AuthorityStatus;
  eventualOutcome: EventualOutcome;

  navigationCount: number;
  contextLossDetected: boolean;
  persistenceIssueDetected: boolean;
  latencyMsFromBlock: number | null;

  observationOnly: true;
}

/* ------------------------------------------------------------------ */
/* Persistence mismatch (scenario P) — reported, never repaired        */
/* ------------------------------------------------------------------ */

export interface PersistenceProbe {
  observationId: string;
  correlationId: string;
  companyId: string;
  workerRef: string;
  requirementCode: string;
  expectedState: string;
  immediateUiState: string;
  persistedState: string;
  reloadedState: string;
  mismatchDetected: boolean;
  sourceSurface: SourceSurface;
  elapsedMs: number;
  observationOnly: true;
}
