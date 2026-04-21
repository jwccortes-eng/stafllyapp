/**
 * core/types.ts
 *
 * Generic vocabulary shared by STAFly (control panel) and Parceros (marketplace).
 * Product-specific names (shift, job, assignment, opportunity) are mapped via
 * adapters in `core/adapters/*`.
 *
 * Rule: this file has ZERO runtime dependencies. Types only.
 */

/** A scheduled unit of work — STAFly calls it a "shift", Parceros calls it a "job". */
export interface WorkAssignment {
  id: string;
  companyId: string;
  title: string;
  startAt: string;             // ISO
  endAt: string | null;        // ISO
  zone: string | null;         // location / borough / client label
  requiredSlots: number;
  filledSlots: number;
  status: "draft" | "open" | "published" | "in_progress" | "completed" | "cancelled";
  meta?: Record<string, unknown>;
}

/** A worker-facing opportunity — what Parceros surfaces in its feed. */
export interface WorkOpportunity {
  assignmentId: string;
  companyId: string;
  title: string;
  startAt: string;
  zone: string | null;
  payHint: string | null;      // optional display string ("$25/h")
  matchScore: number;          // 0–100
  reasons: string[];           // why this matched the worker
}

/** A worker we can dispatch / surface — agnostic of STAFly/Parceros. */
export interface CoreWorker {
  employeeId: string;
  companyId: string;
  fullName: string;
  avatarUrl: string | null;
  /** Aggregated reputation snapshot — see WorkerReputation. */
  reputation?: WorkerReputation;
}

/** Reputation snapshot — shared by STAFly internal score & Parceros public profile. */
export interface WorkerReputation {
  employeeId: string;
  /** 0–100 composite. */
  score: number;
  /** 0–5 raw average from review_scores. */
  rating: number;
  ratingCount: number;
  /** 0–100. Penalises no-shows / lates. */
  reliability: number;
  /** 0–100. % on-time arrivals last 60d. */
  punctuality: number;
  badges: string[];
  computedAt: string;
}

/** Operational alert — neutral, UI-agnostic. */
export interface CoreAlert {
  id: string;
  kind:
    | "UNDERSTAFFED"
    | "LOW_COVERAGE_SOON"
    | "NO_SHOW_SPIKE"
    | "LATE_ARRIVALS"
    | "OPEN_CLOCK"
    | "INACTIVE_WORKFORCE";
  severity: "critical" | "high" | "warning" | "info";
  message: string;
  zone?: string;
  assignmentIds: string[];     // generic name (STAFly maps to shiftIds)
  employeeIds?: string[];
  meta?: Record<string, unknown>;
}

/** A candidate match for a given assignment. */
export interface MatchCandidate {
  worker: CoreWorker;
  /** 0–100. Higher = better fit. */
  matchScore: number;
  /** Human-readable reasons (skill match, distance, reputation, availability). */
  reasons: string[];
  /** True if worker can be assigned right now (available, not double-booked). */
  available: boolean;
}

/** Output of suggestAssignments — neutral suggestion shape. */
export interface AssignmentSuggestion {
  assignmentId: string;
  missingSlots: number;
  candidates: MatchCandidate[];
  /** 0–1 — how confident the engine is the suggestion will succeed. */
  confidence: number;
  /** "REPLACE_WORKERS" | "BROADCAST" | "NO_ACTION". */
  recommendedAction: "REPLACE_WORKERS" | "BROADCAST" | "NO_ACTION";
  reason: string;
}

/** Dispatch execution mode — chosen by the product (STAFly vs Parceros). */
export type DispatchMode = "assist" | "semi_auto" | "auto";

/** Read-only dispatch plan. Core never executes — it returns this. */
export interface DispatchPlan {
  assignmentId: string;
  mode: DispatchMode;
  suggestion: AssignmentSuggestion;
  /** What a writer would do if invoked. Useful for UI preview. */
  intendedWrites: Array<
    | { kind: "INSERT_ASSIGNMENT"; employeeId: string }
    | { kind: "BROADCAST"; recipientCount: number }
  >;
  /** Safety guardrails the writer MUST re-check. */
  guards: {
    minConfidence: number;
    maxStartsInMinutes: number;
    maxMissingPerAssignment: number;
    minTopCandidateScore: number;
  };
}
