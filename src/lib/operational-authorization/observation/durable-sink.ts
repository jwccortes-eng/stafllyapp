/**
 * OAI F1 — durable sink.
 *
 * Fire-and-forget, NO retries (retries are queue/delivery mechanics and are
 * forbidden). The only write path is the `oai-observe` edge function; the
 * browser client has no INSERT policy on `oai_observations`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ObservationRecordOAI } from "../engine/types";
import { toDurableRow } from "./durable-record";
import { isPrivacyViolation } from "./privacy";
import { getDailyCap, isCompanyObserved, isPersistenceEnabled } from "../flags";

export interface OaiSinkStats {
  attempted: number;
  accepted: number;
  failed: number;
  droppedByCap: number;
  droppedByPrivacy: number;
  lastError: string | null;
}

const stats: OaiSinkStats = {
  attempted: 0,
  accepted: 0,
  failed: 0,
  droppedByCap: 0,
  droppedByPrivacy: 0,
  lastError: null,
};

let capDay = "";
let capCount = 0;

export function getOaiSinkStats(): OaiSinkStats {
  return { ...stats };
}

export function resetOaiSinkStats(): void {
  stats.attempted = 0;
  stats.accepted = 0;
  stats.failed = 0;
  stats.droppedByCap = 0;
  stats.droppedByPrivacy = 0;
  stats.lastError = null;
  capDay = "";
  capCount = 0;
}

function withinDailyCap(observedAt: string): boolean {
  const day = observedAt.slice(0, 10);
  if (day !== capDay) {
    capDay = day;
    capCount = 0;
  }
  if (capCount >= getDailyCap()) return false;
  capCount += 1;
  return true;
}

/** Never throws, never awaits the caller, never retries, never mutates business data. */
export function persistOaiObservation(record: ObservationRecordOAI): void {
  if (!isPersistenceEnabled()) return;
  if (!isCompanyObserved(record.companyId)) return;
  if (!withinDailyCap(record.observedAt)) {
    stats.droppedByCap += 1;
    return;
  }

  let row;
  try {
    row = toDurableRow(record);
  } catch (error) {
    if (isPrivacyViolation(error)) stats.droppedByPrivacy += 1;
    else stats.failed += 1;
    stats.lastError = String(error);
    return;
  }

  stats.attempted += 1;
  void supabase.functions
    .invoke("oai-observe", { body: { observation: row } })
    .then(({ error }) => {
      if (error) {
        stats.failed += 1;
        stats.lastError = error.message;
        return;
      }
      stats.accepted += 1;
    })
    .catch((error: unknown) => {
      stats.failed += 1;
      stats.lastError = String(error);
    });
}
