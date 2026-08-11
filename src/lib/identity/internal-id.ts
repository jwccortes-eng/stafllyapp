import { supabase } from "@/integrations/supabase/client";

/**
 * Internal ID — política canónica (P0).
 *
 * El Internal ID (`employees.employer_identification`) es el número interno
 * que la operación/pagadora usa para identificar a la persona dentro de la
 * empresa. NO es el UUID del employee, NO es el auth user id, NO es un
 * identificador técnico de Stafly.
 *
 * Reglas:
 *  - Pertenece a la persona dentro de la empresa y es inmutable de por vida.
 *  - Nunca se recicla ni se rellena un hueco histórico.
 *  - Los registros fusionados o inactivos conservan su número.
 *  - Un único escritor: las RPC `assign_internal_id` / `correct_internal_id`.
 *    Cualquier UPDATE directo del campo es rechazado por la base de datos.
 */

export const INTERNAL_ID_LABEL = "Internal ID";

export type InternalIdSource =
  | "manual_admin"
  | "new_employee"
  | "legacy_reactivation"
  | "import_reconciliation"
  | "csv_import"
  | "p0_internal_id_backfill";

export type InternalIdAssignmentReason =
  | "historical_preservation"
  | "new_employee"
  | "legacy_reactivation"
  | "manual_admin_correction"
  | "import_reconciliation";

export interface AssignInternalIdResult {
  status: "assigned" | "unchanged" | "skipped" | "not_found";
  internal_id?: string | null;
  reason?: string | null;
  historical_candidate?: string | null;
}

export interface CorrectInternalIdResult {
  status: "corrected" | "noop" | "not_found";
  internal_id?: string | null;
  previous_internal_id?: string | null;
}

/**
 * Único camino válido para que una persona reciba un Internal ID.
 * Idempotente: si ya lo tiene, lo conserva y devuelve `unchanged`.
 */
export async function assignInternalId(params: {
  employeeId: string;
  source?: InternalIdSource;
  reason?: InternalIdAssignmentReason;
  notes?: string | null;
}): Promise<{ data: AssignInternalIdResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc("assign_internal_id", {
    p_employee_id: params.employeeId,
    p_source: params.source ?? "manual_admin",
    p_reason: params.reason ?? null,
    p_notes: params.notes ?? null,
  } as never);

  if (error) return { data: null, error: error.message };
  return { data: (data as unknown as AssignInternalIdResult) ?? null, error: null };
}

/**
 * Corrección administrativa auditada. Excepcional: exige motivo explícito y
 * queda registrada con valor anterior, valor nuevo y actor.
 */
export async function correctInternalId(params: {
  employeeId: string;
  newInternalId: string;
  reason: string;
}): Promise<{ data: CorrectInternalIdResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc("correct_internal_id", {
    p_employee_id: params.employeeId,
    p_new_internal_id: params.newInternalId,
    p_reason: params.reason,
  } as never);

  if (error) return { data: null, error: error.message };
  return { data: (data as unknown as CorrectInternalIdResult) ?? null, error: null };
}
