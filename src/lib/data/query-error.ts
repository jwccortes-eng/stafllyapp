/**
 * Clasificación canónica de errores de lectura del backend.
 *
 * Origen: P0 Worker Portal My Shifts. Una pantalla nunca puede quedarse en
 * esqueleto infinito porque se descartó `{ error }`.
 */

export type QueryErrorKind = "timeout" | "unauthorized" | "network" | "unknown";

export interface ClassifiedQueryError {
  kind: QueryErrorKind;
  /** Mensaje operativo en español, listo para mostrar. */
  message: string;
  /** true si reintentar tiene sentido sin ninguna acción del usuario. */
  retryable: boolean;
}

interface RawError {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}

export function classifyQueryError(error: unknown): ClassifiedQueryError {
  const e = (error ?? {}) as RawError;
  const code = (e.code ?? "").toString();
  const raw = (e.message ?? "").toString();
  const text = raw.toLowerCase();

  if (code === "57014" || text.includes("statement timeout") || text.includes("timeout")) {
    return {
      kind: "timeout",
      message:
        "La consulta tardó demasiado y el servidor la canceló. Vuelve a intentarlo; si persiste, avísale a tu coordinador.",
      retryable: true,
    };
  }

  if (code === "42501" || code === "PGRST301" || e.status === 401 || e.status === 403) {
    return {
      kind: "unauthorized",
      message:
        "Tu sesión no tiene acceso a esta información. Cierra sesión y vuelve a entrar.",
      retryable: false,
    };
  }

  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("load failed")) {
    return {
      kind: "network",
      message: "Sin conexión con el servidor. Revisa tu red y reintenta.",
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    message: raw || "No pudimos cargar la información.",
    retryable: true,
  };
}
