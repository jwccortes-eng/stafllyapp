/**
 * ECC — Fase 4C. OBSERVACIÓN CONTROLADA DEL PILOTO Y CRITERIOS DE SALIDA.
 *
 * Modelo PURO y de sólo lectura: agrega las decisiones que ya produce
 * `runEccPilot` (Fase 4B) a lo largo de una ventana de observación y decide si
 * el piloto puede considerarse estable.
 *
 * Invariantes duros:
 *  - No agrega compañías: cualquier decisión fuera de `QA_TESTING_COMPANY_ID`
 *    es cross-tenant y bloquea la salida.
 *  - No cambia el catálogo, ni los planes, ni los gates legacy.
 *  - No escribe: no toca billing, payroll, Stripe ni RLS.
 *  - La ventana no se cierra por tiempo: se cierra por actividad real.
 *  - Cualquier criterio de rollback disparado ⇒ veredicto `rollback`.
 */
import {
  LATENCY_THRESHOLD_MS,
  rollbackEccPilot,
  type AccessDecisionRecord,
  type ConfidenceLevel,
  type EccPilotRollback,
  type EccPilotRunResult,
  type LiveAlert,
  type LiveAlertCode,
  type RollbackTrigger,
} from "./pilot-live";
import { QA_TESTING_COMPANY_ID, type SurfaceDevice } from "./pilot";

/* ───────────────────── 1. Sesiones observadas ───────────────────── */

export type ObservationEventKind =
  | "session_start"
  | "company_switch"
  | "refresh"
  | "second_tab"
  | "long_session"
  | "resolver_error";

export interface ObservationSession {
  /** Identificador estable de la sesión observada. */
  id: string;
  userId: string;
  device: Exclude<SurfaceDevice, "ambos">;
  startedAt: string;
  /** Duración observada; una sesión "prolongada" es >= 45 minutos. */
  durationMinutes: number;
  events: readonly ObservationEventKind[];
  /** Resultado de la corrida del piloto para esa sesión (Fase 4B). */
  run: EccPilotRunResult;
}

export const LONG_SESSION_MINUTES = 45;

/* ───────────────────── 2. Requisitos de ventana ───────────────────── */

export interface WindowRequirement {
  key: string;
  label: string;
  required: number;
  observed: number;
  met: boolean;
}

export const WINDOW_MINIMUMS = Object.freeze({
  decisions: 100,
  mobileSessions: 2,
  desktopSessions: 2,
  distinctUsers: 2,
  companySwitches: 1,
  refreshes: 1,
  longSessions: 1,
  deniedCapabilities: 1,
  limitsEvaluated: 1,
});

/* ───────────────────── 3. Métricas de la ventana ───────────────────── */

export interface ObservationMetrics {
  totalDecisions: number;
  legacyMatches: number;
  mismatches: number;
  unexpectedDeny: number;
  unexpectedAllow: number;
  unresolvedCapability: number;
  dependencyMismatch: number;
  limitMismatch: number;
  crossTenantResolutions: number;
  versionDrift: number;
  lowConfidence: number;
  resolverErrors: number;
  fallbacks: number;
  rollbacks: number;
  latencyP50: number;
  latencyP95: number;
  surfacesCovered: string[];
  usersAffected: string[];
  confidenceCounts: Record<ConfidenceLevel, number>;
  criticalDecisions: number;
  criticalHighConfidence: number;
  deniedDecisions: number;
  limitsEvaluated: number;
}

/** Superficies consideradas críticas para el criterio de confianza HIGH. */
export const CRITICAL_SURFACES: ReadonlySet<string> = new Set([
  "home",
  "services",
  "workers",
  "documents",
  "compliance",
  "portal",
  "timeclock",
  "payroll_review",
  "settings",
  "invitations",
]);

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

const countAlerts = (alerts: readonly LiveAlert[], code: LiveAlertCode): number =>
  alerts.filter(a => a.code === code).length;

export function computeObservationMetrics(sessions: readonly ObservationSession[]): ObservationMetrics {
  const decisions: AccessDecisionRecord[] = sessions.flatMap(s => s.run.decisions);
  const alerts: LiveAlert[] = sessions.flatMap(s => s.run.alerts);
  const latencies = decisions.map(d => d.latencyMs);

  const critical = decisions.filter(d => CRITICAL_SURFACES.has(d.surface));
  const confidenceCounts: Record<ConfidenceLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const d of decisions) confidenceCounts[d.confidence] += 1;

  return {
    totalDecisions: decisions.length,
    legacyMatches: decisions.filter(d => d.legacyDecision === d.eccDecision).length,
    mismatches: decisions.filter(d => d.legacyDecision !== d.eccDecision).length,
    unexpectedDeny: countAlerts(alerts, "unexpected_deny"),
    unexpectedAllow: countAlerts(alerts, "unexpected_allow"),
    unresolvedCapability: countAlerts(alerts, "unresolved_capability"),
    dependencyMismatch: countAlerts(alerts, "dependency_mismatch"),
    limitMismatch: countAlerts(alerts, "limit_mismatch"),
    crossTenantResolutions:
      countAlerts(alerts, "cross_tenant_resolution") +
      decisions.filter(d => d.companyId !== QA_TESTING_COMPANY_ID).length,
    versionDrift: countAlerts(alerts, "version_drift"),
    lowConfidence: confidenceCounts.LOW,
    resolverErrors: sessions.filter(s => s.events.includes("resolver_error")).length,
    fallbacks: decisions.filter(d => d.fallback).length,
    rollbacks: sessions.filter(s => s.run.autoRollback !== null).length,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    surfacesCovered: [...new Set(decisions.map(d => d.surface))].sort(),
    usersAffected: [...new Set(decisions.map(d => d.userId))].sort(),
    confidenceCounts,
    criticalDecisions: critical.length,
    criticalHighConfidence: critical.filter(d => d.confidence === "HIGH").length,
    deniedDecisions: decisions.filter(d => d.effectiveDecision === false).length,
    limitsEvaluated: decisions.filter(d => d.limitResult !== "n/d").length,
  };
}

