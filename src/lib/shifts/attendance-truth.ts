/**
 * P0 — TRUTHFUL COUNTERS (fuente única de verdad de asistencia real).
 *
 * Puro. Sin I/O. Cada número que muestra la UI operativa debe salir de aquí y
 * debe poder explicarse fila por fila. Nunca se aceptan contadores
 * auto-declarados (lo que el capitán escribió en el cierre) cuando existe
 * evidencia real en `time_entries` / `shift_assignments`.
 *
 * PROTEGIDO:
 *   - No calcula payroll ni horas pagables.
 *   - No convierte horas programadas en horas trabajadas.
 *   - No escribe nada.
 */

export type AttendanceRowState =
  | "clocked_out"        // clock_in + clock_out reales
  | "active"             // clock_in real, sin salida, dentro de ventana
  | "missing_clock_out"  // clock_in real, sin salida, ventana vencida
  | "no_clock_in"        // asignación esperada sin fichaje real recibido
  | "review_required"    // fichaje sincronizado con evidencia que exige revisión
  | "not_expected_yet"   // asignado pero el turno aún no empieza
  | "extra"              // fichaje real de alguien no asignado
  | "excluded";          // asignación removida/rechazada

export interface AttendanceAssignmentInput {
  id: string;
  employee_id: string;
  /** pending | accepted | confirmed | rejected | removed */
  status: string;
  response_status?: string | null;
  attendance_status?: string | null;
}

export interface AttendanceEntryInput {
  id: string;
  employee_id: string;
  clock_in: string | null;
  clock_out: string | null;
  /** pending | approved | rejected | voided */
  status?: string | null;
  /** Fichaje capturado sin conexión y sincronizado después. */
  captured_offline?: boolean | null;
  /** Marcado por drift de reloj u otra evidencia dudosa. */
  requires_time_review?: boolean | null;
  synced_at?: string | null;
}

export interface AttendanceTruthRow {
  employee_id: string;
  assignment_id: string | null;
  assignment_status: string | null;
  entry_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
  entry_status: string | null;
  captured_offline: boolean;
  requires_time_review: boolean;
  state: AttendanceRowState;
  /** Frase corta que explica por qué esta fila cuenta donde cuenta. */
  explanation: string;
}

export interface AttendanceCounts {
  /** Asignaciones vigentes (no removidas ni rechazadas). */
  expected: number;
  /** Asignaciones con estado canónico confirmado/aceptado. */
  confirmed: number;
  /** Personas con clock_in válido (incluye quien ya salió). */
  clockedIn: number;
  /** Personas con clock_out válido. */
  clockOuts: number;
  /** clock_in válido + clock_out null (ventana vigente). */
  active: number;
  /** Fichaje abierto con la ventana esperada ya vencida. */
  missingClockOut: number;
  /** Asignación esperada sin ningún fichaje recibido en el servidor. */
  noClockIn: number;
  /** Fichajes capturados sin conexión y ya sincronizados. */
  offlineCaptured: number;
  /** Fichajes que exigen revisión humana antes de reconciliar. */
  reviewRequired: number;
  /** Fichajes de personas sin asignación vigente. */
  extras: number;
  /** Suma de situaciones que requieren decisión humana. */
  incidents: number;
}

export interface AttendanceTruth {
  rows: AttendanceTruthRow[];
  counts: AttendanceCounts;
  /** Filas que sostienen cada contador — auditoría 1:1 en pantalla. */
  explain: Record<keyof AttendanceCounts, string[]>;
}

const EXCLUDED_ASSIGNMENT = new Set(["rejected", "removed", "cancelled"]);
const CONFIRMED_ASSIGNMENT = new Set(["confirmed", "accepted"]);
const VOID_ENTRY = new Set(["voided", "rejected", "deleted"]);

/** Un fichaje sólo cuenta como real si tiene clock_in y no fue anulado. */
export function isValidEntry(e: AttendanceEntryInput): boolean {
  if (!e.clock_in) return false;
  return !VOID_ENTRY.has((e.status ?? "").toLowerCase());
}

