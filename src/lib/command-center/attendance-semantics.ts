/**
 * OX-4.3.1 — Semántica de asistencia del Today Hub.
 *
 * Regla dura: `not_started` NO significa no-show. `not_started` es la ausencia
 * de un fichaje de entrada; puede deberse a que el turno aún no empieza, a que
 * el worker viene en camino, o a que efectivamente no llegó.
 *
 * Un "no-show confirmado" requiere EVIDENCIA EXPLÍCITA. Hoy el modelo
 * operacional (`useTodayOperations` → `ops`) no expone ese estado, por lo que
 * este módulo sólo lo produce cuando la fuente entrega `confirmed_no_shows > 0`.
 *
 * FUENTE FUTURA (documentado, no implementado en este sprint):
 *  - `shift_assignments.status = 'no_show'` marcado por un humano autorizado
 *    (captain/manager) desde Shift Ops, o
 *  - un cierre operacional (`shift_closeout_reports`) que registre ausencias
 *    confirmadas al cerrar el turno.
 * Cuando exista, `useTodayOperations` debe agregar `confirmed_no_shows` al
 * bloque `ops` y este módulo lo consumirá sin cambios de UI.
 *
 * Puro: sin React, sin red, sin escrituras.
 */

export type AttendanceState =
  | "shift_not_started"
  | "awaiting_checkin"
  | "missing_checkin"
  | "no_show_confirmed"
  | "unknown";

export interface AttendanceInput {
  /** Bucket operacional del turno. */
  bucket: string;
  /** Asignados activos. */
  assigned: number;
  /** Con fichaje de entrada. */
  clockedIn: number;
  /** Sin fichaje de entrada (NO es no-show). */
  notStarted: number;
  /** Minutos hasta el inicio (negativo = ya comenzó). */
  minutesUntilStart: number;
  /** Evidencia explícita de no-show. Ausente hoy en el modelo. */
  confirmedNoShows?: number | null;
}

/** Tolerancia operativa antes de considerar que falta el check-in. */
export const CHECKIN_GRACE_MINUTES = 15;

export interface AttendanceReading {
  state: AttendanceState;
  /** Copy corto para badge/estado. */
  label: string;
  /** Frase explicativa (por qué el sistema lo señala). */
  detail: string;
  /** Cantidad de personas involucradas en el estado. */
  count: number;
  priority: "critical" | "high" | "medium" | "low";
  /** Status token para OCS/StatusBadge. */
  status: string;
}

/**
 * Clasifica la asistencia de un turno sin inventar no-shows.
 * Devuelve `null` cuando no hay nada que señalar.
 */
export function readAttendance(input: AttendanceInput): AttendanceReading | null {
  const confirmed = input.confirmedNoShows ?? 0;

  if (confirmed > 0) {
    return {
      state: "no_show_confirmed",
      label: "No-show confirmado",
      detail: `${confirmed} ausencia(s) confirmada(s) por el equipo operativo.`,
      count: confirmed,
      priority: "critical",
      status: "no_show",
    };
  }

  if (input.notStarted <= 0) return null;

  // El turno todavía no arranca: nunca es un problema de asistencia.
  if (input.bucket !== "in_progress" && input.minutesUntilStart > 0) {
    return {
      state: "shift_not_started",
      label: "Aún no inicia",
      detail: `${input.notStarted} de ${input.assigned} sin fichaje: el turno todavía no comienza.`,
      count: input.notStarted,
      priority: "low",
      status: "scheduled",
    };
  }

  // Sin datos suficientes para leer asistencia.
  if (input.assigned <= 0) {
    return {
      state: "unknown",
      label: "Asistencia sin datos",
      detail: "No hay asignados activos para leer asistencia en este turno.",
      count: 0,
      priority: "low",
      status: "unknown",
    };
  }

  const elapsed = -input.minutesUntilStart;

  if (input.bucket === "in_progress" && elapsed <= CHECKIN_GRACE_MINUTES) {
    return {
      state: "awaiting_checkin",
      label: "Pendiente de llegada",
      detail: `${input.notStarted} de ${input.assigned} aún no fichan; el turno inició hace ${Math.max(0, Math.round(elapsed))} min.`,
      count: input.notStarted,
      priority: "medium",
      status: "pending",
    };
  }

  if (input.bucket === "in_progress") {
    return {
      state: "missing_checkin",
      label: "Sin check-in",
      detail: `${input.notStarted} de ${input.assigned} sin fichaje ${Math.round(elapsed)} min después del inicio. No es un no-show confirmado.`,
      count: input.notStarted,
      priority: "high",
      status: "late",
    };
  }

  return {
    state: "unknown",
    label: "Asistencia sin confirmar",
    detail: `${input.notStarted} de ${input.assigned} sin fichaje registrado.`,
    count: input.notStarted,
    priority: "medium",
    status: "unknown",
  };
}
