/**
 * Schedule-import traceability helpers (Fase 4).
 *
 * Every browser-side Connecteam schedule import MUST persist its source
 * data so we can always recover what came in the file — even if employee
 * matching fails. This module centralizes the writes to:
 *   - import_batches            (one row per import)
 *   - raw_schedule_import_rows  (one row per source ShiftGroup)
 *   - normalized_schedule_rows  (one row per group × employee, post-match)
 *   - migration_shift_mapping   (one row per scheduled_shift created/updated)
 *   - scheduled_shifts stamps   (reconciliation_hash, created_by, import_batch_id)
 *
 * Idempotency: row_hash + (company_id, shift_code, date, start, end)
 * make re-imports of the same file safe.
 */

import { supabase } from "@/integrations/supabase/client";

export interface RawShiftRow {
  /** Composite logical key — used for dedup + reconciliation_hash. */
  shift_code: string;
  date: string;          // YYYY-MM-DD
  start_time: string;    // HH:mm
  end_time: string;      // HH:mm
  job: string;
  sub_item?: string;
  address?: string;
  note?: string;
  tags?: string;
  status?: string;
  employees: string[];
  employee_statuses: string[];
  /** Free-form raw cells from the parser, useful for debugging. */
  raw?: Record<string, unknown>;
}

export interface CreateBatchInput {
  companyId: string;
  createdBy: string;
  fileName: string | null;
  dateRangeFrom?: string | null;
  dateRangeTo?: string | null;
}

/** Stable composite key used as reconciliation_hash and dedup key. */
export function buildShiftHash(
  companyId: string,
  shiftCode: string,
  date: string,
  startTime: string,
  endTime: string,
): string {
  // Lower-case, trim, fixed order. Not cryptographic — just deterministic.
  const parts = [
    companyId,
    (shiftCode || "").trim(),
    (date || "").trim(),
    (startTime || "").slice(0, 5),
    (endTime || "").slice(0, 5),
  ];
  return parts.join("|");
}

/** Per-row hash for raw_schedule_import_rows dedup. Includes employees so
 *  the same shift coming with a different roster still produces a new row. */
export function buildRowHash(row: RawShiftRow): string {
  const empSig = [...row.employees].sort().join(",").toLowerCase();
  return [
    row.shift_code,
    row.date,
    row.start_time,
    row.end_time,
    (row.job || "").toLowerCase(),
    empSig,
  ].join("|");
}

/** Create the import_batch and return its id. */
export async function createImportBatch(input: CreateBatchInput): Promise<string | null> {
  const payload: any = {
    company_id: input.companyId,
    created_by: input.createdBy,
    batch_type: "schedule",
    source: "connecteam",
    schedule_file_name: input.fileName,
    date_range_from: input.dateRangeFrom ?? null,
    date_range_to: input.dateRangeTo ?? null,
    status: "in_progress",
  };
  const { data, error } = await supabase
    .from("import_batches")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    console.error("[traceability] createImportBatch failed:", error);
    return null;
  }
  return (data as any)?.id ?? null;
}

/** Persist raw rows. Returns a map: shiftHash → raw_row_id. */
export async function persistRawRows(
  batchId: string,
  companyId: string,
  rows: RawShiftRow[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (rows.length === 0) return result;

  const payloads = rows.map((r, idx) => ({
    batch_id: batchId,
    company_id: companyId,
    row_number: idx + 1,
    raw_data: {
      shift_code: r.shift_code,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      job: r.job,
      sub_item: r.sub_item ?? "",
      address: r.address ?? "",
      note: r.note ?? "",
      tags: r.tags ?? "",
      status: r.status ?? "",
      employees: r.employees,
      employee_statuses: r.employee_statuses,
      raw: r.raw ?? {},
    },
    row_hash: buildRowHash(r),
  })) as any[];

  // Insert in chunks to stay under request limits
  const CHUNK = 200;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const slice = payloads.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("raw_schedule_import_rows")
      .insert(slice)
      .select("id, raw_data");
    if (error) {
      console.error("[traceability] persistRawRows chunk failed:", error);
      continue;
    }
    (data ?? []).forEach((r: any) => {
      const rd = r.raw_data ?? {};
      const hash = buildShiftHash(
        companyId,
        rd.shift_code ?? "",
        rd.date ?? "",
        rd.start_time ?? "",
        rd.end_time ?? "",
      );
      result.set(hash, r.id);
    });
  }
  return result;
}

