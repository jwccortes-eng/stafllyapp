/**
 * Smart Service Intake — helper canónico de creación de Servicio draft.
 *
 * ÚNICA puerta de escritura del carril de intake.
 *
 * Garantías:
 *  - escribe SOLO en `scheduled_shifts` (nunca en la tabla legacy `shifts`);
 *  - `publication_status='draft'` y `status='open'` (no publica);
 *  - `company_id` viene del contexto autenticado, nunca del contenido;
 *  - preserva `import_batch_id` y `reconciliation_hash` (source reference);
 *  - idempotente por (company_id, reconciliation_hash);
 *  - verifica persistencia real releyendo la fila;
 *  - no crea asignaciones, no notifica, no toca payroll ni time_entries.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  canCreateDraft,
  candidateTitle,
  type ServiceCandidate,
} from "./candidate";
import { buildIntakeSourceReference } from "./duplicate";

export interface CreateDraftContext {
  /** SIEMPRE del contexto autenticado. */
  companyId: string;
  userId: string;
}

export type CreateDraftOutcome =
  | { status: "created"; shiftId: string; candidateId: string }
  | { status: "reused"; shiftId: string; candidateId: string }
  | { status: "blocked"; reason: string; candidateId: string }
  | { status: "error"; reason: string; candidateId: string };

/** Payload exacto que se escribe. Expuesto para tests y auditoría. */
export function buildDraftPayload(
  candidate: ServiceCandidate,
  ctx: CreateDraftContext,
): Record<string, unknown> {
  return {
    company_id: ctx.companyId,
    title: candidateTitle(candidate),
    date: candidate.serviceDate,
    start_time: candidate.startTime,
    end_time: candidate.endTime,
    slots: candidate.requestedWorkers ?? 1,
    client_id: candidate.clientCandidate.resolvedId,
    location_id: candidate.locationCandidate.resolvedId,
    job_site_address: candidate.venueCandidate.raw || null,
    notes: candidate.notes,
    status: "open",
    publication_status: "draft",
    published_at: null,
    published_by: null,
    claimable: false,
    created_by: ctx.userId,
    import_batch_id: candidate.sourceBatchId,
    reconciliation_hash: buildIntakeSourceReference({
      ...candidate,
      companyId: ctx.companyId,
    }),
  };
}

/** Crea (o reutiliza) el draft de un candidato revisado. */
export async function createDraftServiceFromCandidate(
  candidate: ServiceCandidate,
  ctx: CreateDraftContext,
): Promise<CreateDraftOutcome> {
  if (!ctx.companyId || !ctx.userId) {
    return { status: "error", reason: "missing_auth_context", candidateId: candidate.id };
  }
  if (candidate.companyId !== ctx.companyId) {
    // Cambio de tenant a mitad de revisión: nunca contaminar el batch.
    return { status: "blocked", reason: "tenant_mismatch", candidateId: candidate.id };
  }

  const gate = canCreateDraft(candidate);
  if (!gate.ok) {
    return { status: "blocked", reason: gate.reason ?? "not_ready", candidateId: candidate.id };
  }

  const payload = buildDraftPayload(candidate, ctx);
  const sourceRef = payload.reconciliation_hash as string;

  // Idempotencia: si el reintento encuentra la fila, la reutiliza.
  const existing = await supabase
    .from("scheduled_shifts")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("reconciliation_hash", sourceRef)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing.data?.id) {
    return { status: "reused", shiftId: existing.data.id as string, candidateId: candidate.id };
  }

  const { data, error } = await supabase
    .from("scheduled_shifts")
    .insert(payload as any)
    .select("id")
    .single();

  if (error || !data?.id) {
    // Carrera: otro intento pudo haber insertado la misma referencia.
    const retry = await supabase
      .from("scheduled_shifts")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("reconciliation_hash", sourceRef)
      .is("deleted_at", null)
      .maybeSingle();
    if (retry.data?.id) {
      return { status: "reused", shiftId: retry.data.id as string, candidateId: candidate.id };
    }
    return {
      status: "error",
      reason: error?.message ?? "insert_failed",
      candidateId: candidate.id,
    };
  }

  // Verificación de persistencia real: el draft debe existir y ser draft.
  const check = await supabase
    .from("scheduled_shifts")
    .select("id, publication_status, company_id, import_batch_id")
    .eq("id", data.id)
    .maybeSingle();

  if (
    !check.data ||
    (check.data as any).publication_status !== "draft" ||
    (check.data as any).company_id !== ctx.companyId
  ) {
    return { status: "error", reason: "persistence_check_failed", candidateId: candidate.id };
  }

  return { status: "created", shiftId: data.id as string, candidateId: candidate.id };
}

/** Creación por lote. Secuencial y tolerante: un fallo no aborta el resto. */
export async function createDraftServicesFromCandidates(
  candidates: ServiceCandidate[],
  ctx: CreateDraftContext,
): Promise<CreateDraftOutcome[]> {
  const results: CreateDraftOutcome[] = [];
  for (const candidate of candidates) {
    results.push(await createDraftServiceFromCandidate(candidate, ctx));
  }
  return results;
}

export function applyOutcome(
  candidate: ServiceCandidate,
  outcome: CreateDraftOutcome,
): ServiceCandidate {
  if (outcome.status === "created" || outcome.status === "reused") {
    return { ...candidate, createdShiftId: outcome.shiftId, reviewStatus: "created" };
  }
  return candidate;
}
