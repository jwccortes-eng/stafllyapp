/**
 * P0 — Retirar personas asignadas del turno.
 *
 * Fuente ÚNICA de la operación, para móvil y desktop.
 * Envuelve la RPC SECURITY DEFINER `remove_worker_from_shift`, que:
 *   - Autoriza al llamante (can_manage_shift_company) y valida el tenant.
 *   - Nunca borra la fila: marca `status = 'removed'` conservando historia.
 *   - Bloquea el retiro si la persona ya fichó o tiene horas (time_entries /
 *     clock_events) — las horas reales jamás se tocan.
 *   - Exige reemplazo antes de retirar al responsable del turno.
 *   - Sincroniza el rol de conductor y el campo legado driver_employee_id.
 *   - Es idempotente y escribe en shift_audit_log.
 *
 * La UI NO reinterpreta reglas de negocio: sólo traduce este resultado.
 */

import { supabase } from "@/integrations/supabase/client";

export type RemovalReason =
  | "removed"
  | "already_removed"
  | "forbidden"
  | "assignment_not_found"
  | "shift_not_found"
  | "has_real_activity"
  | "captain_requires_replacement"
  | "replacement_not_assigned";

export type DriverImpact = "none" | "reassigned" | "no_driver_left";
export type CaptainImpact = "none" | "blocked" | "transferred";

export interface CoverageAfter {
  required: number;
  assigned_active: number;
  confirmed: number;
}

export interface RemoveWorkerResult {
  removed: boolean;
  reason: RemovalReason;
  assignment_status?: string | null;
  coverage_after?: CoverageAfter | null;
  driver_impact?: DriverImpact;
  captain_impact?: CaptainImpact;
  payroll_protected: boolean;
  next_action?: string;
}

export interface RemoveWorkerInput {
  assignmentId: string;
  reason?: string | null;
  /** Sólo requerido cuando la persona es el responsable del turno. */
  replacementEmployeeId?: string | null;
  source?: string;
}

export async function removeWorkerFromShift(
  input: RemoveWorkerInput,
): Promise<RemoveWorkerResult> {
  const { data, error } = await supabase.rpc("remove_worker_from_shift", {
    p_assignment_id: input.assignmentId,
    p_reason: input.reason?.trim() || null,
    p_replacement_employee_id: input.replacementEmployeeId ?? null,
    p_source: input.source ?? "ui",
  });
  if (error) throw error;
  return data as unknown as RemoveWorkerResult;
}

/** Copy humano por motivo de rechazo del servidor. */
export function removalBlockedCopy(
  result: RemoveWorkerResult,
  workerName: string,
): { title: string; fact: string; consequence: string } {
  switch (result.reason) {
    case "has_real_activity":
      return {
        title: "Esta persona ya tiene actividad registrada",
        fact: `${workerName} tiene fichajes u horas en este turno.`,
        consequence: "Gestiona su salida o reemplazo sin alterar las horas reales.",
      };
    case "captain_requires_replacement":
      return {
        title: "Este worker es el responsable del turno",
        fact: `${workerName} figura como responsable.`,
        consequence: "Selecciona un reemplazo antes de retirarlo.",
      };
    case "replacement_not_assigned":
      return {
        title: "El reemplazo no está en el turno",
        fact: "La persona elegida no tiene una asignación activa aquí.",
        consequence: "Asígnala primero y vuelve a intentar el retiro.",
      };
    case "forbidden":
      return {
        title: "No tienes permiso para retirar personas",
        fact: "No se modificó ninguna asignación.",
        consequence: "Pide acceso de administrador o supervisor de esta empresa.",
      };
    case "assignment_not_found":
    case "shift_not_found":
      return {
        title: "No encontramos esta asignación",
        fact: "El turno o la asignación cambió mientras trabajabas.",
        consequence: "Recarga el turno para ver el estado actual.",
      };
    default:
      return {
        title: "No se pudo retirar a la persona",
        fact: "No se modificó ninguna asignación.",
        consequence: "El cupo sigue ocupado.",
      };
  }
}

/** Copy de consecuencia tras un retiro exitoso. */
export function removalSuccessCopy(
  result: RemoveWorkerResult,
  workerName: string,
): { title: string; fact: string; consequence: string } {
  const cov = result.coverage_after;
  const coverage = cov
    ? `${cov.assigned_active} de ${cov.required} cubiertos.`
    : "La posición vuelve a estar disponible.";
  const driver =
    result.driver_impact === "no_driver_left"
      ? " La operación quedó sin conductor asignado."
      : result.driver_impact === "reassigned"
        ? " El conductor principal se actualizó."
        : "";
  return {
    title: `${workerName} fue retirada del turno`,
    fact: "Se conservó su historial, mensajes y auditoría.",
    consequence: `La posición vuelve a estar disponible. ${coverage}${driver}`,
  };
}
