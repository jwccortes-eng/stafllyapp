/**
 * ECC — Fase 4B. PILOTO REAL CONTROLADO (sólo QA Testing).
 *
 * Modelo PURO: no escribe, no toca `company_modules`, `plan_code`,
 * `subscriptions`, payroll, billing ni RLS. Resuelve el acceso ECC en paralelo
 * al legacy, lo compara, lo puntúa con un confidence explicable y decide cuál
 * gobierna. Cualquier compañía fuera del registro resuelve `legacy_only`.
 *
 * Invariantes duros:
 *  - El default global es `legacy_only`.
 *  - Sólo `QA_TESTING_COMPANY_ID` puede entrar en `ecc_pilot`.
 *  - Confidence LOW nunca gobierna: se registra el fallback y su motivo.
 *  - El gate legacy nunca se remueve: el rollback es apagar la bandera.
 */
import type { EccReadModelInput } from "./commercial-read-model";
import { reconcileCompany, type CompanyReconciliation } from "./reconciliation";
import { LIMIT_KEYS } from "./plan-versions";
import {
  EMPTY_USAGE,
  PILOT_FLAG_KEY,
  PILOT_SURFACES,
  QA_TESTING_COMPANY_ID,
  buildPilotPrecheck,
  evaluatePilotCriteria,
  getPilotFlag,
  resolveDual,
  simulateRollback,
  type GoverningSource,
  type PilotAlertCode,
  type PilotCriterion,
  type PilotFlag,
  type PilotMode,
  type PilotPrecheck,
  type PilotRollbackResult,
  type PilotSurface,
  type PilotUsageInput,
  ECC_GOVERNING_MODES,
  type SurfaceDevice,
} from "./pilot";

/* ───────────────────── 1. Aprobación humana y bandera ───────────────────── */

export interface PilotApproval {
  companyId: string;
  approvedBy: string;
  approvedAt: string;
  note: string;
}

/** Aprobación explícita de propietario global registrada para la Fase 4B. */
export const ECC_PILOT_APPROVAL: PilotApproval = Object.freeze({
  companyId: QA_TESTING_COMPANY_ID,
  approvedBy: "global_owner",
  approvedAt: "2026-08-06T05:00:00.000Z",
  note: "Fase 4B: ECC gobierna el acceso sólo para QA Testing. Legacy sigue calculándose en paralelo.",
});

/** Registro vivo del piloto. Una sola compañía, activada por company_id exacto. */
export const PILOT_REGISTRY_LIVE: readonly PilotFlag[] = Object.freeze([
  Object.freeze({
    companyId: QA_TESTING_COMPANY_ID,
    companyName: "QA Testing",
    flagKey: PILOT_FLAG_KEY,
    enabled: true,
    mode: "ecc_pilot" as PilotMode,
    approvedBy: ECC_PILOT_APPROVAL.approvedBy,
    note: ECC_PILOT_APPROVAL.note,
  }),
]);

/** Registro tras un rollback: la bandera queda apagada y el modo `rolled_back`. */
export const PILOT_REGISTRY_ROLLED_BACK: readonly PilotFlag[] = Object.freeze([
  Object.freeze({
    ...PILOT_REGISTRY_LIVE[0],
    enabled: false,
    mode: "rolled_back" as PilotMode,
    note: "Rollback ejecutado: legacy gobierna de nuevo; ECC permanece en sombra.",
  }),
]);

/**
 * Activación: sólo produce un registro vivo si la aprobación humana corresponde
 * a QA Testing y la versión esperada sigue vigente. Idempotente y explicable.
 */
export function activateEccPilot(
  approval: PilotApproval,
  expectedVersion: number | null,
  currentVersion: number | null,
): { ok: boolean; registry: readonly PilotFlag[]; reason: string } {
  if (approval.companyId !== QA_TESTING_COMPANY_ID) {
    return { ok: false, registry: PILOT_REGISTRY_ROLLED_BACK, reason: "Sólo QA Testing puede entrar al piloto (company_id exacto)." };
  }
  if (!approval.approvedBy) {
    return { ok: false, registry: PILOT_REGISTRY_ROLLED_BACK, reason: "Falta aprobación humana explícita." };
  }
  if (expectedVersion !== currentVersion) {
    return {
      ok: false,
      registry: PILOT_REGISTRY_ROLLED_BACK,
      reason: `Version drift: precheck ${expectedVersion}, actual ${currentVersion}. No se activa el piloto.`,
    };
  }
  return { ok: true, registry: PILOT_REGISTRY_LIVE, reason: "Piloto ECC activo para QA Testing." };
}