/* ───────────────────── 4. Ventana de observación ───────────────────── */

export function evaluateWindow(
  sessions: readonly ObservationSession[],
  metrics: ObservationMetrics,
): WindowRequirement[] {
  const hasEvent = (kind: ObservationEventKind) => sessions.filter(s => s.events.includes(kind)).length;
  const req = (key: string, label: string, required: number, observed: number): WindowRequirement => ({
    key,
    label,
    required,
    observed,
    met: observed >= required,
  });

  return [
    req("decisions", "Decisiones ECC observadas", WINDOW_MINIMUMS.decisions, metrics.totalDecisions),
    req("mobile", "Sesiones mobile", WINDOW_MINIMUMS.mobileSessions, sessions.filter(s => s.device === "mobile").length),
    req("desktop", "Sesiones desktop", WINDOW_MINIMUMS.desktopSessions, sessions.filter(s => s.device === "desktop").length),
    req("users", "Usuarios distintos", WINDOW_MINIMUMS.distinctUsers, new Set(sessions.map(s => s.userId)).size),
    req("company_switch", "Cambios de compañía", WINDOW_MINIMUMS.companySwitches, hasEvent("company_switch")),
    req("refresh", "Refrescos de página", WINDOW_MINIMUMS.refreshes, hasEvent("refresh")),
    req(
      "long_session",
      "Sesiones prolongadas",
      WINDOW_MINIMUMS.longSessions,
      sessions.filter(s => s.durationMinutes >= LONG_SESSION_MINUTES).length,
    ),
    req("denied", "Capacidades denegadas evaluadas", WINDOW_MINIMUMS.deniedCapabilities, metrics.deniedDecisions),
    req("limits", "Límites evaluados", WINDOW_MINIMUMS.limitsEvaluated, metrics.limitsEvaluated),
  ];
}

/* ───────────────────── 5. Criterios de éxito y rollback ───────────────────── */

