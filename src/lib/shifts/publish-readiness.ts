/**
 * resolveDraftPublishReadiness — adapter compartido de "¿esta acción de
 * publicación puede publicar este borrador?" (Phase 1).
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin BD, sin escrituras, sin efectos.
 *
 * POR QUÉ EXISTE
 *   El chip "Borradores listos para publicar" contaba borradores, no readiness,
 *   y "Publicar listos" iteraba borradores sin evaluar nada. El RPC
 *   `publish_shift_draft` sí valida, así que la UI prometía publicaciones que
 *   el backend rechazaba (caso QK-001657 mostrado como QK-001651).
 *
 * ESTE MÓDULO ES EL ESPEJO EXACTO DE `publish_shift_draft` (Phase 1):
 *   - cancelado / archivado / soft-deleted  → NUNCA publicable (terminal)
 *   - fecha, hora inicio y hora fin         → obligatorias
 *   - claimable=true  (Claim / Open)        → publicable con 0/Y, exige plazas > 0
 *   - claimable=false (Direct staffing)     → exige ≥ 1 asignación activa
 *
 * DEUDA PHASE 2 (documentada, NO implementada aquí):
 *   Los requisitos de compañía (require_client, require_location,
 *   require_shift_admin, conductor, max_shift_hours, punto de encuentro) siguen
 *   viviendo SOLO en `getServicePublishReadiness` (editor). No se evalúan aquí
 *   ni en el backend: moverlos requiere censo previo porque bloquearía
 *   publicaciones que hoy pasan. Phase 2 debe unificarlos en un RPC
 *   `service_publish_readiness` y dejar este adapter como espejo puro.
 */
import { isCancelledOrArchivedShift, type ShiftGuardInput } from "./shift-guards";
import { resolveShiftCapacity } from "./publication-truth";
import type { StaffingAssignmentLike } from "./staffing-metrics";

export type PublishBlockerCode =
  | "cancelled"
  | "date"
  | "start_time"
  | "end_time"
  | "capacity"
  | "assignments";

export type StaffingMode = "direct" | "claim";

export interface DraftPublishShiftInput extends ShiftGuardInput {
  id?: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  slots?: number | null;
  claimable?: boolean | null;
}

export interface DraftPublishReadiness {
  ready: boolean;
  /** Terminal: cancelado/archivado. Nunca publicable, ni en bulk ni individual. */
  terminal: boolean;
  staffingMode: StaffingMode;
  blockers: PublishBlockerCode[];
  /** Motivo en lenguaje operativo, listo para toast. null cuando está listo. */
  reason: string | null;
  requiredCount: number;
  assignedCount: number;
  openSlots: number;
}

const BLOCKER_TEXT: Record<PublishBlockerCode, string> = {
  cancelled: "el servicio está cancelado",
  date: "falta la fecha",
  start_time: "falta la hora de inicio",
  end_time: "falta la hora de fin",
  capacity: "no tiene plazas definidas para abrir a reclamo",
  assignments: "falta staffing directo (asigna a alguien o ábrelo a reclamo)",
};

/** Traduce el payload `missing[]` del RPC al mismo lenguaje del adapter. */
export function describePublishBlockers(codes: string[]): string {
  if (codes.length === 0) return "datos incompletos";
  return codes.map((c) => BLOCKER_TEXT[c as PublishBlockerCode] ?? c).join(" · ");
}

export function resolveDraftPublishReadiness(
  shift: DraftPublishShiftInput,
  assignments: StaffingAssignmentLike[] = [],
): DraftPublishReadiness {
  const capacity = resolveShiftCapacity(shift, assignments);
  const staffingMode: StaffingMode = shift.claimable === true ? "claim" : "direct";
  const blockers: PublishBlockerCode[] = [];

  const terminal = isCancelledOrArchivedShift(shift);
  if (terminal) blockers.push("cancelled");

  if (!terminal) {
    if (!shift.date) blockers.push("date");
    if (!shift.start_time) blockers.push("start_time");
    if (!shift.end_time) blockers.push("end_time");

    if (staffingMode === "claim") {
      if (capacity.required_count <= 0) blockers.push("capacity");
    } else if (capacity.assigned_count === 0) {
      blockers.push("assignments");
    }
  }

  return {
    ready: blockers.length === 0,
    terminal,
    staffingMode,
    blockers,
    reason: blockers.length === 0 ? null : describePublishBlockers(blockers),
    requiredCount: capacity.required_count,
    assignedCount: capacity.assigned_count,
    openSlots: capacity.open_slots,
  };
}

/**
 * Borradores que la acción "Publicar listos" puede intentar realmente.
 * Excluye publicados, bloqueados (locked), cancelados y borradores BLOCKED.
 */
export function selectPublishableDrafts<T extends DraftPublishShiftInput & { id: string }>(
  shifts: T[],
  assignmentsByShift: (shiftId: string) => StaffingAssignmentLike[],
): { ready: T[]; blocked: { shift: T; readiness: DraftPublishReadiness }[] } {
  const ready: T[] = [];
  const blocked: { shift: T; readiness: DraftPublishReadiness }[] = [];
  for (const s of shifts) {
    if ((s.status ?? "").toLowerCase() === "locked") continue;
    if ((s.publication_status ?? "published") !== "draft") continue;
    const readiness = resolveDraftPublishReadiness(s, assignmentsByShift(s.id));
    if (readiness.ready) ready.push(s);
    else blocked.push({ shift: s, readiness });
  }
  return { ready, blocked };
}
