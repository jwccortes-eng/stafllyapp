/**
 * core/dispatch-engine.ts
 *
 * Pure, read-only dispatch brain. Shared by STAFly (replacement suggestions)
 * and Parceros (worker→job matching).
 *
 * **CORE IS READ-ONLY.** This module never inserts assignments, never broadcasts,
 * never writes to payroll. Side-effects live in `src/lib/dispatch-writers.ts`.
 *
 * Reuses existing logic:
 *   - operations-intelligence (alerts, coverage)
 *   - operations-actions.suggestReplacements (candidate sourcing + scoring)
 *   - workforce-score (reputation blending)
 */
import { supabase } from "@/integrations/supabase/client";
import {
  suggestReplacements,
  type ReplacementCandidate,
} from "@/lib/operations-actions";
import { computeCoverageBatch } from "@/lib/operations-intelligence";
import { getWorkerReputationsBatch } from "./workforce-score";
import type {
  AssignmentSuggestion,
  CoreWorker,
  DispatchMode,
  DispatchPlan,
  MatchCandidate,
  WorkerReputation,
} from "./types";

// ─── Safety guardrails (mirror lib/auto-dispatch.AUTO_SAFETY) ──────────────
export const CORE_DISPATCH_GUARDS = {
  minConfidence: 0.9,
  maxStartsInMinutes: 120,
  maxMissingPerAssignment: 3,
  minTopCandidateScore: 80,
} as const;

// ─── Candidate sourcing ────────────────────────────────────────────────────

/**
 * Get ranked candidates for an assignment (a.k.a. shift_id).
 * Returns generic MatchCandidate[] — product-neutral.
 */
export async function getCandidatesForShift(
  assignmentId: string,
  opts: { limit?: number; excludeEmployeeIds?: string[] } = {},
): Promise<MatchCandidate[]> {
  const raw = await suggestReplacements(assignmentId, opts);
  // Resolve company_id once to enrich with reputation in batch.
  const { data: shift } = await supabase
    .from("scheduled_shifts")
    .select("company_id")
    .eq("id", assignmentId)
    .maybeSingle();
  const companyId = (shift as any)?.company_id as string | undefined;

  const reputations = companyId
    ? await getWorkerReputationsBatch(companyId, raw.map(r => r.employeeId))
    : [];
  const repMap = new Map(reputations.map(r => [r.employeeId, r]));

  return raw.map(r => candidateFrom(r, repMap.get(r.employeeId), companyId ?? ""));
}

/**
 * Compute a normalised match score (0–100) blending raw fit + reputation.
 * Pure — no I/O. Useful for unit tests.
 */
export function computeMatchScore(
  candidate: { score: number },
  reputation?: WorkerReputation,
): number {
  const base = Math.max(0, Math.min(100, candidate.score ?? 0));
  if (!reputation) return base;
  // 70% raw fit + 30% reputation composite
  return Math.round(base * 0.7 + reputation.score * 0.3);
}

function candidateFrom(
  c: ReplacementCandidate,
  rep: WorkerReputation | undefined,
  companyId: string,
): MatchCandidate {
  const worker: CoreWorker = {
    employeeId: c.employeeId,
    companyId,
    fullName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Worker",
    avatarUrl: (c as any).avatarUrl ?? null,
    reputation: rep,
  };
  const reasons: string[] = [];
  if ((c as any).distanceKm != null) reasons.push(`${(c as any).distanceKm.toFixed(1)} km away`);
  if (rep?.rating && rep.ratingCount >= 3) reasons.push(`${rep.rating.toFixed(1)}★ (${rep.ratingCount})`);
  if (rep?.reliability && rep.reliability >= 90) reasons.push("Reliable");
  if ((c as any).reasons?.length) reasons.push(...((c as any).reasons as string[]));
  return {
    worker,
    matchScore: computeMatchScore(c, rep),
    reasons,
    available: (c as any).available ?? true,
  };
}

// ─── Suggestion ────────────────────────────────────────────────────────────

/**
 * Build a neutral AssignmentSuggestion for a single shift.
 * Read-only.
 */
export async function suggestAssignments(
  assignmentId: string,
): Promise<AssignmentSuggestion> {
  const candidates = await getCandidatesForShift(assignmentId, { limit: 5 });
  const cov = await computeCoverageBatch([assignmentId]);
  const c = cov[0];
  const missing = c ? Math.max(0, c.required - c.assigned) : 0;
  const top = candidates[0];

  let confidence = 0;
  let recommended: AssignmentSuggestion["recommendedAction"] = "NO_ACTION";
  let reason = "Insufficient signal";

  if (missing > 0 && top) {
    const startsIn = c?.startsInMinutes ?? Infinity;
    const urgency = Math.max(0, Math.min(1, 1 - startsIn / 240));
    const fit = top.matchScore / 100;
    const depth = Math.min(1, candidates.filter(x => x.available).length / Math.max(1, missing));
    confidence = Math.round((urgency * 0.35 + fit * 0.4 + depth * 0.25) * 1000) / 1000;
    if (top.matchScore >= 70) {
      recommended = "REPLACE_WORKERS";
      reason = `${candidates.length} candidate${candidates.length > 1 ? "s" : ""} found, top fit ${top.matchScore}`;
    } else {
      recommended = "BROADCAST";
      reason = "No strong fit — broadcast to active workforce";
    }
  } else if (missing > 0) {
    recommended = "BROADCAST";
    reason = "No candidates available — broadcast";
    confidence = 0.4;
  }

  return {
    assignmentId,
    missingSlots: missing,
    candidates,
    confidence,
    recommendedAction: recommended,
    reason,
  };
}

// ─── Dispatch plan (read-only — describes what would happen) ───────────────

/**
 * Build a DispatchPlan describing what a writer WOULD do, without doing it.
 * Writers (`src/lib/dispatch-writers.ts`) consume this and apply guardrails.
 */
export async function executeDispatch(
  assignmentId: string,
  mode: DispatchMode,
): Promise<DispatchPlan> {
  const suggestion = await suggestAssignments(assignmentId);
  const intendedWrites: DispatchPlan["intendedWrites"] = [];

  if (suggestion.recommendedAction === "REPLACE_WORKERS") {
    const slots = Math.min(suggestion.missingSlots, suggestion.candidates.length);
    for (let i = 0; i < slots; i++) {
      intendedWrites.push({
        kind: "INSERT_ASSIGNMENT",
        employeeId: suggestion.candidates[i].worker.employeeId,
      });
    }
  } else if (suggestion.recommendedAction === "BROADCAST") {
    intendedWrites.push({ kind: "BROADCAST", recipientCount: suggestion.candidates.length });
  }

  return {
    assignmentId,
    mode,
    suggestion,
    intendedWrites,
    guards: { ...CORE_DISPATCH_GUARDS },
  };
}
