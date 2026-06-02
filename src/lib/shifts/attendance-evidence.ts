/**
 * attendance-evidence.ts
 *
 * Pure, read-only helpers that explain — in human language — what we know
 * about each worker's attendance for a shift, and what payroll review tasks
 * remain pending.
 *
 * IMPORTANT — Boundaries:
 *  - This module NEVER writes to `time_entries`. Real clock evidence is the
 *    only source of truth for payroll. Admin validations are operational
 *    metadata only (stored as `shift_notes` rows of type
 *    `attendance_validation`) and explicitly do NOT count as paid time.
 *  - This module NEVER infers payroll hours from scheduled times.
 *  - All helpers are deterministic, side-effect free, and frontend-only.
 *
 * Vocabulary:
 *  - "Clock evidence"        = a real `time_entries` row (the only source
 *                              of truth for payroll).
 *  - "Admin validation"      = an operator confirmed presence/lateness/
 *                              absence WITHOUT a clock row. Operational
 *                              audit trail only; never paid by itself.
 *  - "Pending payroll review"= the shift has at least one worker whose hours
 *                              cannot be settled from clock evidence alone
 *                              and require an approved manual adjustment
 *                              before payroll.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type AttendanceShift = {
  id: string;
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM[:SS]
  end_time: string;    // HH:MM[:SS]
  status?: string | null;
};

export type AttendanceAssignment = {
  id: string;
  employee_id: string;
  status: string; // pending | accepted | confirmed | rejected | removed
};

export type ClockEntry = {
  id: string;
  employee_id: string;
  clock_in: string | null;   // ISO timestamp
  clock_out: string | null;  // ISO timestamp
};

/**
 * Admin validation kinds. These mirror the dialog options the operator sees.
 * `present_no_clock` is the critical case: worker was confirmed on site but
 * never fichó. We capture WHY so payroll review later has context.
 */
export type AdminValidationKind =
  | "present_no_clock"
  | "late_no_clock"
  | "absent_confirmed"
  | "left_early_no_clock"
  | "other";

export type AdminValidationReason =
  | "seen_on_site"
  | "supervisor_confirmed"
  | "worker_message_or_photo"
  | "phone_call_confirmed"
  | "other";

export type AdminValidation = {
  employee_id: string;
  kind: AdminValidationKind;
  reason: AdminValidationReason;
  note?: string | null;
  created_at: string; // ISO
};

// ── Per-worker evidence state ────────────────────────────────────────────

export type EvidenceStateCode =
  | "no_data"                // shift hasn't started, nothing to evaluate
  | "clocked_in"             // open clock-in, no clock-out yet
  | "clocked_complete"       // clock-in AND clock-out
  | "missing_clock_out"      // clock-in exists but shift ended w/o clock-out
  | "missing_clock_in"       // shift started; no clock-in evidence
  | "present_no_clock"       // admin validated presence, no clock at all
  | "late_no_clock"          // admin validated late arrival, no clock
  | "absent_confirmed"       // admin validated absent
  | "left_early_no_clock";   // admin validated left early, no clock-out

export interface EvidenceState {
  code: EvidenceStateCode;
  label: string;             // short chip
  tone: "neutral" | "info" | "success" | "warn" | "danger";
  message: string;           // human-readable sentence
  needsPayrollReview: boolean;
  recommendedAction: string | null;
}

const HUMAN_REASON: Record<AdminValidationReason, string> = {
  seen_on_site: "lo vi en sitio",
  supervisor_confirmed: "el supervisor lo confirmó",
  worker_message_or_photo: "mandó mensaje/foto",
  phone_call_confirmed: "confirmado por llamada",
  other: "validación manual",
};

/**
 * Returns the evidence state for one worker on one shift.
 *
 * `nowIso` is injected so the function stays pure and testable.
 */
