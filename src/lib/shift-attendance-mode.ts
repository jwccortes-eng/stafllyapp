/**
 * Shift attendance mode — single source of truth for presence vs. payroll-hours.
 *
 * - clock   → traditional time clock; clock_in/out feed payroll hours.
 * - arrival → presence/punctuality only (typical for daily / weekend / pay-per-day).
 *             Events are stored as type='arrival'/'departure' with
 *             is_payroll_relevant=false. Worker is paid the daily rate regardless.
 * - hybrid  → both modes coexist (mandatory arrival + clock for hours).
 *
 * The DB enforces these via the scheduled_shifts.attendance_mode CHECK.
 */
export type ShiftAttendanceMode = "clock" | "arrival" | "hybrid";

export const SHIFT_ATTENDANCE_MODES: ShiftAttendanceMode[] = [
  "clock",
  "arrival",
  "hybrid",
];

export const SHIFT_ATTENDANCE_MODE_LABELS: Record<ShiftAttendanceMode, string> = {
  clock: "Time Clock (entrada y salida)",
  arrival: "Control de llegada (presencia)",
  hybrid: "Híbrido (llegada + reloj)",
};

export const SHIFT_ATTENDANCE_MODE_HINTS: Record<ShiftAttendanceMode, string> = {
  clock: "Para turnos hourly: el clock in/out genera horas para nómina.",
  arrival: "Para day pay / weekend job: registra llegada y salida sin convertirlo en horas pagables.",
  hybrid: "Exige llegada operativa y además registra horas reales (uso poco común).",
};

/**
 * Sensible default given a pay_type. Daily-paid shifts default to 'arrival'
 * because punching a clock would imply hourly payroll. Hourly defaults to 'clock'.
 */
export function defaultAttendanceModeForPayType(
  payType: string | null | undefined,
): ShiftAttendanceMode {
  return (payType ?? "").toLowerCase() === "daily" ? "arrival" : "clock";
}

/** Worker-facing labels for the primary action button. */
export function actionLabelsForMode(mode: ShiftAttendanceMode): {
  in: string;
  out: string;
  inSuccess: string;
  outSuccess: string;
} {
  if (mode === "arrival") {
    return {
      in: "Reportar llegada",
      out: "Reportar salida",
      inSuccess: "Llegada registrada",
      outSuccess: "Salida registrada",
    };
  }
  return {
    in: "Marcar entrada",
    out: "Marcar salida",
    inSuccess: "Entrada registrada",
    outSuccess: "Salida registrada",
  };
}

// ─────────────────────────────────────────────────────────────
// Presence aggregates (admin view)
// ─────────────────────────────────────────────────────────────

export type PresenceStatus =
  | "pending"     // assigned, no event yet
  | "arrived"     // arrival registered, on time
  | "arrived_late"
  | "on_site"     // arrived (any) and not yet departed
  | "departed"    // arrival + departure registered
  | "no_show";    // assignment.status='no_show'

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  pending: "Pendiente",
  arrived: "Llegó",
  arrived_late: "Llegó tarde",
  on_site: "En sitio",
  departed: "Ya salió",
  no_show: "No se presentó",
};

export type Punctuality = "on_time" | "late" | "very_late";

export const PUNCTUALITY_LABELS: Record<Punctuality, string> = {
  on_time: "A tiempo",
  late: "Tarde",
  very_late: "Muy tarde",
};
