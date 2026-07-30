/**
 * F1.2 — durable observation sink.
 *
 * Best-effort, non-blocking, NO retries (retries are delivery mechanics and
 * are forbidden). Writes go exclusively through the `ci-observe` edge function
 * which holds the only credential able to insert. The client has no INSERT
 * policy on `ci_observations`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ObservationRecord } from "../engine/types";
import { toDurableRow, type CiEnvironment, type CiPilotStage } from "./durable-record";
import {
  isDurableObservationEnabled,
  getDurableEnvironment,
  getDurablePilotStage,
  getObservationSampleRate,
} from "../flags";

export interface DurableSinkStats {
  attempted: number;
  accepted: number;
  droppedBySampling: number;
  failed: number;
  lastError: string | null;
}

const stats: DurableSinkStats = {
  attempted: 0,
  accepted: 0,
  droppedBySampling: 0,
  failed: 0,
  lastError: null,
};

export function getDurableSinkStats(): DurableSinkStats {
  return { ...stats };
}

export function resetDurableSinkStats(): void {
  stats.attempted = 0;
  stats.accepted = 0;
  stats.droppedBySampling = 0;
  stats.failed = 0;
  stats.lastError = null;
}

/** Deterministic sampling by event id: same event, same decision. */
export function isSampled(eventId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let hash = 2166136261;
  for (let i = 0; i < eventId.length; i += 1) {
    hash ^= eventId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1000 < Math.round(rate * 1000);
}

export interface PersistOptions {
  environment?: CiEnvironment;
  pilotStage?: CiPilotStage;
}

/**
 * Fire-and-forget persistence. Never throws, never awaits the caller's flow,
 * never retries and never mutates business data.
 */
export function persistObservation(
  record: ObservationRecord,
  options: PersistOptions = {},
): void {
  if (!isDurableObservationEnabled()) return;
  if (!isSampled(record.eventId, getObservationSampleRate())) {
    stats.droppedBySampling += 1;
    return;
  }

  let row;
  try {
    row = toDurableRow(record, {
      environment: options.environment ?? getDurableEnvironment(),
      pilotStage: options.pilotStage ?? getDurablePilotStage(),
    });
  } catch (error) {
    stats.failed += 1;
    stats.lastError = String(error);
    return;
  }

  stats.attempted += 1;
  void supabase.functions
    .invoke("ci-observe", { body: { observation: row } })
    .then(({ error }) => {
      if (error) {
        stats.failed += 1;
        stats.lastError = error.message;
        return;
      }
      stats.accepted += 1;
    })
    .catch((error: unknown) => {
      // Observation must never break or slow down an operational flow.
      stats.failed += 1;
      stats.lastError = String(error);
    });
}
