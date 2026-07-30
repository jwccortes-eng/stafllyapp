/**
 * OAI F1 — the 25 approved metrics (PURE).
 *
 * A metric that cannot be computed from currently observable data is reported
 * with `status: "not_observable"` and a null value. Values are never invented.
 */
import type { ObservationRecordOAI } from "../engine/types";

export type MetricStatus = "observable" | "partial" | "not_observable";

export interface Metric {
  id: number;
  key: string;
  label: string;
  value: number | null;
  unit: "count" | "percent" | "ms" | "minutes" | "scale";
  status: MetricStatus;
  note?: string;
}

const ADMIN_MINUTES_PER_NAVIGATION = 1.5;
const ADMIN_MINUTES_PER_REVIEW = 3;

export function computeMetrics(records: ObservationRecordOAI[]): Metric[] {
  const attempts = records.filter((r) => r.triggerType === "assignment_attempt" || r.triggerType === "block_shown" || r.triggerType === "warning_shown");
  const blocked = records.filter((r) => r.systemReadinessState === "blocked");
  const warned = records.filter((r) => r.systemReadinessState === "warned");
  const assignedAfterNegative = records.filter(
    (r) =>
      (r.systemReadinessState === "blocked" || r.systemReadinessState === "warned") &&
      r.assignmentResult === "assigned",
  );
  const contradictions = records.filter((r) => r.contradictionDetected);

  // "Apparent false block": blocked, later assigned, and no evidence changed in
  // between (i.e. the contradiction flag survived). Still only *apparent*.
  const apparentFalseBlocks = contradictions.filter(
    (r) => r.systemReadinessState === "blocked" && r.assignmentResult === "assigned",
  );
  const confirmedBlocks = blocked.filter((r) => r.assignmentResult === "not_assigned");
  const indeterminate = records.filter(
    (r) => r.assignmentResult === "unknown" || r.simulatedOaiOutcome === "unknown",
  );

  const latencies = records
    .map((r) => r.latencyMsFromBlock)
    .filter((v): v is number => typeof v === "number" && v >= 0);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  const navigations = records.reduce((sum, r) => sum + r.navigationCount, 0);
  const contextLosses = records.filter((r) => r.contextLossDetected).length;
  const reviewsNeeded = records.reduce(
    (sum, r) => sum + r.documentStateSummary.receivedNotReviewed,
    0,
  );
  const persistenceIssues = records.filter((r) => r.persistenceIssueDetected).length;

  const evidenceBefore = records.filter(
    (r) => r.eventualOutcome === "evidence_completed_before_shift",
  ).length;
  const evidenceAfter = records.filter(
    (r) => r.eventualOutcome === "evidence_completed_after_shift",
  ).length;
  const evidencePendingPayroll = records.filter(
    (r) => r.eventualOutcome === "evidence_pending_at_payroll",
  ).length;

  const repeatKey = new Map<string, number>();
  for (const r of contradictions) {
    const key = `${r.workerRef}`;
    repeatKey.set(key, (repeatKey.get(key) ?? 0) + 1);
  }
  const repeatedExceptions = [...repeatKey.values()].filter((n) => n > 1).length;

  const unclassified = records.reduce((s, r) => s + r.unclassifiedRequirements.length, 0);
  const cascadeConflicts = records.reduce((s, r) => s + r.cascadeConflicts.length, 0);
  const authorityUnresolved = records.filter((r) => r.authorityStatus !== "explicit").length;
  const possibleIgnoredHardStop = records.filter(
    (r) => r.simulatedOaiOutcome === "legally_prohibited" && r.assignmentResult === "assigned",
  ).length;
  const withConditions = records.filter(
    (r) => r.simulatedOaiOutcome === "authorized_with_conditions",
  ).length;
  const abandoned = records.filter(
    (r) => r.humanAction === "abandoned" || r.humanAction === "navigated_away",
  ).length;

  const adminMinutes =
    Math.round(
      (navigations * ADMIN_MINUTES_PER_NAVIGATION + reviewsNeeded * ADMIN_MINUTES_PER_REVIEW) * 10,
    ) / 10;

  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

  return [
    m(1, "assignment_attempts", "Intentos de asignación", attempts.length, "count", "observable"),
    m(2, "blocked", "Bloqueados por el sistema", blocked.length, "count", "observable"),
    m(3, "warned", "Advertidos", warned.length, "count", "observable"),
    m(4, "assigned_after", "Asignados tras bloqueo/advertencia", assignedAfterNegative.length, "count", "observable"),
    m(5, "apparent_false_blocks", "Falsos bloqueos aparentes", apparentFalseBlocks.length, "count", "partial",
      "Aparente: no implica que la asignación fuese correcta."),
    m(6, "confirmed_blocks", "Bloqueos confirmados", confirmedBlocks.length, "count", "partial",
      "Confirmado sólo por ausencia de asignación posterior."),
    m(7, "indeterminate", "Casos indeterminados", indeterminate.length, "count", "observable"),
    m(8, "time_to_assignment", "Tiempo medio bloqueo→asignación", avgLatency, "ms",
      avgLatency === null ? "not_observable" : "observable"),
    m(9, "extra_navigations", "Navegaciones adicionales", navigations, "count", "observable"),
    m(10, "context_losses", "Pérdidas de contexto", contextLosses, "count", "observable"),
    m(11, "reviews_needed", "Revisiones de documentos necesarias", reviewsNeeded, "count", "observable"),
    m(12, "approvals_without_effect", "Documentos aprobados sin efecto inmediato", persistenceIssues, "count", "partial",
      "Derivado de la sonda de persistencia."),
    m(13, "non_persisted_changes", "Cambios que no persistieron", persistenceIssues, "count", "partial"),
    m(14, "evidence_before_shift", "Evidencia completada antes del turno", evidenceBefore, "count", "partial"),
    m(15, "evidence_after_shift", "Evidencia completada después del turno", evidenceAfter, "count", "partial"),
    m(16, "evidence_pending_payroll", "Evidencia pendiente al payroll", evidencePendingPayroll, "count", "partial",
      "Requiere seguimiento diferido; parcial en Etapa 1."),
    m(17, "repeated_exceptions", "Excepciones repetidas", repeatedExceptions, "count", "observable"),
    m(18, "unclassified_requirements", "Requisitos no clasificados", unclassified, "count", "observable"),
    m(19, "cascade_conflicts", "Conflictos de cascada", cascadeConflicts, "count", "observable"),
    m(20, "authority_unresolved", "Autoridad unresolved", authorityUnresolved, "count", "observable"),
    m(21, "possible_ignored_hard_stop", "Posible hard stop ignorado", possibleIgnoredHardStop, "count", "partial",
      "Sólo cuenta hard stops explícitos y vigentes."),
    m(22, "authorized_with_conditions", "authorized_with_conditions simulado", withConditions, "count", "observable"),
    m(23, "admin_cost_minutes", "Costo administrativo estimado", adminMinutes, "minutes", "partial",
      "Estimación heurística: 1.5 min/navegación + 3 min/revisión."),
    m(24, "abandonment_rate", "Tasa de abandono", pct(abandoned, attempts.length || records.length), "percent", "observable"),
    m(25, "operational_impact", "Impacto operacional", null, "scale", "not_observable",
      "No existe hoy señal de criticidad del turno. No se inventa valor."),
  ];
}

function m(
  id: number,
  key: string,
  label: string,
  value: number | null,
  unit: Metric["unit"],
  status: MetricStatus,
  note?: string,
): Metric {
  return { id, key, label, value: status === "not_observable" ? null : value, unit, status, note };
}

export function outcomeDistribution(records: ObservationRecordOAI[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.simulatedOaiOutcome, (counts.get(r.simulatedOaiOutcome) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
