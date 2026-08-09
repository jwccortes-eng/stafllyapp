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

/**
 * Bloque de pendientes que viaja dentro de `notes`.
 *
 * No se crea ninguna tabla paralela: la información detectada pero aún no
 * vinculada (cliente/venue) y los campos que faltan quedan legibles en el
 * propio Servicio para completarlos después.
 */
export const INTAKE_PENDING_MARK = "[Intake pendiente]";

export function buildPendingBlock(candidate: ServiceCandidate): string | null {
  const lines: string[] = [];
  const client = (candidate.clientCandidate.raw ?? "").trim();
  const venue = (candidate.venueCandidate.raw ?? "").trim();

  if (client && !candidate.clientCandidate.resolvedId) {
    lines.push(`Cliente detectado: ${client} — pendiente de vincular`);
  }
  if (venue && !candidate.locationCandidate.resolvedId) {
    lines.push(`Venue detectado: ${venue} — pendiente de vincular`);
  }
  if (!candidate.startTime) lines.push("Hora de inicio pendiente de confirmar");
  if (!candidate.endTime) lines.push("Hora de fin pendiente de confirmar");
  if (!candidate.requestedWorkers) lines.push("Cantidad de personal pendiente");
  if (candidate.roleCandidates.length > 0) {
    lines.push(`Roles mencionados: ${candidate.roleCandidates.join(", ")}`);
  }

  if (lines.length === 0) return null;
  return [INTAKE_PENDING_MARK, ...lines.map((l) => `- ${l}`)].join("\n");
}

/** Payload exacto que se escribe. Expuesto para tests y auditoría. */
export function buildDraftPayload(
  candidate: ServiceCandidate,
  ctx: CreateDraftContext,
): Record<string, unknown> {
  // `scheduled_shifts.start_time/end_time` son NOT NULL. Cuando el origen no
  // define horario no se inventa una jornada: se ancla al mismo instante y el
  // pendiente queda declarado en notas, bloqueando publicación y export.
  const startTime = candidate.startTime ?? "00:00";
  const endTime = candidate.endTime ?? startTime;
  const pending = buildPendingBlock(candidate);
  const notes = [candidate.notes?.trim() || null, pending].filter(Boolean).join("\n\n") || null;

  return {
    company_id: ctx.companyId,
    title: candidateTitle(candidate),
    date: candidate.serviceDate,
    start_time: startTime,
    end_time: endTime,
    slots: candidate.requestedWorkers ?? null,
    client_id: candidate.clientCandidate.resolvedId,
    location_id: candidate.locationCandidate.resolvedId,
    job_site_address: candidate.venueCandidate.raw || null,
    notes,
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
