/**
 * OAI F1 — single emission boundary.
 *
 * This is the ONLY module allowed to run the engine from a host surface.
 * It is fail-silent by construction: if anything throws, the operational flow
 * is unaffected. Removing every call to `observeAssignmentAttempt` is
 * rollback level 2; turning the flags off is rollback level 1.
 */
import { observeAuthorization } from "../../engine/observe";
import { collectSchedulingFacts, type SchedulingObservationInput } from "./collect-facts";
import { createMemorySink, type OaiSink } from "../../observation/sink";
import { persistOaiObservation } from "../../observation/durable-sink";
import { isCompanyObserved, isObservationEnabled } from "../../flags";
import { getJourney } from "../../observation/journey";
import type { ObservationRecordOAI } from "../../engine/types";

let sink: OaiSink | null = null;

export function getOaiSink(): OaiSink {
  if (!sink) sink = createMemorySink();
  return sink;
}

export function resetOaiSink(): void {
  sink = null;
}

export function observeAssignmentAttempt(
  input: SchedulingObservationInput,
): ObservationRecordOAI | null {
  try {
    if (!isObservationEnabled()) return null;
    if (!isCompanyObserved(input.companyId)) return null;

    const facts = collectSchedulingFacts(input);
    const journey = getJourney(input.correlationId);
    const record = observeAuthorization(facts, {
      evaluatedAt: new Date().toISOString(),
      evidenceChangedBetween: journey?.evidenceChangedDuringJourney ?? false,
    });

    getOaiSink().write(record);
    persistOaiObservation(record);
    return record;
  } catch {
    // Observation must never break, block or slow down an operational flow.
    return null;
  }
}
