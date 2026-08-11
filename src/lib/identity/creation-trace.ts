/**
 * TRAZABILIDAD DE CREACIÓN DE PERSONAS · P0 Fase 9
 * ------------------------------------------------
 * Toda alta de `employees` debe quedar auditable: origen, actor, lote y tenant.
 * Reutiliza infraestructura existente: columnas `added_via` / `added_by` /
 * `date_added` del propio registro y una entrada en `activity_log`.
 *
 * No reconstruye el origen de registros históricos: los antiguos permanecen
 * ORIGIN_NOT_AUDITABLE.
 */
import { supabase } from "@/integrations/supabase/client";

export type EmployeeCreationSource =
  | "manual"
  | "quick_add"
  | "csv"
  | "import_wizard"
  | "connecteam_import"
  | "payroll_extras_import"
  | "emergency"
  | "application"
  | "invite";

export const ORIGIN_NOT_AUDITABLE = "ORIGIN_NOT_AUDITABLE";

export interface EmployeeCreationTraceInput {
  source: EmployeeCreationSource;
  /** Usuario que ejecuta la acción (auth user id). */
  actorId?: string | null;
  /** Etiqueta legible del actor (email/nombre) cuando exista. */
  actorLabel?: string | null;
  /** Lote de importación o id de correlación del flujo. */
  batchId?: string | null;
  correlationId?: string | null;
}

export const CREATION_SOURCE_LABEL: Record<EmployeeCreationSource, string> = {
  manual: "Alta manual",
  quick_add: "Quick Add",
  csv: "Importación CSV",
  import_wizard: "Import Wizard",
  connecteam_import: "Importación Connecteam",
  payroll_extras_import: "Importación extras de payroll",
  emergency: "Emergency worker",
  application: "Aplicación",
  invite: "Invitación",
};

/** Campos que se mezclan en el INSERT de `employees`. */
export function buildEmployeeCreationTrace(input: EmployeeCreationTraceInput) {
  return {
    added_via: CREATION_SOURCE_LABEL[input.source],
    added_by: input.actorLabel ?? input.actorId ?? null,
    date_added: new Date().toISOString(),
  };
}

/** Registro de auditoría. Nunca bloquea la operación si falla. */
export async function logEmployeeCreation(params: {
  companyId: string;
  employeeIds: string[];
  trace: EmployeeCreationTraceInput;
  /** Cuántas creaciones fueron evitadas por el resolver de identidad. */
  preventedDuplicates?: number;
}): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = params.trace.actorId ?? auth?.user?.id;
    if (!userId) return;

    await supabase.from("activity_log").insert({
      user_id: userId,
      company_id: params.companyId,
      action: "employee_created",
      entity_type: "employees",
      entity_id: params.employeeIds[0] ?? null,
      details: {
        source: params.trace.source,
        source_label: CREATION_SOURCE_LABEL[params.trace.source],
        actor_label: params.trace.actorLabel ?? null,
        batch_id: params.trace.batchId ?? null,
        correlation_id: params.trace.correlationId ?? null,
        employee_ids: params.employeeIds,
        created_count: params.employeeIds.length,
        prevented_duplicates: params.preventedDuplicates ?? 0,
        tenant: params.companyId,
        occurred_at: new Date().toISOString(),
      },
    } as never);
  } catch {
    // La trazabilidad nunca debe romper el alta.
  }
}

export function newCorrelationId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${rand}`;
}
