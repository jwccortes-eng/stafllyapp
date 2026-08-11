/**
 * P0 — SINGLE CLOSEOUT GATE.
 *
 * Único validador canónico previo a cerrar un turno. Todas las puertas de
 * cierre (sala del capitán, tarjeta de cierre admin, ops) deben pasar por aquí.
 *
 * Separa explícitamente tres estados que NO son lo mismo:
 *   CLOSEOUT_SUBMITTED  → el capitán entregó su cierre operativo.
 *   FULLY_RECONCILED    → la evidencia real no tiene pendientes.
 *   PAYROLL_READY       → alguien con autoridad firmó y las horas están aprobadas.
 *
 * PROTEGIDO: no escribe, no toca payroll, no reescribe históricos.
 */
import type { AttendanceTruth } from "./attendance-truth";
import type { ShiftCloseout } from "./closeout";

export type ShiftReconciliationState =
  | "OPEN"
  | "CLOSEOUT_SUBMITTED"
  | "FULLY_RECONCILED"
  | "PAYROLL_READY";

export const RECONCILIATION_LABEL: Record<ShiftReconciliationState, string> = {
  OPEN: "En operación",
  CLOSEOUT_SUBMITTED: "Cierre enviado con pendientes",
  FULLY_RECONCILED: "Cierre reconciliado",
  PAYROLL_READY: "Listo para payroll",
};

export interface CloseoutPending {
  id: string;
  kind: "blocker" | "warning";
  label: string;
  detail: string;
  /** Empleados que sostienen el pendiente (auditoría fila por fila). */
  employeeIds?: string[];
  action?: { label: string; to: string };
}

export interface CloseoutGateInput {
  shiftId: string;
  truth: AttendanceTruth;
  closeout: ShiftCloseout | null;
  /** True cuando ya pasó la hora de fin del turno. */
  shiftEnded: boolean;
  /** Fichajes cerrados aún en estado `pending` de revisión de horas. */
  pendingHoursReview?: number;
  /** Asistencia manual sin validar (attendance_status = pending). */
  pendingAttendanceValidation?: number;
  /** Incidencias abiertas reportadas por otras fuentes. */
  unresolvedIncidents?: number;
}

export interface CloseoutGateResult {
  state: ShiftReconciliationState;
  blockers: CloseoutPending[];
  warnings: CloseoutPending[];
  /** ¿Se puede marcar reconciliado sin mentir? */
  canFullyReconcile: boolean;
  /** El cierre operativo siempre puede entregarse si el turno terminó. */
  canSubmitCloseout: boolean;
  /** Frase única para la UI. */
  summary: string;
}

