/**
 * P0 OX — Explicit metric states. Kills the "silent zero".
 *
 * A KPI must always declare WHY it shows what it shows. A zero is only a zero
 * when the query succeeded and the answer really is none.
 */

export type MetricStateKind =
  | "loading"
  | "error"
  | "zero_confirmed"
  | "no_data"
  | "not_applicable"
  | "incomplete_configuration";

export interface MetricState {
  kind: MetricStateKind;
  /** Numeric value — only meaningful for zero_confirmed / a real count. */
  value?: number;
  /** Unit noun, always plural-ready: "workers", "turnos", "horas"… */
  unit: string;
  /** Human sentence shown under the value. */
  message: string;
}

export function loadingMetric(unit: string): MetricState {
  return { kind: "loading", unit, message: "Cargando…" };
}

export function errorMetric(unit: string): MetricState {
  return {
    kind: "error",
    unit,
    message: "No pudimos cargar este dato.",
  };
}

export function noDataMetric(unit: string, message: string): MetricState {
  return { kind: "no_data", unit, message };
}

export function notApplicableMetric(unit: string, message: string): MetricState {
  return { kind: "not_applicable", unit, message };
}

export function needsConfigMetric(unit: string, message: string): MetricState {
  return { kind: "incomplete_configuration", unit, message };
}

/**
 * Builds a resolved metric. A count of 0 becomes an explicit zero_confirmed
 * with its own reassuring copy — never a bare "0".
 */
export function countMetric(
  value: number,
  unit: string,
  copy: { zero: string; some: (n: number) => string },
): MetricState {
  if (value === 0) {
    return { kind: "zero_confirmed", value: 0, unit, message: copy.zero };
  }
  return { kind: "zero_confirmed", value, unit, message: copy.some(value) };
}

export function isActionable(state: MetricState): boolean {
  return state.kind === "zero_confirmed" && (state.value ?? 0) > 0;
}

/**
 * OX-4.5 — Traduce un MetricState a lo que una KPI debe mostrar:
 * valor + unidad + contexto + estado + consecuencia.
 * Presentación pura: no consulta nada y no inventa números.
 */
export interface MetricPresentation {
  /** Valor formateado con su unidad. Null cuando no hay número que mostrar. */
  displayValue: string | null;
  unit: string;
  /** Qué significa para la operación. Siempre presente. */
  meaning: string;
  /** Qué pasa si no se atiende. Null cuando no hay nada que hacer. */
  consequence: string | null;
  statusKey: string;
  statusLabel: string;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyLabel: string;
  /** Verdadero sólo cuando hay algo que atender. */
  actionable: boolean;
}

export function presentMetric(
  state: MetricState,
  copy?: { consequence?: string | null },
): MetricPresentation {
  const base = {
    unit: state.unit,
    meaning: state.message,
    consequence: null as string | null,
    loading: false,
    error: null as string | null,
    isEmpty: false,
    emptyLabel: state.message,
    actionable: false,
  };

  switch (state.kind) {
    case "loading":
      return {
        ...base,
        displayValue: null,
        statusKey: "in_progress",
        statusLabel: "Cargando",
        loading: true,
        meaning: "Estamos consultando este dato.",
      };
    case "error":
      return {
        ...base,
        displayValue: null,
        statusKey: "failed",
        statusLabel: "Error de carga",
        error: state.message,
        consequence: "El número mostrado no es confiable hasta reintentar.",
      };
    case "no_data":
      return {
        ...base,
        displayValue: null,
        statusKey: "not_applicable",
        statusLabel: "Sin datos",
        isEmpty: true,
      };
    case "not_applicable":
      return {
        ...base,
        displayValue: null,
        statusKey: "not_applicable",
        statusLabel: "No aplica",
        isEmpty: true,
      };
    case "incomplete_configuration":
      return {
        ...base,
        displayValue: null,
        statusKey: "needs_review",
        statusLabel: "Configuración incompleta",
        isEmpty: true,
        consequence: "Este indicador no puede calcularse hasta completarla.",
      };
    case "zero_confirmed":
    default: {
      const value = state.value ?? 0;
      const actionable = value > 0;
      return {
        ...base,
        displayValue: `${value} ${state.unit}`,
        statusKey: actionable ? "pending" : "completed",
        statusLabel: actionable ? "Requiere atención" : "Sin pendientes",
        actionable,
        consequence: actionable ? copy?.consequence ?? null : null,
      };
    }
  }
}

