/**
 * OAI F1 — durable row mapping (PURE).
 *
 * Whitelist only. Any field not listed here can never reach storage.
 * Forbidden by contract: sent_at, retry_count, delivery_status, any queue
 * semantics, any document content, any PII.
 */
import { privacyGate } from "./privacy";
import type { ObservationRecordOAI } from "../engine/types";

export interface OaiObservationRow {
  observation_id: string;
  correlation_id: string;
  contract_version: number;
  engine_version: string;
  rule_version: string;
  observed_at: string;
  evaluated_at: string;
  company_id: string;
  worker_ref: string;
  shift_ref: string | null;
  actor_ref: string | null;
  client_ref: string | null;
  location_ref: string | null;
  source_surface: string;
  trigger_type: string;
  system_readiness_state: string;
  system_block_reasons: string[];
  legacy_mixed_signal_present: boolean;
  document_state_summary: Record<string, number>;
  evidence_grade_summary: Array<Record<string, string | boolean>>;
  context_available: string[];
  context_missing: string[];
  simulated_oai_outcome: string;
  simulated_reason_codes: string[];
  winning_requirement_source: string;
  unclassified_requirements: string[];
  cascade_conflicts: string[];
  human_action: string;
  assignment_result: string;
  contradiction_detected: boolean;
  authority_status: string;
  eventual_outcome: string;
  navigation_count: number;
  context_loss_detected: boolean;
  persistence_issue_detected: boolean;
  latency_ms_from_block: number | null;
  observation_only: true;
}

export function toDurableRow(record: ObservationRecordOAI): OaiObservationRow {
  const safe = privacyGate(record);
  return {
    observation_id: safe.observationId,
    correlation_id: safe.correlationId,
    contract_version: safe.contractVersion,
    engine_version: safe.engineVersion,
    rule_version: safe.ruleVersion,
    observed_at: safe.observedAt,
    evaluated_at: safe.evaluatedAt,
    company_id: safe.companyId,
    worker_ref: safe.workerRef,
    shift_ref: safe.shiftRef,
    actor_ref: safe.actorRef,
    client_ref: safe.clientRef,
    location_ref: safe.locationRef,
    source_surface: safe.sourceSurface,
    trigger_type: safe.triggerType,
    system_readiness_state: safe.systemReadinessState,
    system_block_reasons: safe.systemBlockReasons,
    legacy_mixed_signal_present: safe.legacyMixedSignalPresent,
    document_state_summary: { ...safe.documentStateSummary },
    evidence_grade_summary: safe.evidenceGradeSummary.map((g) => ({
      requirement_code: g.requirementCode,
      grade: g.grade,
      validity: g.validity,
      verified: g.verified,
    })),
    context_available: safe.contextAvailable,
    context_missing: safe.contextMissing,
    simulated_oai_outcome: safe.simulatedOaiOutcome,
    simulated_reason_codes: safe.simulatedReasonCodes,
    winning_requirement_source: safe.winningRequirementSource,
    unclassified_requirements: safe.unclassifiedRequirements,
    cascade_conflicts: safe.cascadeConflicts,
    human_action: safe.humanAction,
    assignment_result: safe.assignmentResult,
    contradiction_detected: safe.contradictionDetected,
    authority_status: safe.authorityStatus,
    eventual_outcome: safe.eventualOutcome,
    navigation_count: safe.navigationCount,
    context_loss_detected: safe.contextLossDetected,
    persistence_issue_detected: safe.persistenceIssueDetected,
    latency_ms_from_block: safe.latencyMsFromBlock,
    observation_only: true,
  };
}