export interface AttendanceTruthInput {
  assignments: AttendanceAssignmentInput[];
  entries: AttendanceEntryInput[];
  /** Inicio esperado del turno (ISO o Date). Opcional. */
  windowStartsAt?: Date | string | null;
  /** Fin esperado del turno (ISO o Date). Opcional. */
  windowEndsAt?: Date | string | null;
  /** Gracia tras el fin antes de considerar "falta salida". */
  graceMinutes?: number;
  now?: Date;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function deriveAttendanceTruth(input: AttendanceTruthInput): AttendanceTruth {
  const now = input.now ?? new Date();
  const grace = input.graceMinutes ?? 30;
  const start = toDate(input.windowStartsAt);
  const end = toDate(input.windowEndsAt);
  const windowExpired = end ? now.getTime() > end.getTime() + grace * 60_000 : false;
  const started = start ? now.getTime() >= start.getTime() : true;

  // Primer fichaje válido por persona (el más temprano). Nunca se deduplica en
  // base: sólo se elige cuál representa la fila.
  const entryByEmployee = new Map<string, AttendanceEntryInput>();
  for (const e of input.entries) {
    if (!isValidEntry(e)) continue;
    const prev = entryByEmployee.get(e.employee_id);
    if (!prev || (e.clock_in ?? "") < (prev.clock_in ?? "")) {
      entryByEmployee.set(e.employee_id, e);
    }
  }

  const rows: AttendanceTruthRow[] = [];
  const expectedEmployees = new Set<string>();

  for (const a of input.assignments) {
    const status = (a.status ?? "").toLowerCase();
    const excluded = EXCLUDED_ASSIGNMENT.has(status);
    const entry = entryByEmployee.get(a.employee_id) ?? null;

    if (excluded) {
      rows.push({
        employee_id: a.employee_id,
        assignment_id: a.id,
        assignment_status: a.status,
        entry_id: entry?.id ?? null,
        clock_in: entry?.clock_in ?? null,
        clock_out: entry?.clock_out ?? null,
        entry_status: entry?.status ?? null,
        captured_offline: entry?.captured_offline === true,
        requires_time_review: entry?.requires_time_review === true,
        state: "excluded",
        explanation: `Asignación ${status}: no cuenta como esperada.`,
      });
      continue;
    }

    expectedEmployees.add(a.employee_id);

    let state: AttendanceRowState;
    let explanation: string;
    if (entry?.requires_time_review) {
      state = "review_required";
      explanation = "Fichaje sincronizado con diferencia horaria sospechosa: requiere revisión.";
    } else if (entry && entry.clock_out) {
      state = "clocked_out";
      explanation = "Fichaje real con entrada y salida.";
    } else if (entry) {
      if (windowExpired) {
        state = "missing_clock_out";
        explanation = "Fichaje abierto y la ventana esperada ya venció.";
      } else {
        state = "active";
        explanation = "Fichaje abierto dentro de la ventana esperada.";
      }
    } else if (started) {
      state = "no_clock_in";
      // Ojo: "no recibido" ≠ "no-show". El fichaje puede seguir pendiente de
      // sincronizar en el dispositivo del worker.
      explanation = "Asignación vigente sin fichaje recibido en el servidor.";
    } else {
      state = "not_expected_yet";
      explanation = "El turno todavía no empieza.";
    }

    rows.push({
      employee_id: a.employee_id,
      assignment_id: a.id,
      assignment_status: a.status,
      entry_id: entry?.id ?? null,
      clock_in: entry?.clock_in ?? null,
      clock_out: entry?.clock_out ?? null,
      entry_status: entry?.status ?? null,
      captured_offline: entry?.captured_offline === true,
      requires_time_review: entry?.requires_time_review === true,
      state,
      explanation,
    });
  }

  // Extras: fichaje real sin asignación vigente.
  for (const [employeeId, entry] of entryByEmployee) {
    if (expectedEmployees.has(employeeId)) continue;
    rows.push({
      employee_id: employeeId,
      assignment_id: null,
      assignment_status: null,
      entry_id: entry.id,
      clock_in: entry.clock_in,
      clock_out: entry.clock_out,
      entry_status: entry.status ?? null,
      captured_offline: entry.captured_offline === true,
      requires_time_review: entry.requires_time_review === true,
      state: "extra",
      explanation: "Fichaje real sin asignación vigente en este turno.",
    });
  }

  const ofState = (s: AttendanceRowState) => rows.filter(r => r.state === s);
  const expectedRows = rows.filter(r => r.state !== "excluded" && r.state !== "extra");
  const confirmedRows = input.assignments.filter(
    a =>
      !EXCLUDED_ASSIGNMENT.has((a.status ?? "").toLowerCase()) &&
      CONFIRMED_ASSIGNMENT.has((a.status ?? "").toLowerCase()) &&
      (a.response_status ?? "") !== "needs_reacceptance",
  );
  const withClockIn = rows.filter(r => !!r.clock_in && r.state !== "excluded");
  const withClockOut = rows.filter(r => !!r.clock_out && r.state !== "excluded");
  const active = ofState("active");
  const missingClockOut = ofState("missing_clock_out");
  const noClockIn = ofState("no_clock_in");
  const extras = ofState("extra");
  const reviewRequired = rows.filter(r => r.requires_time_review && r.state !== "excluded");
  const offlineCaptured = rows.filter(r => r.captured_offline && r.state !== "excluded");

  const counts: AttendanceCounts = {
    expected: expectedRows.length,
    confirmed: confirmedRows.length,
    clockedIn: withClockIn.length,
    clockOuts: withClockOut.length,
    active: active.length,
    missingClockOut: missingClockOut.length,
    noClockIn: noClockIn.length,
    extras: extras.length,
    offlineCaptured: offlineCaptured.length,
    reviewRequired: reviewRequired.length,
    incidents:
      missingClockOut.length + noClockIn.length + extras.length + reviewRequired.length,
  };

  const ids = (list: AttendanceTruthRow[]) => list.map(r => r.employee_id);
  const explain: Record<keyof AttendanceCounts, string[]> = {
    expected: ids(expectedRows),
    confirmed: confirmedRows.map(a => a.employee_id),
    clockedIn: ids(withClockIn),
    clockOuts: ids(withClockOut),
    active: ids(active),
    missingClockOut: ids(missingClockOut),
    noClockIn: ids(noClockIn),
    extras: ids(extras),
    offlineCaptured: ids(offlineCaptured),
    reviewRequired: ids(reviewRequired),
    incidents: [...ids(missingClockOut), ...ids(noClockIn), ...ids(extras), ...ids(reviewRequired)],
  };

  return { rows, counts, explain };
}

/** Etiquetas canónicas — la UI no inventa nombres nuevos para estos números. */
export const ATTENDANCE_COUNT_LABEL: Record<keyof AttendanceCounts, string> = {
  expected: "Esperados",
  confirmed: "Confirmados",
  clockedIn: "Fichados",
  clockOuts: "Salidas",
  active: "Activos ahora",
  missingClockOut: "Falta salida",
  noClockIn: "Sin fichaje recibido",
  offlineCaptured: "Capturados sin conexión",
  reviewRequired: "Requieren revisión",
  extras: "Extras",
  incidents: "Incidencias",
};
