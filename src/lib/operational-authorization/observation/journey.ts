/**
 * OAI F1 — journey tracker (context loss / navigation).
 *
 * Minimal instrumentation. Records STEP TYPES only — never selection labels,
 * never document content, never free text.
 */
import type { SourceSurface } from "../engine/types";

export type JourneyStep =
  | "assignment_attempt"
  | "block_shown"
  | "warning_shown"
  | "left_to_documents"
  | "worker_or_document_selected"
  | "review_observed"
  | "returned_to_shift"
  | "selection_lost"
  | "new_search"
  | "assignment_completed"
  | "abandoned";

export interface JourneyState {
  correlationId: string;
  companyId: string;
  workerRef: string;
  shiftRef: string | null;
  startedAt: number;
  steps: JourneyStep[];
  navigationCount: number;
  contextLossDetected: boolean;
  evidenceChangedDuringJourney: boolean;
  lastSurface: SourceSurface;
  blockedAt: number | null;
}

const journeys = new Map<string, JourneyState>();

const NAVIGATION_STEPS: ReadonlySet<JourneyStep> = new Set([
  "left_to_documents",
  "returned_to_shift",
  "new_search",
]);

export function startJourney(input: {
  correlationId: string;
  companyId: string;
  workerRef: string;
  shiftRef: string | null;
  surface: SourceSurface;
  now?: number;
}): JourneyState {
  const state: JourneyState = {
    correlationId: input.correlationId,
    companyId: input.companyId,
    workerRef: input.workerRef,
    shiftRef: input.shiftRef,
    startedAt: input.now ?? Date.now(),
    steps: [],
    navigationCount: 0,
    contextLossDetected: false,
    evidenceChangedDuringJourney: false,
    lastSurface: input.surface,
    blockedAt: null,
  };
  journeys.set(input.correlationId, state);
  return state;
}

export function recordStep(
  correlationId: string,
  step: JourneyStep,
  options: { surface?: SourceSurface; now?: number; evidenceChanged?: boolean } = {},
): JourneyState | null {
  const state = journeys.get(correlationId);
  if (!state) return null;
  state.steps.push(step);
  if (NAVIGATION_STEPS.has(step)) state.navigationCount += 1;
  if (step === "selection_lost") state.contextLossDetected = true;
  if (step === "block_shown" || step === "warning_shown") {
    state.blockedAt = options.now ?? Date.now();
  }
  if (options.evidenceChanged) state.evidenceChangedDuringJourney = true;
  if (options.surface) state.lastSurface = options.surface;
  return state;
}

/**
 * Context loss is asserted, not guessed: returning to the assignment surface
 * without the previously selected worker/shift in effect.
 */
export function evaluateReturn(
  correlationId: string,
  returned: { workerRef: string | null; shiftRef: string | null },
): boolean {
  const state = journeys.get(correlationId);
  if (!state) return false;
  const lost =
    returned.workerRef !== state.workerRef || returned.shiftRef !== state.shiftRef;
  recordStep(correlationId, lost ? "selection_lost" : "returned_to_shift");
  return lost;
}

export function getJourney(correlationId: string): JourneyState | null {
  return journeys.get(correlationId) ?? null;
}

export function endJourney(correlationId: string): JourneyState | null {
  const state = journeys.get(correlationId) ?? null;
  journeys.delete(correlationId);
  return state;
}

export function resetJourneys(): void {
  journeys.clear();
}

export function latencyFromBlock(correlationId: string, now = Date.now()): number | null {
  const state = journeys.get(correlationId);
  if (!state || state.blockedAt === null) return null;
  return Math.max(0, now - state.blockedAt);
}