export interface NormalizedRowInput {
  rawRowId: string;
  matchedEmployeeId: string | null;
  employeeNameRaw: string;
  employeeNameNormalized: string;
  matchConfidence: number;
  matchMethod: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  shiftTitle: string;
  externalShiftId: string;
  clientName: string;
  locationName?: string;
  payType: string;
  status: "matched" | "unmatched" | "ambiguous" | "system";
  notes?: string | null;
}

export async function persistNormalizedRows(
  batchId: string,
  companyId: string,
  rows: NormalizedRowInput[],
): Promise<void> {
  if (rows.length === 0) return;
  const payloads = rows.map(r => ({
    batch_id: batchId,
    company_id: companyId,
    raw_row_id: r.rawRowId,
    matched_employee_id: r.matchedEmployeeId,
    employee_name_raw: r.employeeNameRaw,
    employee_name_normalized: r.employeeNameNormalized,
    employee_match_confidence: r.matchConfidence,
    employee_match_method: r.matchMethod,
    work_date: r.workDate,
    start_time: r.startTime,
    end_time: r.endTime,
    shift_title: r.shiftTitle,
    external_shift_id: r.externalShiftId,
    client_name: r.clientName,
    location_name: r.locationName ?? null,
    pay_type: r.payType,
    notes: [r.notes, `match_status=${r.status}`].filter(Boolean).join(" | "),
  })) as any[];

  const CHUNK = 200;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const slice = payloads.slice(i, i + CHUNK);
    const { error } = await supabase.from("normalized_schedule_rows").insert(slice);
    if (error) {
      console.error("[traceability] persistNormalizedRows chunk failed:", error);
    }
  }
}

export interface ShiftMappingInput {
  reconciliationHash: string;
  staflyShiftId: string;
  matchStatus: "created" | "reconciled" | "unmatched";
  rawRowId?: string | null;
  rawData?: Record<string, unknown>;
}

/** Upsert a row in migration_shift_mapping keyed by (company_id, connecteam_ref). */
export async function upsertShiftMapping(
  companyId: string,
  m: ShiftMappingInput,
): Promise<void> {
  const payload = {
    company_id: companyId,
    connecteam_ref: m.reconciliationHash,
    connecteam_data: {
      raw_row_id: m.rawRowId ?? null,
      ...(m.rawData ?? {}),
    },
    stafly_shift_id: m.staflyShiftId,
    match_status: m.matchStatus,
  } as any;
  const { error } = await supabase
    .from("migration_shift_mapping")
    .upsert(payload, { onConflict: "company_id,connecteam_ref" });
  if (error) {
    console.error("[traceability] upsertShiftMapping failed:", error);
  }
}

export interface FinalizeBatchInput {
  shiftsCreated: number;
  shiftsReconciled: number;
  assignmentsCreated: number;
  duplicatesSkipped: number;
  clientsCreated: number;
  unmatchedEmployees: string[];
  warnings?: unknown[];
  errors?: unknown[];
}

export async function finalizeImportBatch(
  batchId: string,
  input: FinalizeBatchInput,
): Promise<void> {
  const { error } = await supabase
    .from("import_batches")
    .update({
      status: "completed",
      schedule_shifts_created: input.shiftsCreated,
      schedule_assignments_created: input.assignmentsCreated,
      schedule_duplicates_skipped: input.duplicatesSkipped,
      schedule_clients_created: input.clientsCreated,
      unmatched_employees: input.unmatchedEmployees as any,
      warnings: (input.warnings ?? []) as any,
      errors: (input.errors ?? []) as any,
    } as any)
    .eq("id", batchId);
  if (error) {
    console.error("[traceability] finalizeImportBatch failed:", error);
  }
}

export async function failImportBatch(batchId: string, message: string): Promise<void> {
  await supabase
    .from("import_batches")
    .update({ status: "failed", errors: [{ message }] as any } as any)
    .eq("id", batchId);
}
