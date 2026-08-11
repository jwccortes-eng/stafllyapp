/**
 * useClockRequest — envoltorio React de la máquina de estados de fichaje.
 *
 * Garantías (P0-A):
 *   - Un solo request activo: doble tap no crea dos fichajes.
 *   - Nunca marca éxito sin confirmación del servidor.
 *   - Fallo ambiguo (red/timeout) ⇒ verificación canónica antes de re-habilitar.
 *   - Nunca crea time_entries locales falsos.
 */
import { useCallback, useReducer, useRef } from "react";
import {
  clockRequestReducer,
  initialClockRequestState,
  isActionLocked,
  isAmbiguousFailure,
  type ClockRequestState,
} from "@/lib/timeclock/clock-request-state";

export interface UseClockRequestOptions {
  /**
   * Verificación canónica: relee el servidor y responde si la acción quedó
   * persistida. Se usa tras un resultado ambiguo y tras el éxito.
   */
  verify: () => Promise<boolean>;
  /** Refetch canónico después de un éxito confirmado. */
  onConfirmed?: () => Promise<void> | void;
}

export interface UseClockRequestApi {
  state: ClockRequestState;
  locked: boolean;
  /** Ejecuta la acción respetando la máquina de estados. */
  submit: (action: () => Promise<void>) => Promise<void>;
  /** Reintenta la última acción fallida. */
  retry: () => Promise<void>;
  /** Fuerza la verificación del estado real (salida de UNKNOWN). */
  verifyNow: () => Promise<void>;
  reset: () => void;
}

export function useClockRequest(opts: UseClockRequestOptions): UseClockRequestApi {
  const [state, dispatch] = useReducer(clockRequestReducer, initialClockRequestState);
  const inFlight = useRef(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const runVerify = useCallback(async () => {
    dispatch({ type: "VERIFY_START" });
    try {
      const persisted = await optsRef.current.verify();
      dispatch({ type: "VERIFY_RESULT", persisted });
      if (persisted) await optsRef.current.onConfirmed?.();
    } catch {
      // Si ni siquiera podemos verificar, seguimos en desconocido: jamás
      // volvemos a ofrecer la acción como si nada hubiera pasado.
      dispatch({ type: "AMBIGUOUS", error: "No pudimos confirmar el estado real. Revisa tu conexión." });
    }
  }, []);

  const submit = useCallback(
    async (action: () => Promise<void>) => {
      if (inFlight.current || isActionLocked(state)) return;
      inFlight.current = true;
      lastAction.current = action;
      dispatch({ type: "SUBMIT" });
      try {
        await action();
        dispatch({ type: "CONFIRMED" });
        await optsRef.current.onConfirmed?.();
      } catch (err) {
        if (isAmbiguousFailure(err)) {
          dispatch({
            type: "AMBIGUOUS",
            error:
              (err as { message?: string })?.message ??
              "La conexión se interrumpió y no sabemos si quedó registrado.",
          });
          await runVerify();
        } else {
          dispatch({
            type: "FAILED",
            error: (err as { message?: string })?.message ?? "No se pudo registrar el fichaje.",
          });
        }
      } finally {
        inFlight.current = false;
      }
    },
    [state, runVerify],
  );

  const retry = useCallback(async () => {
    if (!lastAction.current) return;
    if (state.status === "UNKNOWN") {
      await runVerify();
      return;
    }
    await submit(lastAction.current);
  }, [state.status, submit, runVerify]);

  return {
    state,
    locked: isActionLocked(state),
    submit,
    retry,
    verifyNow: runVerify,
    reset: () => dispatch({ type: "RESET" }),
  };
}