export function getAttendanceEvidenceState(
  shift: AttendanceShift,
  entries: ClockEntry[],
  validations: AdminValidation[],
  nowIso: string,
): EvidenceState {
  const startedAt = combineDateTime(shift.date, shift.start_time);
  const endedAt = combineDateTime(shift.date, shift.end_time);
  const now = new Date(nowIso).getTime();
  const hasStarted = isFinite(startedAt) && now >= startedAt;
  const hasEnded = isFinite(endedAt) && now >= endedAt;

  const realClock = entries.find(e => e.clock_in || e.clock_out) ?? null;
  const lastValidation = validations
    .slice()
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null;

  // 1) Real clock evidence wins over admin validations
  if (realClock) {
    if (realClock.clock_in && realClock.clock_out) {
      return {
        code: "clocked_complete",
        label: "Fichado",
        tone: "success",
        message: "Fichaje completo: payroll puede liquidar con este registro.",
        needsPayrollReview: false,
        recommendedAction: null,
      };
    }
    if (realClock.clock_in && !realClock.clock_out) {
      if (hasEnded) {
        return {
          code: "missing_clock_out",
          label: "Falta salida",
          tone: "warn",
          message: "Hay clock-in pero el turno terminó sin clock-out. Revisa la hora de salida antes de payroll.",
          needsPayrollReview: true,
          recommendedAction: "Cerrar clock-out manualmente con evidencia.",
        };
      }
      return {
        code: "clocked_in",
        label: "En turno",
        tone: "info",
        message: "Worker actualmente fichado en el turno.",
        needsPayrollReview: false,
        recommendedAction: null,
      };
    }
  }

  // 2) Admin validations (only meaningful once shift has started)
  if (lastValidation && hasStarted) {
    const reasonText = HUMAN_REASON[lastValidation.reason] ?? "validación manual";
    switch (lastValidation.kind) {
      case "present_no_clock":
        return {
          code: "present_no_clock",
          label: "Presente sin clock",
          tone: "warn",
          message: `Admin marcó presente (${reasonText}). No hay clock evidence — payroll requiere ajuste aprobado antes de pagar.`,
          needsPayrollReview: true,
          recommendedAction: "Capturar hora real de entrada/salida y aprobar ajuste.",
        };
      case "late_no_clock":
        return {
          code: "late_no_clock",
          label: "Tarde sin clock",
          tone: "warn",
          message: `Admin marcó tarde (${reasonText}). Falta clock evidence — payroll requiere ajuste aprobado antes de pagar.`,
          needsPayrollReview: true,
          recommendedAction: "Capturar hora real de entrada y aprobar ajuste.",
        };
      case "left_early_no_clock":
        return {
          code: "left_early_no_clock",
          label: "Salió temprano",
          tone: "warn",
          message: `Admin marcó salida temprana (${reasonText}). Falta clock-out — payroll requiere ajuste aprobado.`,
          needsPayrollReview: true,
          recommendedAction: "Capturar hora real de salida y aprobar ajuste.",
        };
      case "absent_confirmed":
        return {
          code: "absent_confirmed",
          label: "Ausente",
          tone: "danger",
          message: `Admin confirmó ausencia (${reasonText}). Sin horas para payroll.`,
          needsPayrollReview: false,
          recommendedAction: "Considerar reemplazo o registrar como no-show.",
        };
      case "other":
        return {
          code: "present_no_clock",
          label: "Validación admin",
          tone: "info",
          message: `Validación admin (${reasonText}). Revisa horas antes de payroll.`,
          needsPayrollReview: true,
          recommendedAction: "Revisar contexto y aprobar ajuste si procede.",
        };
    }
  }

  // 3) No clock and no validation
  if (!hasStarted) {
    return {
      code: "no_data",
      label: "Sin fichar",
      tone: "neutral",
      message: "El turno aún no comienza.",
      needsPayrollReview: false,
      recommendedAction: null,
    };
  }
  if (hasStarted && !hasEnded) {
    return {
      code: "missing_clock_in",
      label: "Falta clock-in",
      tone: "warn",
      message: "El turno ya comenzó y no hay clock-in. Contacta al worker o valida manualmente.",
      needsPayrollReview: false,
      recommendedAction: "Contactar worker o marcar presencia con razón.",
    };
  }
  return {
    code: "missing_clock_in",
    label: "Sin evidencia",
    tone: "danger",
    message: "El turno terminó y no hay clock evidence ni validación admin.",
    needsPayrollReview: false,
    recommendedAction: "Validar presencia/ausencia con razón antes de cerrar.",
  };
}

