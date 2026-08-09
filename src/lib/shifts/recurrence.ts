/**
 * P0 — RECURRING SERVICE CREATION
 * ================================
 *
 * Modelo canónico de recurrencia de Servicios.
 *
 * Una recurrencia NO es una fila con varias fechas: produce Servicios
 * operativos independientes (UUID propio, QK propio, fecha propia), unidos
 * únicamente por una referencia de serie común.
 *
 * Trazabilidad e idempotencia reutilizan la infraestructura existente de
 * `scheduled_shifts.reconciliation_hash` (la misma que usa Smart Intake para
 * no duplicar drafts). No se crea ninguna tabla ni sistema paralelo.
 *
 * Este módulo es PURO: sin React, sin red, sin escrituras.
 */

export const RECURRENCE_REF_PREFIX = "series";

export interface RecurrenceOccurrencePlan {
  /** yyyy-MM-dd */
  date: string;
  /** 0 = ocurrencia origen. */
  index: number;
  isBase: boolean;
  /** Clave estable de idempotencia dentro de la intención. */
  sourceRef: string;
}

/** Identidad estable de UNA intención de recurrencia (un submit del operador). */
export function newRecurrenceIntentId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Referencia por ocurrencia: única dentro de la empresa y estable ante retry. */
export function recurrenceOccurrenceRef(intentId: string, date: string): string {
  return `${RECURRENCE_REF_PREFIX}:${intentId}:${date}`;
}

/** Desde cualquier Servicio se puede reconstruir el lote del que nació. */
export function parseRecurrenceRef(
  ref: string | null | undefined,
): { intentId: string; date: string } | null {
  if (!ref) return null;
  const parts = String(ref).split(":");
  if (parts.length !== 3 || parts[0] !== RECURRENCE_REF_PREFIX) return null;
  if (!parts[1] || !parts[2]) return null;
  return { intentId: parts[1], date: parts[2] };
}

/**
 * Plan completo de la serie: ocurrencia origen + repeticiones.
 * - deduplica fechas,
 * - ordena cronológicamente,
 * - la base siempre es la fecha origen (aunque no sea la más temprana).
 */
export function planRecurrenceOccurrences(
  baseDate: string,
  repeatDates: string[],
  intentId: string,
): RecurrenceOccurrencePlan[] {
  if (!baseDate) return [];
  const seen = new Set<string>([baseDate]);
  const extras: string[] = [];
  for (const d of repeatDates ?? []) {
    const clean = (d ?? "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    extras.push(clean);
  }
  extras.sort();
  return [baseDate, ...extras].map((date, index) => ({
    date,
    index,
    isBase: index === 0,
    sourceRef: recurrenceOccurrenceRef(intentId, date),
  }));
}

export type OccurrenceStatus = "created" | "reused" | "failed";

export interface OccurrenceOutcome {
  date: string;
  isBase: boolean;
  status: OccurrenceStatus;
  shiftId: string | null;
  /** QK visible, cuando ya se conoce. */
  ref: string | null;
  workersRequested: number;
  workersCopied: number;
  error: string | null;
}

export interface SeriesSummary {
  total: number;
  created: number;
  reused: number;
  failed: number;
  workersRequested: number;
  workersCopied: number;
  /** Servicios creados pero cuyo equipo no se pudo copiar. */
  workerFailures: number;
}

export function summarizeSeries(outcomes: OccurrenceOutcome[]): SeriesSummary {
  return outcomes.reduce<SeriesSummary>(
    (acc, o) => {
      acc.total += 1;
      if (o.status === "created") acc.created += 1;
      if (o.status === "reused") acc.reused += 1;
      if (o.status === "failed") acc.failed += 1;
      acc.workersRequested += o.workersRequested;
      acc.workersCopied += o.workersCopied;
      if (o.status !== "failed" && o.workersRequested > o.workersCopied) acc.workerFailures += 1;
      return acc;
    },
    { total: 0, created: 0, reused: 0, failed: 0, workersRequested: 0, workersCopied: 0, workerFailures: 0 },
  );
}

/** Copy operativo del resultado. Sin jerga técnica. */
export function seriesResultMessage(summary: SeriesSummary): string {
  const persisted = summary.created + summary.reused;
  if (summary.failed === 0) {
    return `${persisted} Servicio${persisted === 1 ? "" : "s"} de la serie ${persisted === 1 ? "creado" : "creados"}`;
  }
  return `${persisted} de ${summary.total} Servicios creados — ${summary.failed} no se pudieron crear`;
}