/* ───────────────────── 2. Confidence explicable ───────────────────── */

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceSignals {
  mappingComplete: boolean;
  planVersionKnown: boolean;
  dependenciesResolved: boolean;
  noContradictions: boolean;
  legacyMatch: boolean;
  overrideKnown: boolean;
  sourceTrusted: boolean;
}

export interface ConfidenceScore {
  level: ConfidenceLevel;
  signals: ConfidenceSignals;
  failed: string[];
  reason: string;
}

const SIGNAL_LABEL: Record<keyof ConfidenceSignals, string> = {
  mappingComplete: "mapping canónico completo",
  planVersionKnown: "versión de plan conocida",
  dependenciesResolved: "dependencias resueltas",
  noContradictions: "sin contradicciones de acceso",
  legacyMatch: "coincide con legacy",
  overrideKnown: "overrides conocidos",
  sourceTrusted: "fuente confiable",
};

/**
 * El nivel no es un porcentaje arbitrario: se deriva de señales explícitas.
 *  - LOW: mapping faltante, dependencia faltante, fuente desconocida, drift o
 *    diferencia con legacy sin override que la explique.
 *  - MEDIUM: resolución válida explicada por un override conocido.
 *  - HIGH: resolución completa, sin contradicciones y con legacy match.
 */
export function scoreConfidence(signals: ConfidenceSignals): ConfidenceScore {
  const failed = (Object.keys(signals) as Array<keyof ConfidenceSignals>)
    .filter(k => !signals[k])
    .map(k => SIGNAL_LABEL[k]);

  const hardFailure =
    !signals.mappingComplete || !signals.dependenciesResolved || !signals.planVersionKnown || !signals.sourceTrusted;
  const unexplainedMismatch = !signals.legacyMatch && !signals.overrideKnown;

  if (hardFailure || unexplainedMismatch) {
    return { level: "LOW", signals, failed, reason: `Confianza baja: ${failed.join(", ")}.` };
  }
  if (!signals.legacyMatch || !signals.noContradictions) {
    return { level: "MEDIUM", signals, failed, reason: "Resolución válida con diferencia explicada por override conocido." };
  }
  return { level: "HIGH", signals, failed: [], reason: "Resolución completa, sin contradicciones y con legacy match." };
}

/* ───────────────────── 3. Superficies del piloto ───────────────────── */

const extraSurface = (
  id: string,
  label: string,
  alias: string,
  route: string,
  device: SurfaceDevice,
  gate: string,
): PilotSurface => ({ id, label, alias, route, device, gate });

/** Superficies de Fase 4A + las exigidas por 4B. Sin flujos de pago. */
export const LIVE_PILOT_SURFACES: readonly PilotSurface[] = Object.freeze([
  extraSurface("home", "Home", "stafly.team_hub", "/app", "ambos", "ModuleGate(command_center)"),
  ...PILOT_SURFACES,
  extraSurface("invitations", "Invitaciones", "shared.invitations", "/app/employees?invite=1", "ambos", "ModuleGate(invite)"),
  extraSurface("settings", "Configuración", "shared.identity", "/app/settings", "ambos", "código + RLS"),
  extraSurface("command_center", "Command Center", "stafly.team_hub", "/app/command-center", "desktop", "ModuleGate(command_center)"),
  extraSurface("nav_mobile", "Navegación mobile", "stafly.services", "/app", "mobile", "ModuleGate(shifts)"),
  extraSurface("nav_desktop", "Navegación desktop", "stafly.services", "/app", "desktop", "ModuleGate(shifts)"),
]);

/* ───────────────────── 4. Decisión observable ───────────────────── */

export type LiveAlertCode = PilotAlertCode | "version_drift" | "low_confidence" | "rollback_triggered";

