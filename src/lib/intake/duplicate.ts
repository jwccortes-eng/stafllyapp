/**
 * Smart Service Intake — detector canónico de duplicados (Fase 1).
 *
 * Criterios: company_id + service_date + client + venue + horario +
 * service_type + source reference.
 *
 * Nunca se crea un duplicado en silencio: `exact_duplicate` bloquea la
 * creación y `possible_duplicate` exige aceptación humana explícita.
 *
 * Módulo PURO.
 */

import type { DuplicateStatus, ServiceCandidate } from "./candidate";
import { normalizeEntityName } from "./entity-resolution";

/** Servicio ya existente en la compañía (proyección mínima). */
export interface ExistingServiceRow {
  id: string;
  company_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  client_name?: string | null;
  client_id?: string | null;
  venue_name?: string | null;
  location_id?: string | null;
  service_type?: string | null;
  reconciliation_hash?: string | null;
}

export interface DuplicateVerdict {
  status: DuplicateStatus;
  matchedShiftId: string | null;
  reasons: string[];
  score: number;
}

function hhmm(v: string | null | undefined): string {
  return (v ?? "").slice(0, 5);
}

/** Referencia estable de origen: sirve de idempotencia entre reintentos. */
export function buildIntakeSourceReference(c: ServiceCandidate): string {
  return [
    c.companyId,
    c.sourceBatchId ?? "no-batch",
    c.sourceRowId ?? c.sourceReference ?? c.id,
  ].join("|");
}

export function detectDuplicate(
  candidate: ServiceCandidate,
  existing: ExistingServiceRow[],
): DuplicateVerdict {
  const sourceRef = buildIntakeSourceReference(candidate);
  const date = candidate.serviceDate ?? "";
  const start = hhmm(candidate.startTime);
  const end = hhmm(candidate.endTime);
  const client = normalizeEntityName(
    candidate.clientCandidate.suggestedLabel ?? candidate.clientCandidate.raw,
  );
  const venue = normalizeEntityName(
    candidate.venueCandidate.suggestedLabel ?? candidate.venueCandidate.raw,
  );
  const type = normalizeEntityName(candidate.serviceType ?? "");

  let best: DuplicateVerdict = {
    status: "no_match",
    matchedShiftId: null,
    reasons: [],
    score: 0,
  };

  for (const row of existing) {
    // Aislamiento de tenant: nunca comparar entre compañías.
    if (row.company_id !== candidate.companyId) continue;

    // Misma referencia de origen → mismo candidato reimportado.
    if (row.reconciliation_hash && row.reconciliation_hash === sourceRef) {
      return {
        status: "exact_duplicate",
        matchedShiftId: row.id,
        reasons: ["source_reference"],
        score: 1,
      };
    }

    if (row.date !== date || !date) continue;

    const reasons: string[] = ["service_date"];
    let score = 0.3;

    const rowClient = normalizeEntityName(row.client_name ?? "");
    const rowVenue = normalizeEntityName(row.venue_name ?? "");
    const rowType = normalizeEntityName(row.service_type ?? "");

    const clientMatch =
      (!!client && client === rowClient) ||
      (!!candidate.clientCandidate.resolvedId &&
        candidate.clientCandidate.resolvedId === row.client_id);
    const venueMatch =
      (!!venue && venue === rowVenue) ||
      (!!candidate.locationCandidate.resolvedId &&
        candidate.locationCandidate.resolvedId === row.location_id);
    const timeMatch = !!start && start === hhmm(row.start_time) && end === hhmm(row.end_time);
    const typeMatch = !!type && type === rowType;

    if (clientMatch) {
      reasons.push("client");
      score += 0.25;
    }
    if (venueMatch) {
      reasons.push("venue");
      score += 0.25;
    }
    if (timeMatch) {
      reasons.push("time_window");
      score += 0.2;
    }
    if (typeMatch) {
      reasons.push("service_type");
      score += 0.1;
    }

    let status: DuplicateStatus = "no_match";
    if (clientMatch && venueMatch && timeMatch) status = "exact_duplicate";
    else if ((clientMatch || venueMatch) && (timeMatch || typeMatch)) status = "possible_duplicate";
    else if (clientMatch && venueMatch) status = "possible_duplicate";

    if (status !== "no_match" && score > best.score) {
      best = { status, matchedShiftId: row.id, reasons, score: Number(score.toFixed(3)) };
    }
  }

  return best;
}

/** Aplica el veredicto al candidato sin perder el estado de revisión humano. */
export function applyDuplicateVerdict(
  candidate: ServiceCandidate,
  verdict: DuplicateVerdict,
): ServiceCandidate {
  return {
    ...candidate,
    duplicateStatus: verdict.status,
    duplicateShiftId: verdict.matchedShiftId,
  };
}
