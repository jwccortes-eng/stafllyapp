/**
 * P0 — BULK SERVICE CREATION · escritura
 *
 * Única puerta de escritura de la creación masiva. Cada fila del plan se
 * persiste con el MISMO payload canónico que el resto del producto
 * (`buildCanonicalServiceInsert`) y con idempotencia por
 * (company_id, reconciliation_hash), igual que las series y Smart Intake.
 *
 * Escribe SOLO en `scheduled_shifts` como borrador. No publica, no asigna
 * personal, no toca payroll, time entries ni Connecteam.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildCanonicalServiceInsert } from "./recurrence";
import type { BulkPlan, BulkPlanRow, BulkRowOutcome } from "./bulk-service-creation";

async function findExisting(companyId: string, sourceRef: string) {
  const { data } = await supabase
    .from("scheduled_shifts")
    .select("id, shift_code")
    .eq("company_id", companyId)
    .eq("reconciliation_hash", sourceRef)
    .is("deleted_at", null)
    .maybeSingle();
  return data as { id: string; shift_code: string | null } | null;
}

async function createOne(
  row: BulkPlanRow,
  ctx: { companyId: string; userId: string },
): Promise<BulkRowOutcome> {
  const base = {
    rowId: row.rowId,
    date: row.date,
    shiftId: null as string | null,
    ref: null as string | null,
    error: null as string | null,
  };

  // Idempotencia: doble tap o reintento reutiliza el Servicio ya creado.
  const existing = await findExisting(ctx.companyId, row.sourceRef);
  if (existing?.id) {
    return { ...base, status: "reused", shiftId: existing.id, ref: existing.shift_code };
  }

  const payload = buildCanonicalServiceInsert({
    snapshot: row.snapshot,
    date: row.date,
    sourceRef: row.sourceRef,
    createdBy: ctx.userId,
    draft: true,
  }) as Record<string, unknown>;

  // PENDIENTE ≠ 0: sin personal definido, `slots` viaja como NULL.
  payload.slots = row.headcount;
  payload.status = "open";

  const { data, error } = await supabase
    .from("scheduled_shifts")
    .insert(payload as never)
    .select("id, shift_code")
    .single();

  if (error || !data?.id) {
    // Carrera: otro intento pudo haber insertado la misma referencia.
    const retry = await findExisting(ctx.companyId, row.sourceRef);
    if (retry?.id) {
      return { ...base, status: "reused", shiftId: retry.id, ref: retry.shift_code };
    }
    return { ...base, status: "failed", error: error?.message ?? "insert_failed" };
  }

  return {
    ...base,
    status: "created",
    shiftId: data.id as string,
    ref: (data as { shift_code: string | null }).shift_code,
  };
}

/** Ejecuta el plan fila a fila. Un fallo nunca aborta el resto del lote. */
export async function createBulkDraftServices(
  plan: BulkPlan,
  ctx: { companyId: string; userId: string },
  onProgress?: (done: number, total: number) => void,
): Promise<BulkRowOutcome[]> {
  const outcomes: BulkRowOutcome[] = [];
  for (const row of plan.rows) {
    try {
      outcomes.push(await createOne(row, ctx));
    } catch (e) {
      outcomes.push({
        rowId: row.rowId,
        date: row.date,
        status: "failed",
        shiftId: null,
        ref: null,
        error: e instanceof Error ? e.message : "unexpected_error",
      });
    }
    onProgress?.(outcomes.length, plan.rows.length);
  }
  return outcomes;
}