export const LIVE_ALERT_LABEL: Record<LiveAlertCode, string> = {
  unexpected_deny: "Denegación inesperada",
  unexpected_allow: "Permiso inesperado",
  dependency_mismatch: "Dependencia no satisfecha",
  limit_mismatch: "Diferencia de límite",
  cross_tenant_resolution: "Resolución cross-tenant",
  unresolved_capability: "Capacidad sin resolver",
  version_drift: "Deriva de versión",
  low_confidence: "Confianza baja",
  rollback_triggered: "Rollback disparado",
};

export interface LiveAlert {
  code: LiveAlertCode;
  severity: "alta" | "media" | "baja";
  companyId: string;
  subject: string;
  detail: string;
}

/** Registro por decisión: todo lo que exige la observabilidad de Fase 4B. */
export interface AccessDecisionRecord {
  companyId: string;
  userId: string;
  surface: string;
  route: string;
  device: SurfaceDevice;
  capability: string | null;
  legacyDecision: boolean | null;
  eccDecision: boolean | null;
  effectiveDecision: boolean | null;
  governedBy: GoverningSource;
  source: string;
  confidence: ConfidenceLevel;
  confidenceReason: string;
  planVersion: string | null;
  override: string | null;
  contradiction: string | null;
  dependencyResult: "satisfecha" | "faltante";
  limitResult: "dentro" | "excedido" | "n/d";
  latencyMs: number;
  fallback: boolean;
  fallbackReason: string | null;
  timestamp: string;
  correlationId: string;
}

const fnv1a = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

/** Correlación determinista: misma ejecución ⇒ mismo id (reintento idempotente). */
export const correlationIdFor = (companyId: string, surface: string, at: string, run: string): string =>
  `ecc4b:${fnv1a(`${companyId}|${surface}|${at}|${run}`)}`;

/* ───────────────────── 5. Rollback canónico ───────────────────── */

export type RollbackTrigger =
  | "manual"
  | "critical_mismatch"
  | "cross_tenant"
  | "unexpected_deny"
  | "unexpected_allow"
  | "low_confidence"
  | "dependency_missing"
  | "resolver_error"
  | "latency_threshold"
  | "version_drift";

export interface EccPilotRollback extends PilotRollbackResult {
  trigger: RollbackTrigger;
  registry: readonly PilotFlag[];
  observabilityPreserved: boolean;
  approvedBy: string | null;
}

/**
 * Acción canónica de rollback. Idempotente, aislada por company_id y sin
 * borrar auditoría, observabilidad, plan versions ni entitlements.
 */
export function rollbackEccPilot(
  companyId: string,
  trigger: RollbackTrigger = "manual",
  from: PilotMode = "ecc_pilot",
): EccPilotRollback {
  const base = simulateRollback(companyId, from);
  const isPilot = companyId === QA_TESTING_COMPANY_ID;
  return {
    ...base,
    trigger,
    registry: isPilot ? PILOT_REGISTRY_ROLLED_BACK : PILOT_REGISTRY_LIVE,
    observabilityPreserved: true,
    approvedBy: trigger === "manual" ? ECC_PILOT_APPROVAL.approvedBy : null,
    detail: isPilot
      ? `${base.detail} Disparador: ${trigger}.`
      : "La compañía no está en el registro del piloto: ya gobernaba legacy. No-op.",
  };
}

/** Umbral de latencia por decisión antes de forzar fallback a legacy. */
export const LATENCY_THRESHOLD_MS = 250;

const AUTO_ROLLBACK_ALERTS: ReadonlySet<LiveAlertCode> = new Set<LiveAlertCode>([
  "unexpected_deny",
  "unexpected_allow",
  "cross_tenant_resolution",
  "unresolved_capability",
  "dependency_mismatch",
  "version_drift",
]);

/* ───────────────────── 6. Ejecución del piloto ───────────────────── */

export interface EccPilotRunOptions {
  usage?: PilotUsageInput;
  at?: string;
  userId?: string;
  companyVersion?: number | null;
  currentVersion?: number | null;
  registry?: readonly PilotFlag[];
  /** Latencia observada por decisión (inyectable en pruebas). */
  latencyMs?: number;
  runId?: string;
}

