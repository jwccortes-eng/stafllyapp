/**
 * Adaptador: filas del import de horario (Excel/CSV Connecteam) → candidatos
 * canónicos, para que ImportSchedule pueda reutilizar la bandeja común sin
 * cambiar su pipeline actual.
 *
 * PURO. No toca el flujo existente de ImportSchedule: es opt-in.
 */

import type { RawShiftRow } from "@/lib/import/schedule-traceability";
import { createCandidate, type IntakeSource, type ServiceCandidate } from "./candidate";

export interface ScheduleRowToCandidateContext {
  companyId: string;
  batchId: string | null;
  source?: IntakeSource;
  /** Mapa shiftHash → raw_schedule_import_rows.id, si ya se persistieron. */
  rawRowIds?: Map<string, string>;
}

export function scheduleRowToCandidate(
  row: RawShiftRow,
  ctx: ScheduleRowToCandidateContext,
  index = 0,
): ServiceCandidate {
  return createCandidate({
    id: `${row.shift_code}|${row.date}|${index}`,
    companyId: ctx.companyId,
    source: ctx.source ?? "excel",
    sourceBatchId: ctx.batchId,
    sourceRowId: ctx.rawRowIds?.get(row.shift_code) ?? null,
    sourceReference: row.shift_code,
    serviceDate: row.date || null,
    startTime: (row.start_time || "").slice(0, 5) || null,
    endTime: (row.end_time || "").slice(0, 5) || null,
    clientCandidate: {
      raw: row.job ?? "",
      resolvedId: null,
      suggestedId: null,
      suggestedLabel: null,
      confidence: 0,
      requiresConfirmation: false,
    },
    venueCandidate: {
      raw: row.address ?? "",
      resolvedId: null,
      suggestedId: null,
      suggestedLabel: null,
      confidence: 0,
      requiresConfirmation: false,
    },
    serviceType: row.sub_item ?? null,
    requestedWorkers: row.employees?.length || null,
    notes: row.note ?? null,
  });
}

export function scheduleRowsToCandidates(
  rows: RawShiftRow[],
  ctx: ScheduleRowToCandidateContext,
): ServiceCandidate[] {
  return rows.map((r, i) => scheduleRowToCandidate(r, ctx, i));
}
