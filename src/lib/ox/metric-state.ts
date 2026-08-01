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
