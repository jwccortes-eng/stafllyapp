/**
 * SHIFT PUBLICATION TRUTH — Fuente única de verdad de publicación/visibilidad
 * ===========================================================================
 *
 * Origen: `docs/qa/P0_WILLIAM_RODRIGUEZ_PORTAL_FORENSIC_AUDIT.md`.
 *
 * Problema demostrado: administración contaba asignaciones en borrador
 * (o sobre turnos no publicados) como "Asignado", mientras el portal del
 * trabajador —correctamente— no mostraba nada. Además se emitían avisos de
 * "turno disponible" sin validar cupo real.
 *
 * Regla dura: ninguna pantalla infiere por su cuenta si un turno está
 * draft / asignado / publicado / visible / notificado. Todas preguntan aquí.
 *
 * Este módulo es PURO: no consulta la base, no escribe, no toca payroll,
 * time_entries, identidad ni RLS. Complementa (no reemplaza) los filtros
 * de servidor y `shift-guards.ts`, del que reutiliza los predicados base.
 */

import {
  isActiveAssignment,
  isCancelledOrArchivedShift,
  isDraftReservation,
  isPublishedShift,
  type AssignmentGuardInput,
  type ShiftGuardInput,
} from "@/lib/shifts/shift-guards";
import {
  getShiftStaffingMetrics,
  type StaffingAssignmentLike,
} from "@/lib/shifts/staffing-metrics";

/** Estados canónicos del ciclo de vida operativo turno ↔ trabajador. */
export type ShiftTruthState =
  | "DRAFT"
  | "ASSIGNED_INTERNAL"
  | "PUBLISHED"
  | "VISIBLE_TO_WORKER"
  | "NOTIFIED"
  | "ACCEPTED"
  | "REJECTED"
  | "CLOCKED_IN"
  | "CLOCKED_OUT"
  | "CLOSED"
  | "CANCELLED";

export type NotificationStatus = "not_sent" | "sent" | "not_eligible";

export interface ShiftTruthShiftInput extends ShiftGuardInput {
  id?: string;
  /** Plazas requeridas del turno (`slots`). */
  slots?: number | null;
  /** Convocatoria abierta habilitada por el coordinador. */
  claimable?: boolean | null;
  /** Cierre operativo del turno. */
  closed_at?: string | null;
}

export interface ShiftTruthAssignmentInput extends AssignmentGuardInput {
  id?: string;
  employee_id?: string | null;
  /** Fichaje del trabajador para este turno, si existe. */
  clock_in_at?: string | null;
  clock_out_at?: string | null;
  attendance_status?: string | null;
  /** Marca de notificación entregada al trabajador para este turno. */
  notified_at?: string | null;
}

export interface ShiftCapacityTruth {
  required_count: number;
  assigned_count: number;
  confirmed_count: number;
  open_slots: number;
  is_full: boolean;
}

export interface ShiftPublicationTruth {
  state: ShiftTruthState;
  shift_status: string;
  is_published: boolean;
  is_cancelled: boolean;
  assignment_exists: boolean;
  assignment_status: "none" | "draft_reservation" | "active" | "rejected" | "removed";
  visible_to_worker: boolean;
  notification_eligible: boolean;
  notification_status: NotificationStatus;
  capacity_status: ShiftCapacityTruth;
  /** El trabajador puede actuar (aceptar / rechazar / fichar) ahora mismo. */
  worker_action_available: boolean;
  /** Convocatoria abierta válida ("turno disponible") para no asignados. */
  open_call_available: boolean;
  /** Etiqueta canónica para admin. Nunca ambigua. */
  admin_label: string;
  /** Explicación de por qué el trabajador no lo ve (null si sí lo ve). */
  admin_blocking_reason: string | null;
  /**
   * Incoherencia estructural detectada. No se oculta nunca.
   * `PUBLISHED_WITH_DRAFT_RESERVATIONS`: el turno está publicado pero la
   * asignación sigue marcada como reserva tentativa → el trabajador no lo ve.
   */
  anomaly: ShiftTruthAnomaly | null;
}

export type ShiftTruthAnomaly = "PUBLISHED_WITH_DRAFT_RESERVATIONS";


function assignmentStatusOf(
  a: ShiftTruthAssignmentInput | null | undefined,
): ShiftPublicationTruth["assignment_status"] {
  if (!a) return "none";
  if (isDraftReservation(a)) return "draft_reservation";
  const s = String(a.status ?? "").toLowerCase();
  if (s === "removed" || s === "cancelled") return "removed";
  if (s === "rejected" || String(a.response_status ?? "").toLowerCase() === "rejected") {
    return "rejected";
  }
  return isActiveAssignment(a) ? "active" : "removed";
}

export function resolveShiftCapacity(
  shift: ShiftTruthShiftInput,
  assignments: StaffingAssignmentLike[] = [],
): ShiftCapacityTruth {
  const m = getShiftStaffingMetrics(assignments, shift.slots ?? 0);
  const required = m.required;
  const open = required > 0 ? Math.max(0, required - m.assignedActive) : 0;
  return {
    required_count: required,
    assigned_count: m.assignedActive,
    confirmed_count: m.confirmed,
    open_slots: open,
    is_full: required > 0 && m.assignedActive >= required,
  };
}