export function evaluateCloseoutGate(input: CloseoutGateInput): CloseoutGateResult {
  const { counts, explain } = input.truth;
  const blockers: CloseoutPending[] = [];
  const warnings: CloseoutPending[] = [];
  const tc = `/app/timeclock?shiftId=${encodeURIComponent(input.shiftId)}`;
  const prq = `/app/payroll-review-queue?shiftId=${encodeURIComponent(input.shiftId)}`;

  const openEntries = counts.active + counts.missingClockOut;
  if (openEntries > 0) {
    blockers.push({
      id: "open-time-entries",
      kind: "blocker",
      label:
        openEntries === 1
          ? "1 fichaje sigue abierto"
          : `${openEntries} fichajes siguen abiertos`,
      detail:
        "Hay alguien todavía figurando dentro del turno. Sin salida real no hay reconciliación.",
      employeeIds: [...explain.active, ...explain.missingClockOut],
      action: { label: "Abrir Time Clock", to: tc },
    });
  }

  const pendingHours = input.pendingHoursReview ?? 0;
  if (pendingHours > 0) {
    blockers.push({
      id: "pending-hours",
      kind: "blocker",
      label:
        pendingHours === 1
          ? "1 registro de horas por revisar"
          : `${pendingHours} registros de horas por revisar`,
      detail: "Las horas reales aún no fueron aprobadas ni devueltas.",
      action: { label: "Revisar horas", to: prq },
    });
  }

  const pendingAttendance = input.pendingAttendanceValidation ?? 0;
  if (pendingAttendance > 0) {
    blockers.push({
      id: "pending-attendance",
      kind: "blocker",
      label: `${pendingAttendance} asistencia(s) sin validar`,
      detail: "Falta declarar presente / tarde / ausente para cerrar sin ambigüedad.",
      action: { label: "Ver asistencia", to: tc },
    });
  }

  const incidents = input.unresolvedIncidents ?? 0;
  if (incidents > 0) {
    blockers.push({
      id: "unresolved-incidents",
      kind: "blocker",
      label:
        incidents === 1 ? "1 incidencia sin resolver" : `${incidents} incidencias sin resolver`,
      detail: "El cierre puede entregarse, pero el turno no queda reconciliado.",
    });
  }

  if (counts.noClockIn > 0) {
    warnings.push({
      id: "no-clock-in",
      kind: "warning",
      label: `${counts.noClockIn} persona(s) sin fichaje recibido`,
      detail:
        "Puede ser ausencia real o un fichaje aún sin sincronizar en el dispositivo. Se registra tal cual: no se inventan horas.",
      employeeIds: explain.noClockIn,
      action: { label: "Ver asistencia", to: tc },
    });
  }

  if (counts.reviewRequired > 0) {
    // Un fichaje capturado sin conexión con drift sospechoso no se corrige en
    // silencio: bloquea la reconciliación hasta que alguien lo revise.
    blockers.push({
      id: "time-review-required",
      kind: "blocker",
      label: `${counts.reviewRequired} fichaje(s) requieren revisión horaria`,
      detail:
        "Fueron capturados sin conexión y la hora del dispositivo no coincide con la de sincronización.",
      employeeIds: explain.reviewRequired,
      action: { label: "Abrir Time Clock", to: tc },
    });
  }

  if (counts.offlineCaptured > 0) {
    warnings.push({
      id: "offline-captured",
      kind: "warning",
      label: `${counts.offlineCaptured} fichaje(s) capturados sin conexión`,
      detail: "Ya sincronizados. Se conserva la hora del dispositivo tal como se registró.",
      employeeIds: explain.offlineCaptured,
      action: { label: "Abrir Time Clock", to: tc },
    });
  }

  if (counts.extras > 0) {
    warnings.push({
      id: "extras",
      kind: "warning",
      label: `${counts.extras} extra(s) sin asignación`,
      detail: "Alguien fichó sin estar asignado. Debe quedar declarado en el cierre.",
      employeeIds: explain.extras,
      action: { label: "Ver asistencia", to: tc },
    });
  }

  if (!input.shiftEnded) {
    blockers.push({
      id: "not-ended",
      kind: "blocker",
      label: "El turno todavía no termina",
      detail: "El cierre se habilita cuando pasa la hora de fin.",
    });
  }

  const co = input.closeout;
  const submitted = !!co && co.status !== "draft";
  const reviewedApproved =
    !!co && co.status === "reviewed" && co.review_status === "approved";
  const finalApproved = !!co && co.final_approval_status === "approved";

  const canFullyReconcile = blockers.length === 0;

  let state: ShiftReconciliationState = "OPEN";
  if (submitted) state = "CLOSEOUT_SUBMITTED";
  if (submitted && reviewedApproved && canFullyReconcile) state = "FULLY_RECONCILED";
  if (state === "FULLY_RECONCILED" && finalApproved && pendingHours === 0) {
    state = "PAYROLL_READY";
  }

  const summary = canFullyReconcile
    ? state === "PAYROLL_READY"
      ? "Evidencia completa y firmada."
      : "Evidencia completa: el turno puede reconciliarse."
    : `${blockers.length} pendiente(s) reales impiden marcar el turno como reconciliado.`;

  return {
    state,
    blockers,
    warnings,
    canFullyReconcile,
    canSubmitCloseout: input.shiftEnded || submitted,
    summary,
  };
}

/** Nunca afirmar cierre total sin evidencia. */
export function isReconciled(state: ShiftReconciliationState): boolean {
  return state === "FULLY_RECONCILED" || state === "PAYROLL_READY";
}

/**
 * Puente para superficies que sólo disponen del paquete de evidencia agregada
 * (`EvidencePacket`) y no de las filas. Mantiene UNA sola definición de
 * pendientes: construye una verdad mínima y delega en `evaluateCloseoutGate`.
 */
export function evaluateCloseoutGateFromEvidence(args: {
  shiftId: string;
  evidence: {
    assigned: number;
    accepted: number;
    clockIns: number;
    clockOuts: number;
    missingClockOut: number;
    incidents: number;
    pendingReviewHours: number;
  } | null;
  closeout: ShiftCloseout | null;
  shiftEnded: boolean;
}): CloseoutGateResult {
  const e = args.evidence;
  const counts = {
    expected: e?.assigned ?? 0,
    confirmed: e?.accepted ?? 0,
    clockedIn: e?.clockIns ?? 0,
    clockOuts: e?.clockOuts ?? 0,
    active: 0,
    missingClockOut: e?.missingClockOut ?? 0,
    noClockIn: Math.max(0, (e?.assigned ?? 0) - (e?.clockIns ?? 0)),
    extras: 0,
    offlineCaptured: 0,
    reviewRequired: 0,
    incidents: e?.incidents ?? 0,
  };
  const emptyExplain = Object.fromEntries(
    Object.keys(counts).map((k) => [k, [] as string[]]),
  ) as CloseoutGateInput["truth"]["explain"];

  return evaluateCloseoutGate({
    shiftId: args.shiftId,
    truth: { rows: [], counts, explain: emptyExplain },
    closeout: args.closeout,
    shiftEnded: args.shiftEnded,
    pendingHoursReview: e?.pendingReviewHours ?? 0,
    unresolvedIncidents: e?.incidents ?? 0,
  });
}
