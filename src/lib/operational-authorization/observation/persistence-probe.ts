/**
 * OAI F1 — persistence probe (scenario P). PURE comparison.
 *
 * OAI observes and reports the mismatch. It NEVER repairs, retries or writes.
 * The underlying defect is tracked as a separate product defect.
 */
import type { PersistenceProbe, SourceSurface } from "../engine/types";

export interface PersistenceProbeInput {
  observationId: string;
  correlationId: string;
  companyId: string;
  workerRef: string;
  requirementCode: string;
  /** What the user was told would happen, e.g. "approved". */
  expectedState: string;
  /** What the UI displayed immediately after the action. */
  immediateUiState: string;
  /** What the projection returned on the first read-back. */
  persistedState: string;
  /** What the projection returned after a reload / re-entry. */
  reloadedState: string;
  sourceSurface: SourceSurface;
  elapsedMs: number;
}

export function buildPersistenceProbe(input: PersistenceProbeInput): PersistenceProbe {
  const mismatchDetected =
    input.reloadedState !== input.expectedState || input.persistedState !== input.expectedState;

  return {
    observationId: input.observationId,
    correlationId: input.correlationId,
    companyId: input.companyId,
    workerRef: input.workerRef,
    requirementCode: input.requirementCode,
    expectedState: input.expectedState,
    immediateUiState: input.immediateUiState,
    persistedState: input.persistedState,
    reloadedState: input.reloadedState,
    mismatchDetected,
    sourceSurface: input.sourceSurface,
    elapsedMs: input.elapsedMs,
    observationOnly: true,
  };
}
