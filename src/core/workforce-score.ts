/**
 * core/workforce-score.ts
 *
 * Reputation engine — single source of truth for STAFly internal scores
 * AND Parceros public reputation. NEVER duplicates Reviews/review_scores.
 *
 * This module re-exports the existing src/lib/workforce-score.ts implementation
 * and adds product-neutral wrappers (`computeWorkerScore`, `getWorkerReputation`)
 * that return the generic `WorkerReputation` shape from core/types.
 */
import {
  computeWorkforceScore,
  computeWorkforceScoresBatch,
  composeScore,
  type WorkforceScore,
  type WorkforceScoreInput,
} from "@/lib/workforce-score";
import type { WorkerReputation } from "./types";

// Re-export raw engine for back-compat.
export {
  computeWorkforceScore,
  computeWorkforceScoresBatch,
  composeScore,
  type WorkforceScore,
  type WorkforceScoreInput,
};

/** Map raw WorkforceScore → generic WorkerReputation. */
function toReputation(s: WorkforceScore): WorkerReputation {
  const badges: string[] = [];
  if (s.composite >= 90 && s.shiftsNoShow === 0) badges.push("Top Performer");
  if (s.punctuality >= 95 && s.shiftsCompleted >= 5) badges.push("On Time");
  if (s.rating >= 4.5 && s.ratingCount >= 5) badges.push("Highly Rated");
  if (s.reliability >= 95) badges.push("Reliable");
  return {
    employeeId: s.employeeId,
    score: s.composite,
    rating: s.rating,
    ratingCount: s.ratingCount,
    reliability: s.reliability,
    punctuality: s.punctuality,
    badges,
    computedAt: s.computedAt,
  };
}

/** Compute composite score for one worker — returns generic shape. */
export async function computeWorkerScore(
  companyId: string,
  employeeId: string,
  lookbackDays = 60,
): Promise<WorkerReputation> {
  const raw = await computeWorkforceScore({ companyId, employeeId, lookbackDays });
  return toReputation(raw);
}

/** Alias used by Parceros — same data, different verb. */
export const getWorkerReputation = computeWorkerScore;

/** Batch variant for leaderboards / matching. */
export async function getWorkerReputationsBatch(
  companyId: string,
  employeeIds: string[],
  lookbackDays = 60,
): Promise<WorkerReputation[]> {
  const raw = await computeWorkforceScoresBatch(companyId, employeeIds, lookbackDays);
  return raw.map(toReputation);
}