export interface EccPilotRunResult {
  companyId: string;
  companyName: string;
  mode: PilotMode;
  flagEnabled: boolean;
  approvedBy: string | null;
  activatedAt: string | null;
  precheck: PilotPrecheck;
  criteria: PilotCriterion[];
  criteriaPassed: boolean;
  decisions: AccessDecisionRecord[];
  mismatches: AccessDecisionRecord[];
  fallbacks: AccessDecisionRecord[];
  confidenceCounts: Record<ConfidenceLevel, number>;
  alerts: LiveAlert[];
  autoRollback: EccPilotRollback | null;
  eccGoverns: boolean;
  otherCompaniesTouched: 0;
  generatedAt: string;
}

/**
 * Resuelve el acceso de UNA compañía en paralelo (legacy + ECC) y determina la
 * decisión efectiva. Si la compañía no está en el registro, todo queda legacy.
 */
export function runEccPilot(input: EccReadModelInput, opts: EccPilotRunOptions = {}): EccPilotRunResult {
  const at = opts.at ?? input.generatedAt ?? new Date().toISOString();
  const userId = opts.userId ?? "global_owner";
  const usage = opts.usage ?? EMPTY_USAGE;
  const registry = opts.registry ?? PILOT_REGISTRY_LIVE;
  const latencyMs = opts.latencyMs ?? 12;
  const runId = opts.runId ?? "run-1";

  const rec: CompanyReconciliation = reconcileCompany(input, at);
  const flag = getPilotFlag(rec.companyId, registry);
  const enabled = flag?.enabled ?? false;
  const mode: PilotMode = !flag ? "legacy_only" : enabled ? flag.mode : flag.mode === "rolled_back" ? "rolled_back" : "compare";

  const pre = buildPilotPrecheck(rec, usage);
  const criteria = evaluatePilotCriteria(pre, rec);
  const criteriaPassed = criteria.every(c => c.passed);

  const versionDrift = opts.currentVersion !== undefined && opts.currentVersion !== (opts.companyVersion ?? null);
  const overLimit = rec.limits.some(l => l.overLimitRisk);
  const overrideByKey = new Map(rec.overrides.map(o => [o.key, o]));
  const byAlias = new Map(rec.criticalMatrix.map(m => [m.alias, m]));

  const alerts: LiveAlert[] = [];
  const decisions: AccessDecisionRecord[] = [];
  const confidenceCounts: Record<ConfidenceLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };

  if (versionDrift) {
    alerts.push({
      code: "version_drift",
      severity: "alta",
      companyId: rec.companyId,
      subject: "companies.version",
      detail: `Precheck ${opts.companyVersion ?? "n/d"} vs actual ${opts.currentVersion ?? "n/d"}.`,
    });
  }

  for (const s of LIVE_PILOT_SURFACES) {
    const m = byAlias.get(s.alias) ?? null;
    const legacy = m?.legacy ?? null;
    const ecc = m?.ecc ?? null;
    const override = m?.canonical ? (overrideByKey.get(m.canonical)?.classification ?? null) : null;
    const missingDeps = m?.missingDependencies ?? [];

    const confidence = scoreConfidence({
      mappingComplete: !!m?.canonical,
      planVersionKnown: !!rec.planVersionId,
      dependenciesResolved: missingDeps.length === 0,
      noContradictions: rec.contradictions.length === 0,
      legacyMatch: legacy === ecc,
      overrideKnown: override !== "desconocido",
      sourceTrusted: !!m && m.legacyGovernance !== "none" && !versionDrift,
    });
    confidenceCounts[confidence.level] += 1;

    const slow = latencyMs > LATENCY_THRESHOLD_MS;
    const forceLegacy = confidence.level === "LOW" || slow || versionDrift;
    const dual = resolveDual(mode, enabled && !forceLegacy, legacy, ecc);
    const fallback = dual.fallbackUsed || (enabled && ECC_GOVERNING_MODES.has(mode) && forceLegacy);
    const fallbackReason = !fallback
      ? null
      : versionDrift
        ? "Deriva de versión: gobierna legacy hasta reconciliar."
        : slow
          ? `Latencia ${latencyMs}ms sobre el umbral ${LATENCY_THRESHOLD_MS}ms.`
          : confidence.level === "LOW"
            ? confidence.reason
            : "ECC no concluyente: fallback controlado a legacy.";

    if (!m?.canonical) {
      alerts.push({ code: "unresolved_capability", severity: "alta", companyId: rec.companyId, subject: s.alias, detail: `${s.label} sin capability canónica.` });
    }
    if (legacy === true && ecc === false) {
      alerts.push({ code: "unexpected_deny", severity: "alta", companyId: rec.companyId, subject: s.label, detail: "ECC retiraría acceso existente." });
    }
    if (legacy === false && ecc === true) {
      alerts.push({ code: "unexpected_allow", severity: "alta", companyId: rec.companyId, subject: s.label, detail: "ECC concedería acceso inexistente hoy." });
    }
    if (missingDeps.length > 0) {
      alerts.push({ code: "dependency_mismatch", severity: "alta", companyId: rec.companyId, subject: s.label, detail: `Dependencias faltantes: ${missingDeps.join(", ")}.` });
    }
    if (confidence.level === "LOW") {
      alerts.push({ code: "low_confidence", severity: "media", companyId: rec.companyId, subject: s.label, detail: confidence.reason });
    }

    decisions.push({
      companyId: rec.companyId,
      userId,
      surface: s.id,
      route: s.route,
      device: s.device,
      capability: m?.canonical ?? null,
      legacyDecision: legacy,
      eccDecision: ecc,
      effectiveDecision: dual.effective,
      governedBy: dual.governedBy,
      source: `${m?.legacyGovernance ?? s.gate} → ${m?.eccSource ?? "—"}`,
      confidence: confidence.level,
      confidenceReason: confidence.reason,
      planVersion: rec.planVersionId,
      override,
      contradiction: rec.contradictions[0] ?? null,
      dependencyResult: missingDeps.length === 0 ? "satisfecha" : "faltante",
      limitResult: overLimit ? "excedido" : "dentro",
      latencyMs,
      fallback,
      fallbackReason,
      timestamp: at,
      correlationId: correlationIdFor(rec.companyId, s.id, at, runId),
    });
  }

  for (const l of rec.limits) {
    if (l.status === "match" && !l.overLimitRisk) continue;
    const used = l.limitKey === LIMIT_KEYS.employees ? usage.employees : usage.users;
    alerts.push({
      code: "limit_mismatch",
      severity: l.overLimitRisk ? "alta" : "media",
      companyId: rec.companyId,
      subject: l.limitKey,
      detail: `legacy=${l.legacy ?? "n/d"} · ECC=${l.ecc} · uso=${used}.`,
    });
  }

  for (const d of decisions) {
    if (d.companyId !== rec.companyId) {
      alerts.push({ code: "cross_tenant_resolution", severity: "alta", companyId: d.companyId, subject: d.surface, detail: "Resolución fuera del company_id piloto." });
    }
  }

  const persistentLowConfidence = confidenceCounts.LOW > 0;
  const trigger: RollbackTrigger | null = alerts.some(a => AUTO_ROLLBACK_ALERTS.has(a.code))
    ? ((alerts.find(a => AUTO_ROLLBACK_ALERTS.has(a.code))!.code === "cross_tenant_resolution"
        ? "cross_tenant"
        : alerts.find(a => AUTO_ROLLBACK_ALERTS.has(a.code))!.code) as RollbackTrigger)
    : persistentLowConfidence
      ? "low_confidence"
      : latencyMs > LATENCY_THRESHOLD_MS
        ? "latency_threshold"
        : null;

  const autoRollback = enabled && ECC_GOVERNING_MODES.has(mode) && trigger ? rollbackEccPilot(rec.companyId, trigger) : null;
  if (autoRollback) {
    alerts.push({
      code: "rollback_triggered",
      severity: "alta",
      companyId: rec.companyId,
      subject: "ecc_access_pilot_enabled",
      detail: `Rollback automático por ${trigger}. Legacy restaurado.`,
    });
  }

  const eccGoverns = !autoRollback && decisions.some(d => d.governedBy === "ecc");

  return {
    companyId: rec.companyId,
    companyName: rec.companyName,
    mode,
    flagEnabled: enabled,
    approvedBy: flag?.approvedBy ?? null,
    activatedAt: enabled ? ECC_PILOT_APPROVAL.approvedAt : null,
    precheck: pre,
    criteria,
    criteriaPassed,
    decisions,
    mismatches: decisions.filter(d => d.legacyDecision !== d.eccDecision),
    fallbacks: decisions.filter(d => d.fallback),
    confidenceCounts,
    alerts,
    autoRollback,
    eccGoverns,
    otherCompaniesTouched: 0,
    generatedAt: at,
  };
}
