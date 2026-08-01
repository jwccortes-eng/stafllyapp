/**
 * P0 — Cancelación segura de turnos.
 *
 * Fuente ÚNICA de la operación para móvil y desktop.
 * Envuelve la RPC SECURITY DEFINER `cancel_shift`, que:
 *   - Autoriza al llamante (can_manage_shift_company) y valida el tenant.
 *   - Nunca borra: pasa el turno a `status = 'cancelled'` y guarda
 *     cancelled_at / cancelled_by / cancellation_reason.
 *   - No usa `deleted_at`: cancelar no es eliminar.
 *   - Conserva asignaciones, roles, chat, evidencia, incidencias y auditoría.
 *   - Protege payroll: falla cerrado si hay horas aprobadas, ajustes de
 *     payroll, cierre aprobado o el turno está bloqueado.
 *   - Es idempotente y escribe en shift_audit_log.
 *
 * La UI NO decide si un turno puede cancelarse: sólo traduce este resultado.
 */

import { supabase } from "@/integrations/supabase/client";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

export type CancelShiftReason =
  | "cancelled"
  | "cancelled_after_start"
  | "cancelled_during_operation"
  | "already_cancelled"
  | "forbidden"
  | "tenant_mismatch"
  | "shift_not_found"
  | "status_conflict"
  | "reason_required"
  | "scope_not_supported"
  | "payroll_locked"
  | "requires_activity_acknowledgement"
  | "requires_started_acknowledgement"
  | "not_persisted";

export interface CancelShiftResult {
  cancelled: boolean;
  reason: CancelShiftReason;
  previous_status?: string | null;
  final_status?: string | null;
  affected_assignments?: number;
  confirmed_before?: number;
  notified_workers?: number;
  payroll_protected: boolean;
  hours_preserved: boolean;
  time_entries_preserved?: number;
  next_action?: string;
}

export interface CancelShiftInput {
  shiftId: string;
  companyId?: string | null;
  reason: string;
  /** Estado esperado para evitar conflictos de concurrencia. */
  expectedStatus?: string | null;
  /** El modelo actual sólo soporta cancelar este turno. */
  scope?: "this_shift";
  /** Confirmación reforzada cuando el turno ya inició o tiene actividad. */
  acknowledgeActivity?: boolean;
  idempotencyKey?: string | null;
  source?: string;
}

export async function cancelShift(input: CancelShiftInput): Promise<CancelShiftResult> {
  const { data, error } = await supabase.rpc("cancel_shift", {
    p_shift_id: input.shiftId,
    p_reason: input.reason?.trim() ?? "",
    p_company_id: input.companyId ?? null,
    p_expected_status: input.expectedStatus ?? null,
    p_cancellation_scope: input.scope ?? "this_shift",
    p_acknowledge_activity: input.acknowledgeActivity ?? false,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_source: input.source ?? "ui",
  } as never);
  if (error) throw error;
  return data as unknown as CancelShiftResult;
}

/**
 * FASE 8 — feedback verificado: relee el turno y confirma el estado final
 * y que las horas reales siguen intactas. Nunca declaramos éxito por HTTP 200.
 */
export async function verifyShiftCancelled(
  shiftId: string,
): Promise<{ status: string | null; cancelledAt: string | null; timeEntries: number }> {
  const [{ data: shift }, { count }] = await Promise.all([
    supabase.from("scheduled_shifts").select("status, cancelled_at").eq("id", shiftId).maybeSingle(),
    supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("shift_id", shiftId),
  ]);
  return {
    status: (shift as { status?: string } | null)?.status ?? null,
    cancelledAt: (shift as { cancelled_at?: string } | null)?.cancelled_at ?? null,
    timeEntries: count ?? 0,
  };
}

/** Motivos que sólo requieren volver a confirmar con más contexto. */
export function needsReinforcedConfirmation(r: CancelShiftReason): boolean {
  return r === "requires_activity_acknowledgement" || r === "requires_started_acknowledgement";
}

/** Copy humano cuando el servidor rechaza la cancelación. */
export function cancelBlockedCopy(
  result: CancelShiftResult,
  shiftRef: string,
): { title: string; fact: string; consequence: string } {
  switch (result.reason) {
    case "payroll_locked":
      return {
        title: `Este ${ADMIN_LEX.entity} ya tiene actividad de pago`,
        fact: `${shiftRef} tiene horas aprobadas, ajustes de pago o cierre aprobado.`,
        consequence: "No puede cancelarse sin revisión administrativa. No se guardaron cambios.",
      };
    case "requires_activity_acknowledgement":
      return {
        title: `Este ${ADMIN_LEX.entity} ya tiene actividad real`,
        fact: "Hay fichajes u horas registradas.",
        consequence: "Las horas se conservarán intactas. Confirma para cancelar durante la operación.",
      };
    case "requires_started_acknowledgement":
      return {
        title: `Este ${ADMIN_LEX.entity} ya comenzó`,
        fact: "La hora de inicio ya pasó.",
        consequence: "Confirma para cancelarlo igualmente; el historial se conserva.",
      };
    case "forbidden":
      return {
        title: `No tienes permiso para cancelar ${ADMIN_LEX.entityPlural}`,
        fact: "No se guardaron cambios.",
        consequence: "Pide acceso de administrador o supervisor de esta empresa.",
      };
    case "tenant_mismatch":
    case "shift_not_found":
      return {
        title: `No encontramos ${ADMIN_LEX.thisEntity}`,
        fact: `${ADMIN_LEX.Entity} cambió de estado o pertenece a otra empresa.`,
        consequence: "Recarga para ver el estado actual.",
      };
    case "status_conflict":
      return {
        title: `${ADMIN_LEX.Entity} modificado mientras trabajabas`,
        fact: `Ahora está en estado "${result.final_status ?? "desconocido"}".`,
        consequence: "No se guardaron cambios. Recarga y vuelve a intentarlo.",
      };
    case "reason_required":
      return {
        title: "Falta el motivo",
        fact: "El motivo de la cancelación es obligatorio.",
        consequence: "No se guardaron cambios.",
      };
    case "scope_not_supported":
      return {
        title: `Sólo puede cancelarse ${ADMIN_LEX.thisEntity}`,
        fact: `${ADMIN_LEX.Entity} sin serie recurrente gestionable.`,
        consequence: "Cancela cada turno por separado.",
      };
    default:
      return {
        title: `No pudimos cancelar ${ADMIN_LEX.theEntity}`,
        fact: "No se guardaron cambios.",
        consequence: `${ADMIN_LEX.Entity} sin cambios.`,
      };
  }
}

/** Copy de consecuencia tras una cancelación verificada. */
export function cancelSuccessCopy(
  result: CancelShiftResult,
  shiftRef: string,
): { title: string; fact: string; consequence: string } {
  if (result.reason === "already_cancelled") {
    return {
      title: `Este ${ADMIN_LEX.entity} ya estaba cancelado`,
      fact: `${shiftRef} no cambió con esta acción.`,
      consequence: "El historial se mantiene intacto.",
    };
  }
  const people = result.affected_assignments ?? 0;
  const hours = (result.time_entries_preserved ?? 0) > 0
    ? " Las horas reales registradas se conservaron."
    : "";
  return {
    title: `${ADMIN_LEX.Entity} cancelado`,
    fact: `${shiftRef} quedó cancelado.`,
    consequence: `${people} ${people === 1 ? "persona fue retirada" : "personas fueron retiradas"} de la operación activa y su historial fue conservado.${hours}`,
  };
}