export interface ExitCriterion {
  key: string;
  label: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export function evaluateExitCriteria(metrics: ObservationMetrics): ExitCriterion[] {
  const zero = (key: string, label: string, value: number): ExitCriterion => ({
    key,
    label,
    expected: "0",
    observed: String(value),
    passed: value === 0,
  });

  return [
    zero("cross_tenant", "Resoluciones cross-tenant", metrics.crossTenantResolutions),
    zero("unexpected_allow", "Permisos inesperados", metrics.unexpectedAllow),
    zero("unexpected_deny", "Denegaciones inesperadas", metrics.unexpectedDeny),
    zero("unresolved", "Capacidades sin resolver", metrics.unresolvedCapability),
    zero("dependency", "Dependencias no satisfechas", metrics.dependencyMismatch),
    zero("version_drift", "Deriva de versión no controlada", metrics.versionDrift),
    zero("auto_rollback", "Rollbacks automáticos", metrics.rollbacks),
    zero("resolver_errors", "Errores del resolver", metrics.resolverErrors),
    {
      key: "critical_confidence",
      label: "Confianza HIGH en decisiones críticas",
      expected: `${metrics.criticalDecisions}/${metrics.criticalDecisions}`,
      observed: `${metrics.criticalHighConfidence}/${metrics.criticalDecisions}`,
      passed: metrics.criticalDecisions > 0 && metrics.criticalHighConfidence === metrics.criticalDecisions,
    },
    {
      key: "latency",
      label: `Latencia p95 bajo el umbral (${LATENCY_THRESHOLD_MS}ms)`,
      expected: `≤ ${LATENCY_THRESHOLD_MS}ms`,
      observed: `p50 ${metrics.latencyP50}ms · p95 ${metrics.latencyP95}ms`,
      passed: metrics.latencyP95 <= LATENCY_THRESHOLD_MS,
    },
    {
      key: "legacy_match",
      label: "Legacy y ECC coinciden",
      expected: `${metrics.totalDecisions}/${metrics.totalDecisions}`,
      observed: `${metrics.legacyMatches}/${metrics.totalDecisions}`,
      passed: metrics.totalDecisions > 0 && metrics.mismatches === 0,
    },
    {
      key: "no_regression",
      label: "Sin regresión visible (fallbacks no forzados)",
      expected: "0",
      observed: String(metrics.fallbacks),
      passed: metrics.fallbacks === 0,
    },
  ];
}

export interface RollbackSignal {
  trigger: RollbackTrigger;
  label: string;
  fired: boolean;
  detail: string;
}

export function evaluateRollbackSignals(metrics: ObservationMetrics): RollbackSignal[] {
  const sig = (trigger: RollbackTrigger, label: string, count: number, unit: string): RollbackSignal => ({
    trigger,
    label,
    fired: count > 0,
    detail: `${count} ${unit}`,
  });

  return [
    sig("cross_tenant", "Acceso cross-tenant", metrics.crossTenantResolutions, "resoluciones"),
    sig("unexpected_allow", "Permiso inesperado", metrics.unexpectedAllow, "alertas"),
    sig("unexpected_deny", "Denegación inesperada crítica", metrics.unexpectedDeny, "alertas"),
    sig("resolver_error", "Errores repetidos del resolver", metrics.resolverErrors, "sesiones"),
    {
      trigger: "latency_threshold",
      label: "Latencia degradada",
      fired: metrics.latencyP95 > LATENCY_THRESHOLD_MS,
      detail: `p95 ${metrics.latencyP95}ms vs umbral ${LATENCY_THRESHOLD_MS}ms`,
    },
    sig("version_drift", "Deriva de versión", metrics.versionDrift, "alertas"),
    sig("unexpected_deny", "Capability desconocida", metrics.unresolvedCapability, "alertas"),
    {
      trigger: "low_confidence",
      label: "LOW confidence en operación crítica",
      fired: metrics.criticalDecisions > 0 && metrics.criticalHighConfidence < metrics.criticalDecisions,
      detail: `${metrics.criticalDecisions - metrics.criticalHighConfidence} decisiones críticas sin HIGH`,
    },
  ];
}

/* ───────────────────── 6. Veredicto ───────────────────── */

export type ObservationVerdict = "stable" | "window_open" | "rollback";

export interface ObservationReport {
  companyId: string;
  companyName: string;
  windowStart: string;
  windowEnd: string;
  sessions: number;
  metrics: ObservationMetrics;
  window: WindowRequirement[];
  windowComplete: boolean;
  exitCriteria: ExitCriterion[];
  exitCriteriaPassed: boolean;
  rollbackSignals: RollbackSignal[];
  rollbackRequired: boolean;
  rollback: EccPilotRollback | null;
  verdict: ObservationVerdict;
  statement: string;
  otherCompaniesTouched: 0;
  generatedAt: string;
}

export const OBSERVATION_STABLE_STATEMENT =
  "QA Testing completó la ventana de observación sin mismatches, alertas, decisiones inesperadas ni impacto cross-tenant; ECC puede considerarse estable para esta compañía.";

export function buildObservationReport(
  sessions: readonly ObservationSession[],
  opts: { companyName?: string; generatedAt?: string } = {},
): ObservationReport {
  const metrics = computeObservationMetrics(sessions);
  const window = evaluateWindow(sessions, metrics);
  const exitCriteria = evaluateExitCriteria(metrics);
  const rollbackSignals = evaluateRollbackSignals(metrics);

  const windowComplete = window.every(w => w.met);
  const exitCriteriaPassed = exitCriteria.every(c => c.passed);
  const rollbackRequired = rollbackSignals.some(s => s.fired);

  const starts = sessions.map(s => s.startedAt).sort();
  const verdict: ObservationVerdict = rollbackRequired
    ? "rollback"
    : windowComplete && exitCriteriaPassed
      ? "stable"
      : "window_open";

  const firstFired = rollbackSignals.find(s => s.fired) ?? null;

  const statement =
    verdict === "stable"
      ? OBSERVATION_STABLE_STATEMENT
      : verdict === "rollback"
        ? `Rollback requerido: ${firstFired?.label ?? "criterio de rollback"} (${firstFired?.detail ?? "n/d"}). Legacy vuelve a gobernar QA Testing.`
        : `Ventana abierta: faltan ${window.filter(w => !w.met).map(w => w.label.toLowerCase()).join(", ") || "criterios de salida"}. No se cierra por tiempo transcurrido.`;

  return {
    companyId: QA_TESTING_COMPANY_ID,
    companyName: opts.companyName ?? "QA Testing",
    windowStart: starts[0] ?? "",
    windowEnd: starts[starts.length - 1] ?? "",
    sessions: sessions.length,
    metrics,
    window,
    windowComplete,
    exitCriteria,
    exitCriteriaPassed,
    rollbackSignals,
    rollbackRequired,
    rollback: rollbackRequired ? rollbackEccPilot(QA_TESTING_COMPANY_ID, firstFired!.trigger) : null,
    verdict,
    statement,
    otherCompaniesTouched: 0,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
  };
}