export interface ResolveShiftTruthInput {
  shift: ShiftTruthShiftInput;
  /** Asignación del trabajador en foco (si la superficie es por persona). */
  assignment?: ShiftTruthAssignmentInput | null;
  /** Todas las asignaciones del turno, para calcular cupo real. */
  assignments?: StaffingAssignmentLike[];
  /** El trabajador cumple los requisitos de elegibilidad (perfil, docs, etc.). */
  workerEligible?: boolean;
}

/**
 * Resolver canónico. Única función autorizada para decidir si un turno está
 * asignado internamente, publicado, visible, notificado o accionable.
 */
export function resolveShiftPublicationTruth(
  input: ResolveShiftTruthInput,
): ShiftPublicationTruth {
  const { shift, assignment = null, assignments = [], workerEligible = true } = input;

  const published = isPublishedShift(shift);
  const cancelled = isCancelledOrArchivedShift(shift);
  const aStatus = assignmentStatusOf(assignment);
  const assignmentExists = aStatus !== "none";
  const capacity = resolveShiftCapacity(shift, assignments);

  const visible =
    published && !cancelled && aStatus === "active";

  const notificationEligible =
    published &&
    !cancelled &&
    aStatus === "active" &&
    workerEligible;

  const notified = Boolean(assignment?.notified_at);
  const notificationStatus: NotificationStatus = !notificationEligible
    ? "not_eligible"
    : notified
      ? "sent"
      : "not_sent";

  const clockedIn = Boolean(assignment?.clock_in_at);
  const clockedOut = Boolean(assignment?.clock_out_at);
  const closed = Boolean(shift.closed_at) || String(shift.status ?? "").toLowerCase() === "closed";
  const accepted =
    String(assignment?.response_status ?? "").toLowerCase() === "accepted" ||
    String(assignment?.status ?? "").toLowerCase() === "confirmed";

  let state: ShiftTruthState;
  if (cancelled) state = "CANCELLED";
  else if (closed) state = "CLOSED";
  else if (clockedOut) state = "CLOCKED_OUT";
  else if (clockedIn) state = "CLOCKED_IN";
  else if (aStatus === "rejected") state = "REJECTED";
  else if (!published) state = assignmentExists ? "ASSIGNED_INTERNAL" : "DRAFT";
  else if (visible && accepted) state = "ACCEPTED";
  else if (visible && notified) state = "NOTIFIED";
  else if (visible) state = "VISIBLE_TO_WORKER";
  else state = "PUBLISHED";

  const openCallAvailable =
    published &&
    !cancelled &&
    shift.claimable === true &&
    !assignmentExists &&
    workerEligible &&
    capacity.open_slots > 0;

  const workerActionAvailable =
    (visible && !accepted && !clockedOut && !closed) || openCallAvailable;

  let blocking: string | null = null;
  if (cancelled) blocking = "El turno está cancelado o archivado.";
  else if (!published) {
    blocking = assignmentExists
      ? "El turno sigue en borrador: la persona todavía no puede verlo."
      : "El turno sigue en borrador.";
  } else if (aStatus === "draft_reservation") {
    blocking = "La asignación es una reserva de borrador, aún no es real.";
  } else if (aStatus === "rejected") blocking = "La persona rechazó el turno.";
  else if (aStatus === "removed") blocking = "La asignación fue retirada.";
  else if (aStatus === "none") blocking = "No hay asignación para esta persona.";

  return {
    state,
    shift_status: String(shift.status ?? ""),
    is_published: published,
    is_cancelled: cancelled,
    assignment_exists: assignmentExists,
    assignment_status: aStatus,
    visible_to_worker: visible,
    notification_eligible: notificationEligible,
    notification_status: notificationStatus,
    capacity_status: capacity,
    worker_action_available: workerActionAvailable,
    open_call_available: openCallAvailable,
    admin_label: adminLabelFor(state, notified),
    admin_blocking_reason: blocking,
  };
}

/** Copy canónico para admin. Prohibido escribir "Asignado" a secas. */
export function adminLabelFor(state: ShiftTruthState, notified = false): string {
  switch (state) {
    case "DRAFT":
      return "Borrador · sin publicar";
    case "ASSIGNED_INTERNAL":
      return "Asignado internamente · pendiente de publicar";
    case "PUBLISHED":
      return "Publicado · sin asignación";
    case "VISIBLE_TO_WORKER":
      return notified ? "Publicado · notificado" : "Publicado · visible sin notificar";
    case "NOTIFIED":
      return "Publicado · notificado";
    case "ACCEPTED":
      return "Confirmado por la persona";
    case "REJECTED":
      return "Rechazado por la persona";
    case "CLOCKED_IN":
      return "En turno";
    case "CLOCKED_OUT":
      return "Turno terminado";
    case "CLOSED":
      return "Turno cerrado";
    case "CANCELLED":
      return "Cancelado";
  }
}

/**
 * Guardia canónica para avisos de "turno disponible" (convocatoria abierta).
 * Devuelve false si el turno no está publicado, está cancelado, el cupo está
 * lleno, el trabajador no es elegible o ya tiene asignación.
 */
export function canAnnounceOpenShift(input: ResolveShiftTruthInput): boolean {
  return resolveShiftPublicationTruth(input).open_call_available;
}

/** Guardia canónica para notificar a una persona asignada. */
export function canNotifyAssignedWorker(input: ResolveShiftTruthInput): boolean {
  return resolveShiftPublicationTruth(input).notification_eligible;
}
