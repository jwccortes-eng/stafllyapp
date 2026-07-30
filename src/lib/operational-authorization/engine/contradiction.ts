/**
 * OAI F1 — contradiction detection (PURE).
 *
 * A contradiction is a DIVERGENCE, not an authorization. There is no override
 * object and no "authorized override" wording anywhere in this module.
 */
import type { AssignmentResult, HumanAction, SystemReadinessState } from "./types";

export interface ContradictionInput {
  systemReadinessState: SystemReadinessState;
  humanAction: HumanAction;
  assignmentResult: AssignmentResult;
  /** True when the evidence set changed between the block and the assignment. */
  evidenceChangedBetween?: boolean;
}

/**
 * Contradiction when:
 *  - the system blocked or warned AND the coordinator finally assigned; or
 *  - the system considered the worker clear AND the coordinator rejected them.
 *
 * If the evidence changed in between, it is a RESOLVED block, not a contradiction.
 */
export function detectContradiction(input: ContradictionInput): boolean {
  if (input.evidenceChangedBetween) return false;

  const systemNegative =
    input.systemReadinessState === "blocked" || input.systemReadinessState === "warned";

  if (systemNegative && input.assignmentResult === "assigned") return true;

  if (
    input.systemReadinessState === "clear" &&
    input.humanAction === "rejected_ready_worker"
  ) {
    return true;
  }

  return false;
}