// ── Shift-level operational summary ──────────────────────────────────────

export interface ShiftOperationalSummary {
  totalWorkers: number;
  withClockComplete: number;
  withOpenClock: number;
  presentWithoutClock: number;
  missingClockIn: number;
  missingClockOut: number;
  absent: number;
  pendingPayrollReview: number;
  /** Human one-liner for the smart summary card. */
  sentence: string;
}

export function getShiftOperationalSummary(
  shift: AttendanceShift,
  assignments: AttendanceAssignment[],
  entriesByEmployee: Map<string, ClockEntry[]>,
  validationsByEmployee: Map<string, AdminValidation[]>,
  nowIso: string,
): ShiftOperationalSummary {
  const active = assignments.filter(a => a.status !== "rejected" && a.status !== "removed");
  let withClockComplete = 0;
  let withOpenClock = 0;
  let presentWithoutClock = 0;
  let missingClockIn = 0;
  let missingClockOut = 0;
  let absent = 0;
  let pendingPayrollReview = 0;

  for (const a of active) {
    const st = getAttendanceEvidenceState(
      shift,
      entriesByEmployee.get(a.employee_id) ?? [],
      validationsByEmployee.get(a.employee_id) ?? [],
      nowIso,
    );
    if (st.needsPayrollReview) pendingPayrollReview += 1;
    switch (st.code) {
      case "clocked_complete": withClockComplete += 1; break;
      case "clocked_in": withOpenClock += 1; break;
      case "present_no_clock":
      case "late_no_clock":
      case "left_early_no_clock":
        presentWithoutClock += 1; break;
      case "missing_clock_in": missingClockIn += 1; break;
      case "missing_clock_out": missingClockOut += 1; break;
      case "absent_confirmed": absent += 1; break;
    }
  }

  const total = active.length;
  const parts: string[] = [];
  parts.push(
    total === 0
      ? "Sin workers activos asignados."
      : `${total} worker${total === 1 ? "" : "s"} activo${total === 1 ? "" : "s"}.`
  );
  if (withClockComplete > 0) parts.push(`${withClockComplete} con fichaje completo.`);
  if (withOpenClock > 0) parts.push(`${withOpenClock} en turno (clock abierto).`);
  if (presentWithoutClock > 0) parts.push(`${presentWithoutClock} marcado${presentWithoutClock === 1 ? "" : "s"} presente sin clock evidence.`);
  if (missingClockOut > 0) parts.push(`${missingClockOut} sin clock-out.`);
  if (missingClockIn > 0) parts.push(`${missingClockIn} sin clock-in.`);
  if (absent > 0) parts.push(`${absent} ausente${absent === 1 ? "" : "s"}.`);
  if (pendingPayrollReview > 0) parts.push("Revisa horas antes de payroll.");

  return {
    totalWorkers: total,
    withClockComplete,
    withOpenClock,
    presentWithoutClock,
    missingClockIn,
    missingClockOut,
    absent,
    pendingPayrollReview,
    sentence: parts.join(" "),
  };
}

// ── Payroll review flags ─────────────────────────────────────────────────

export type PayrollFlagKind =
  | "manual_presence_needs_hours"
  | "open_clock_not_closed"
  | "no_evidence_after_end"
  | "early_departure_without_clock";

export interface PayrollReviewFlag {
  kind: PayrollFlagKind;
  employee_id: string;
  message: string;
  severity: "warn" | "danger";
}

