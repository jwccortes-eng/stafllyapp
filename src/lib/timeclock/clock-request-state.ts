/**
 * P0-A — CLOCK-IN DELIVERY INTEGRITY.
 *
 * Máquina de estados pura del envío de un fichaje. No conoce React ni
 * Supabase. La UI nunca puede asumir éxito antes de la confirmación del
 * servidor, y nunca puede volver a ofrecer "Fichar entrada" mientras el
 * resultado sea desconocido.
 *
 * IDLE → SUBMITTING → SUCCESS | FAILED | UNKNOWN
 * UNKNOWN sólo sale con una verificación canónica contra el servidor.
 */

export type ClockRequestStatus =
  | "IDLE"
  | "SUBMITTING"
  | "SUCCESS"
  | "FAILED"
  | "UNKNOWN";

export interface ClockRequestState {
  status: ClockRequestStatus;
  /** Mensaje humano del último fallo. */
  error: string | null;
  /** Intentos ya realizados de esta misma acción. */
  attempts: number;
  /** True mientras se está verificando el estado real tras un resultado ambiguo. */
  verifying: boolean;
}

export const initialClockRequestState: ClockRequestState = {
  status: "IDLE",
  error: null,
  attempts: 0,
  verifying: false,
};

export type ClockRequestEvent =
  | { type: "SUBMIT" }
  | { type: "CONFIRMED" }
  | { type: "FAILED"; error: string }
  | { type: "AMBIGUOUS"; error: string }
  | { type: "VERIFY_START" }
  | { type: "VERIFY_RESULT"; persisted: boolean }
  | { type: "RESET" };

export function clockRequestReducer(
  state: ClockRequestState,
  event: ClockRequestEvent,
): ClockRequestState {
  switch (event.type) {
    case "SUBMIT":
      // Guardia dura contra doble submit: si ya hay request activo, no cambia.
      if (state.status === "SUBMITTING" || state.verifying) return state;
      return { status: "SUBMITTING", error: null, attempts: state.attempts + 1, verifying: false };
    case "CONFIRMED":
      return { status: "SUCCESS", error: null, attempts: state.attempts, verifying: false };
    case "FAILED":
      return { status: "FAILED", error: event.error, attempts: state.attempts, verifying: false };
    case "AMBIGUOUS":
      return { status: "UNKNOWN", error: event.error, attempts: state.attempts, verifying: false };
    case "VERIFY_START":
      return { ...state, verifying: true };
    case "VERIFY_RESULT":
      return event.persisted
        ? { status: "SUCCESS", error: null, attempts: state.attempts, verifying: false }
        : {
            status: "FAILED",
            error: "No llegó al servidor. Nada quedó registrado.",
            attempts: state.attempts,
            verifying: false,
          };
    case "RESET":
      return initialClockRequestState;
    default:
      return state;
  }
}

/** ¿La acción está bloqueada porque hay un request vivo o un resultado sin confirmar? */
export function isActionLocked(state: ClockRequestState): boolean {
  return state.status === "SUBMITTING" || state.status === "UNKNOWN" || state.verifying;
}

/** Etiqueta canónica del botón. Nunca miente sobre lo que pasó. */
export function clockButtonLabel(
  state: ClockRequestState,
  idleLabel: string,
): string {
  switch (state.status) {
    case "SUBMITTING":
      return "Enviando…";
    case "UNKNOWN":
      return state.verifying ? "Verificando…" : "Verificar estado";
    case "FAILED":
      return "Reintentar";
    default:
      return idleLabel;
  }
}

const AMBIGUOUS_PATTERNS = [
  "failed to fetch",
  "network",
  "networkerror",
  "timeout",
  "timed out",
  "aborted",
  "abort",
  "load failed",
  "connection",
  "econnreset",
  "504",
  "502",
  "503",
];

/**
 * Un fallo es AMBIGUO cuando no podemos afirmar que el servidor no lo recibió
 * (red caída a mitad, timeout, 5xx). En ese caso jamás se reintenta a ciegas:
 * primero se verifica el estado real.
 */
export function isAmbiguousFailure(err: unknown): boolean {
  const msg = (
    typeof err === "string" ? err : ((err as { message?: string })?.message ?? "")
  ).toLowerCase();
  if (!msg) return true; // sin información → tratar como desconocido
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return AMBIGUOUS_PATTERNS.some((p) => msg.includes(p));
}
