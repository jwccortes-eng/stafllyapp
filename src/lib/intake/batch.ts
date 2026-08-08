/**
 * Smart Service Intake — batches (Fase 1).
 *
 * NO crea una tabla paralela `service_intake_jobs`. Todo intake vive en
 * `import_batches` con `batch_type='service_intake'` y un `source` del
 * catálogo canónico. Así el source tracking sigue siendo uno solo.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  SERVICE_INTAKE_BATCH_TYPE,
  type IntakeSource,
  type ServiceCandidate,
} from "./candidate";

export interface CreateServiceIntakeBatchInput {
  /** SIEMPRE del contexto autenticado. */
  companyId: string;
  createdBy: string;
  source: IntakeSource;
  fileName?: string | null;
  dateRangeFrom?: string | null;
  dateRangeTo?: string | null;
}

export async function createServiceIntakeBatch(
  input: CreateServiceIntakeBatchInput,
): Promise<string | null> {
  if (!input.companyId) throw new Error("companyId requerido (contexto autenticado)");
  const payload: any = {
    company_id: input.companyId,
    created_by: input.createdBy,
    batch_type: SERVICE_INTAKE_BATCH_TYPE,
    source: input.source,
    schedule_file_name: input.fileName ?? null,
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
    console.error("[intake] createServiceIntakeBatch failed:", error);
    return null;
  }
  return (data as any)?.id ?? null;
}

/** Guarda el input crudo del intake para trazabilidad (nunca se pierde). */
export async function persistIntakeRawRows(
  batchId: string,
  companyId: string,
  rows: Array<{ rowNumber: number; raw: Record<string, unknown>; rowHash: string }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (rows.length === 0) return map;
  const payloads = rows.map((r) => ({
    batch_id: batchId,
    company_id: companyId,
    row_number: r.rowNumber,
    raw_data: r.raw as any,
    row_hash: r.rowHash,
  })) as any[];

  const CHUNK = 200;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("raw_schedule_import_rows")
      .insert(payloads.slice(i, i + CHUNK))
      .select("id, row_hash");
    if (error) {
      console.error("[intake] persistIntakeRawRows chunk failed:", error);
      continue;
    }
    (data ?? []).forEach((r: any) => map.set(r.row_hash, r.id));
  }
  return map;
}

export interface CloseIntakeBatchInput {
  draftsCreated: number;
  duplicatesSkipped: number;
  excluded: number;
  warnings?: unknown[];
  errors?: unknown[];
}

export async function closeServiceIntakeBatch(
  batchId: string,
  input: CloseIntakeBatchInput,
): Promise<void> {
  const { error } = await supabase
    .from("import_batches")
    .update({
      status: "completed",
      schedule_shifts_created: input.draftsCreated,
      schedule_duplicates_skipped: input.duplicatesSkipped,
      warnings: (input.warnings ?? []) as any,
      errors: (input.errors ?? []) as any,
    } as any)
    .eq("id", batchId);
  if (error) console.error("[intake] closeServiceIntakeBatch failed:", error);
}

/** Resumen de la bandeja para cerrar el batch con números honestos. */
export function summarizeCandidates(candidates: ServiceCandidate[]): CloseIntakeBatchInput {
  return {
    draftsCreated: candidates.filter((c) => c.createdShiftId).length,
    duplicatesSkipped: candidates.filter(
      (c) => c.duplicateStatus !== "no_match" && !c.createdShiftId,
    ).length,
    excluded: candidates.filter((c) => c.reviewStatus === "excluded").length,
  };
}