/**
 * Compute payroll-review TODOs for a shift. These never modify payroll on
 * their own — they only surface what an operator must approve manually.
 */
export function getPayrollReviewFlags(
  shift: AttendanceShift,
  assignments: AttendanceAssignment[],
  entriesByEmployee: Map<string, ClockEntry[]>,
  validationsByEmployee: Map<string, AdminValidation[]>,
  nowIso: string,
): PayrollReviewFlag[] {
  const flags: PayrollReviewFlag[] = [];
  const endedAt = combineDateTime(shift.date, shift.end_time);
  const now = new Date(nowIso).getTime();
  const hasEnded = isFinite(endedAt) && now >= endedAt;

  for (const a of assignments) {
    if (a.status === "rejected" || a.status === "removed") continue;
    const st = getAttendanceEvidenceState(
      shift,
      entriesByEmployee.get(a.employee_id) ?? [],
      validationsByEmployee.get(a.employee_id) ?? [],
      nowIso,
    );
    switch (st.code) {
      case "present_no_clock":
      case "late_no_clock":
        flags.push({
          kind: "manual_presence_needs_hours",
          employee_id: a.employee_id,
          message: "Validación admin sin clock evidence: define horas reales y aprueba ajuste.",
          severity: "warn",
        });
        break;
      case "left_early_no_clock":
        flags.push({
          kind: "early_departure_without_clock",
          employee_id: a.employee_id,
          message: "Salida temprana sin clock-out: define hora de salida y aprueba ajuste.",
          severity: "warn",
        });
        break;
      case "missing_clock_out":
        flags.push({
          kind: "open_clock_not_closed",
          employee_id: a.employee_id,
          message: "Clock-in abierto sin clock-out al terminar el turno.",
          severity: "warn",
        });
        break;
      case "missing_clock_in":
        if (hasEnded) {
          flags.push({
            kind: "no_evidence_after_end",
            employee_id: a.employee_id,
            message: "Turno terminó sin clock ni validación admin.",
            severity: "danger",
          });
        }
        break;
    }
  }
  return flags;
}

// ── Next best actions per worker ─────────────────────────────────────────

export type WorkerActionKind =
  | "contact_worker"
  | "mark_present_no_clock"
  | "mark_late_no_clock"
  | "mark_absent"
  | "mark_left_early"
  | "close_open_clock"
  | "review_hours";

export interface WorkerAction {
  kind: WorkerActionKind;
  label: string;
  tone: "primary" | "warn" | "danger";
}

export function getWorkerNextActions(state: EvidenceState): WorkerAction[] {
  switch (state.code) {
    case "missing_clock_in":
      return [
        { kind: "contact_worker",        label: "Contactar worker",      tone: "primary" },
        { kind: "mark_present_no_clock", label: "Marcar presente",       tone: "warn" },
        { kind: "mark_late_no_clock",    label: "Marcar tarde",          tone: "warn" },
        { kind: "mark_absent",           label: "Marcar ausente",        tone: "danger" },
      ];
    case "missing_clock_out":
      return [
        { kind: "close_open_clock",      label: "Cerrar clock-out",      tone: "primary" },
        { kind: "review_hours",          label: "Revisar horas",         tone: "warn" },
      ];
    case "present_no_clock":
    case "late_no_clock":
    case "left_early_no_clock":
      return [
        { kind: "review_hours",          label: "Revisar horas",         tone: "primary" },
      ];
    case "clocked_in":
      return [];
    case "clocked_complete":
      return [];
    case "absent_confirmed":
      return [];
    case "no_data":
    default:
      return [];
  }
}

// ── Utils ────────────────────────────────────────────────────────────────

function combineDateTime(date: string, time: string): number {
  if (!date || !time) return NaN;
  const t = time.length === 5 ? `${time}:00` : time;
  // Treat as local time of the device — this is fine for the operator UX;
  // payroll never uses these computed numbers.
  const d = new Date(`${date}T${t}`);
  return d.getTime();
}
