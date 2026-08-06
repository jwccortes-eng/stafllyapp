/**
 * ECC — Fase 4D. GRADUACIÓN DEL PILOTO Y CONTRATO DE ADOPCIÓN.
 *
 * Modelo PURO: no escribe en base de datos, no toca `company_modules`,
 * `plan_code`, `subscriptions`, payroll, billing, Stripe ni RLS. Sólo decide,
 * explica y audita el paso de `ecc_pilot` a `ecc_stable` para UNA compañía.
 *
 * Invariantes duros:
 *  - Sólo `QA_TESTING_COMPANY_ID` puede estar en `ecc_stable`.
 *  - No hay bandera global: la graduación es por `company_id` y fail-closed.
 *  - La transición exige `expected_version` + aprobación humana con permiso.
 *  - Legacy no se retira: sigue calculándose en sombra y sigue siendo fallback.
 *  - Cualquier mismatch en `ecc_stable` es un incidente, nunca un silencio.
 *  - El rollback sigue disponible e idempotente.
 */
import {
  QA_TESTING_COMPANY_ID,
  PILOT_FLAG_KEY,
  PILOT_MODE_LABEL,
  getPilotFlag,
  type PilotFlag,
  type PilotMode,
} from "./pilot";
import {
  ECC_PILOT_APPROVAL,
  LATENCY_THRESHOLD_MS,
  PILOT_REGISTRY_LIVE,
  rollbackEccPilot,
  type AccessDecisionRecord,
  type EccPilotRollback,
  type EccPilotRunResult,
  type LiveAlert,
  type RollbackTrigger,
} from "./pilot-live";
import type { ObservationReport } from "./pilot-observation";

/* ───────────────────── 1. Aprobación y permisos ───────────────────── */

/** Roles autorizados a graduar una compañía. Cualquier otro queda bloqueado. */
export const GRADUATION_APPROVER_ROLES: ReadonlySet<string> = new Set(["global_owner", "owner"]);

export interface GraduationApproval {
  companyId: string;
  approvedBy: string;
  approverRole: string;
  approvedAt: string;
  reason: string;
}

/** Aprobación humana registrada para la graduación de QA Testing. */
export const ECC_GRADUATION_APPROVAL: GraduationApproval = Object.freeze({
  companyId: QA_TESTING_COMPANY_ID,
  approvedBy: "global_owner",
  approverRole: "global_owner",
  approvedAt: "2026-08-06T14:00:00.000Z",
  reason:
    "Fases 4B y 4C cerradas sin mismatches, alertas ni rollbacks: QA Testing gradúa a ECC estable con Legacy en sombra.",
});

/* ───────────────────── 2. Registro en modo estable ───────────────────── */

export const ECC_STABLE_NOTE =
  "Fase 4D: ECC gobierna de forma estable para QA Testing. Legacy sigue calculándose en sombra como comparación y fallback temporal.";

export const PILOT_REGISTRY_STABLE: readonly PilotFlag[] = Object.freeze([
  Object.freeze({
    ...PILOT_REGISTRY_LIVE[0],
    enabled: true,
    mode: "ecc_stable" as PilotMode,
    approvedBy: ECC_GRADUATION_APPROVAL.approvedBy,
    note: ECC_STABLE_NOTE,
  }),
]);

/* ───────────────────── 3. Criterios de graduación ───────────────────── */

export interface GraduationCheck {
  key: string;
  label: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface GraduationEvidence {
  /** Corrida de Fase 4B (piloto real). */
  phase4b: EccPilotRunResult;
  /** Reporte de Fase 4C (ventana de observación). */
  phase4c: ObservationReport;
}

/** Revalidación completa de 4B + 4C. Ningún criterio se asume: se recalcula. */
export function evaluateGraduationChecks(ev: GraduationEvidence): GraduationCheck[] {
  const { phase4b: b, phase4c: c } = ev;
  const m = c.metrics;
  const check = (key: string, label: string, expected: string, observed: string, passed: boolean): GraduationCheck => ({
    key,
    label,
    expected,
    observed,
    passed,
  });

  return [
    check("phase_4b", "Reporte Fase 4B válido", "criterios aprobados", b.criteriaPassed ? "aprobados" : "con blockers", b.criteriaPassed),
    check("phase_4b_governs", "ECC gobernó en el piloto", "sí", b.eccGoverns ? "sí" : "no", b.eccGoverns),
    check("phase_4c", "Reporte Fase 4C estable", "stable", c.verdict, c.verdict === "stable"),
    check("window", "Ventana de observación completa", "completa", c.windowComplete ? "completa" : "abierta", c.windowComplete),
    check("mismatches", "Mismatches legacy vs ECC", "0", String(m.mismatches + b.mismatches.length), m.mismatches === 0 && b.mismatches.length === 0),
    check("alerts", "Alertas del piloto", "0", String(b.alerts.length + m.unexpectedAllow + m.unexpectedDeny + m.unresolvedCapability), b.alerts.length === 0 && m.unexpectedAllow === 0 && m.unexpectedDeny === 0 && m.unresolvedCapability === 0),
    check(
      "confidence",
      "Confianza HIGH en decisiones críticas",
      `${m.criticalDecisions}/${m.criticalDecisions}`,
      `${m.criticalHighConfidence}/${m.criticalDecisions}`,
      m.criticalDecisions > 0 && m.criticalHighConfidence === m.criticalDecisions,
    ),
    check("cross_tenant", "Resoluciones cross-tenant", "0", String(m.crossTenantResolutions), m.crossTenantResolutions === 0),
    check("rollback", "Rollbacks disparados", "0", String(m.rollbacks + (b.autoRollback ? 1 : 0)), m.rollbacks === 0 && b.autoRollback === null),
    check(
      "latency",
      `Latencia p95 bajo umbral (${LATENCY_THRESHOLD_MS}ms)`,
      `≤ ${LATENCY_THRESHOLD_MS}ms`,
      `p50 ${m.latencyP50}ms · p95 ${m.latencyP95}ms`,
      m.latencyP95 <= LATENCY_THRESHOLD_MS,
    ),
    check("exit_criteria", "Criterios de salida 4C", "todos", c.exitCriteriaPassed ? "todos" : "incompletos", c.exitCriteriaPassed),
  ];
}

/* ───────────────────── 4. Transición canónica ───────────────────── */

export interface GraduationAudit {
  companyId: string;
  flagKey: typeof PILOT_FLAG_KEY;
  fromMode: PilotMode;
  toMode: PilotMode;
  expectedVersion: number | null;
  currentVersion: number | null;
  approvedBy: string;
  approverRole: string;
  reason: string;
  at: string;
  idempotent: boolean;
  otherCompaniesAffected: 0;
}

export interface GraduationResult {
  ok: boolean;
  /** `true` cuando la compañía ya estaba en `ecc_stable`: no-op explicado. */
  alreadyGraduated: boolean;
  companyId: string;
  mode: PilotMode;
  registry: readonly PilotFlag[];
  checks: GraduationCheck[];
  checksPassed: boolean;
  reason: string;
  audit: GraduationAudit | null;
  legacyRetired: false;
  rollbackAvailable: true;
}

export interface GraduateOptions {
  approverRole?: string;
  currentVersion?: number | null;
  registry?: readonly PilotFlag[];
  evidence?: GraduationEvidence;
  at?: string;
}

const deny = (
  companyId: string,
  registry: readonly PilotFlag[],
  checks: GraduationCheck[],
  reason: string,
): GraduationResult => ({
  ok: false,
  alreadyGraduated: false,
  companyId,
  mode: getPilotFlag(companyId, registry)?.mode ?? "legacy_only",
  registry,
  checks,
  checksPassed: checks.length > 0 && checks.every(c => c.passed),
  reason,
  audit: null,
  legacyRetired: false,
  rollbackAvailable: true,
});

/**
 * Transición canónica e idempotente `ecc_pilot → ecc_stable`.
 * No es un update directo: valida compañía, permiso, versión y evidencia.
 */
export function graduateEccPilot(
  companyId: string,
  expectedVersion: number | null,
  approvedBy: string,
  reason: string,
  opts: GraduateOptions = {},
): GraduationResult {
  const registry = opts.registry ?? PILOT_REGISTRY_LIVE;
  const at = opts.at ?? ECC_GRADUATION_APPROVAL.approvedAt;
  const approverRole = opts.approverRole ?? "";
  const currentVersion = opts.currentVersion ?? expectedVersion;
  const checks = opts.evidence ? evaluateGraduationChecks(opts.evidence) : [];

  // Fail-closed: company_id obligatorio y explícito.
  if (!companyId) return deny(companyId, registry, checks, "company_id obligatorio: no se gradúa sin tenant explícito.");
  if (companyId !== QA_TESTING_COMPANY_ID) {
    return deny(companyId, registry, checks, "Sólo QA Testing puede graduar a ecc_stable. Ninguna otra compañía cambia de modo.");
  }

  const flag = getPilotFlag(companyId, registry);
  if (!flag) return deny(companyId, registry, checks, "Compañía desconocida en el registro ECC: fail-closed a legacy.");

  // Idempotencia: repetir la graduación no produce un segundo cambio.
  if (flag.mode === "ecc_stable" && flag.enabled) {
    return {
      ok: true,
      alreadyGraduated: true,
      companyId,
      mode: "ecc_stable",
      registry,
      checks,
      checksPassed: checks.length === 0 || checks.every(c => c.passed),
      reason: "QA Testing ya opera en ecc_stable: transición idempotente (no-op registrado).",
      audit: {
        companyId,
        flagKey: PILOT_FLAG_KEY,
        fromMode: "ecc_stable",
        toMode: "ecc_stable",
        expectedVersion,
        currentVersion,
        approvedBy,
        approverRole,
        reason,
        at,
        idempotent: true,
        otherCompaniesAffected: 0,
      },
      legacyRetired: false,
      rollbackAvailable: true,
    };
  }

  if (flag.mode !== "ecc_pilot" || !flag.enabled) {
    return deny(companyId, registry, checks, `No se puede graduar desde ${PILOT_MODE_LABEL[flag.mode]}: la graduación sólo procede desde un piloto activo.`);
  }
  if (!approvedBy || !GRADUATION_APPROVER_ROLES.has(approverRole)) {
    return deny(companyId, registry, checks, "Aprobación humana inválida: se requiere un rol autorizado (global_owner u owner).");
  }
  if (!reason.trim()) return deny(companyId, registry, checks, "Se requiere un motivo explícito para auditar la graduación.");
  if (expectedVersion !== currentVersion) {
    return deny(companyId, registry, checks, `Version drift: expected ${expectedVersion ?? "n/d"} vs actual ${currentVersion ?? "n/d"}. No se gradúa.`);
  }
  if (checks.length === 0) return deny(companyId, registry, checks, "Falta evidencia de Fases 4B y 4C: no se gradúa sin observación aprobada.");
  const failed = checks.filter(c => !c.passed);
  if (failed.length > 0) {
    return deny(companyId, registry, checks, `Criterios de observación no aprobados: ${failed.map(f => f.label).join(", ")}.`);
  }

  return {
    ok: true,
    alreadyGraduated: false,
    companyId,
    mode: "ecc_stable",
    registry: PILOT_REGISTRY_STABLE,
    checks,
    checksPassed: true,
    reason: "QA Testing graduada a ECC estable. Legacy permanece en sombra como comparación y fallback temporal.",
    audit: {
      companyId,
      flagKey: PILOT_FLAG_KEY,
      fromMode: "ecc_pilot",
      toMode: "ecc_stable",
      expectedVersion,
      currentVersion,
      approvedBy,
      approverRole,
      reason,
      at,
      idempotent: true,
      otherCompaniesAffected: 0,
    },
    legacyRetired: false,
    rollbackAvailable: true,
  };
}

/** Rollback desde estable: misma acción canónica, sin borrar observabilidad. */
export function rollbackEccStable(companyId: string, trigger: RollbackTrigger = "manual"): EccPilotRollback {
  return rollbackEccPilot(companyId, trigger, "ecc_stable");
}

/* ───────────────────── 5. Protección de flota ───────────────────── */

export interface FleetProtection {
  stableCompanies: string[];
  legacyOnlyCompanies: string[];
  globalFlagExists: false;
  companyIdRequired: true;
  failClosedOnUnknownCompany: true;
  tenantSwitchInheritsMode: false;
  containment: boolean;
  detail: string;
}

/**
 * Confirma que sólo QA Testing puede estar en `ecc_stable` y que el resto de la
 * flota resuelve `legacy_only`. No existe bandera global que active ECC.
 */
export function assertFleetContainment(
  allCompanyIds: readonly string[],
  registry: readonly PilotFlag[] = PILOT_REGISTRY_STABLE,
): FleetProtection {
  const stable = registry.filter(f => f.enabled && f.mode === "ecc_stable").map(f => f.companyId);
  const legacyOnly = allCompanyIds.filter(id => !stable.includes(id));
  const containment = stable.length === 1 && stable[0] === QA_TESTING_COMPANY_ID;
  return {
    stableCompanies: stable,
    legacyOnlyCompanies: legacyOnly,
    globalFlagExists: false,
    companyIdRequired: true,
    failClosedOnUnknownCompany: true,
    tenantSwitchInheritsMode: false,
    containment,
    detail: containment
      ? `Sólo QA Testing en ecc_stable; ${legacyOnly.length} compañías permanecen legacy_only.`
      : "Contención rota: hay compañías fuera de QA Testing en modo ECC.",
  };
}

/** Modo efectivo tras un cambio de tenant. Nunca hereda el modo anterior. */
export function resolveModeAfterTenantSwitch(
  nextCompanyId: string | null | undefined,
  registry: readonly PilotFlag[] = PILOT_REGISTRY_STABLE,
): PilotMode {
  if (!nextCompanyId) return "legacy_only";
  const flag = getPilotFlag(nextCompanyId, registry);
  if (!flag || !flag.enabled) return "legacy_only";
  return flag.mode;
}

/* ───────────────────── 6. Incidentes ECC ───────────────────── */

export type EccIncidentCode =
  | "unexpected_allow"
  | "unexpected_deny"
  | "cross_tenant"
  | "low_confidence"
  | "resolver_error"
  | "version_drift"
  | "dependency_missing"
  | "limit_mismatch"
  | "legacy_mismatch";

export type IncidentSeverity = "critica" | "alta" | "media";

export interface IncidentPolicy {
  code: EccIncidentCode;
  label: string;
  severity: IncidentSeverity;
  automaticAction: string;
  rollback: boolean;
  owner: string;
}

export const INCIDENT_POLICY: Readonly<Record<EccIncidentCode, IncidentPolicy>> = Object.freeze({
  unexpected_allow: { code: "unexpected_allow", label: "Permiso inesperado", severity: "critica", automaticAction: "Congelar decisión ECC y restaurar legacy", rollback: true, owner: "ecc-core" },
  unexpected_deny: { code: "unexpected_deny", label: "Denegación inesperada", severity: "critica", automaticAction: "Restaurar legacy de inmediato", rollback: true, owner: "ecc-core" },
  cross_tenant: { code: "cross_tenant", label: "Resolución cross-tenant", severity: "critica", automaticAction: "Rollback y bloqueo del resolver para el tenant", rollback: true, owner: "ecc-core" },
  low_confidence: { code: "low_confidence", label: "Confianza baja persistente", severity: "alta", automaticAction: "Gobierna legacy y se registra el motivo", rollback: true, owner: "ecc-core" },
  resolver_error: { code: "resolver_error", label: "Error del resolver", severity: "critica", automaticAction: "Fallback explicado a legacy y alerta", rollback: true, owner: "plataforma" },
  version_drift: { code: "version_drift", label: "Deriva de versión", severity: "alta", automaticAction: "Bloquear transición y reconciliar versión", rollback: true, owner: "ecc-core" },
  dependency_missing: { code: "dependency_missing", label: "Dependencia faltante", severity: "alta", automaticAction: "Denegar resolución ECC y usar legacy", rollback: true, owner: "ecc-core" },
  limit_mismatch: { code: "limit_mismatch", label: "Diferencia de límite", severity: "media", automaticAction: "Registrar y revisar plan version", rollback: false, owner: "comercial" },
  legacy_mismatch: { code: "legacy_mismatch", label: "Mismatch legacy vs ECC", severity: "alta", automaticAction: "Registrar incidente; sin fallback silencioso", rollback: false, owner: "ecc-core" },
});

export interface EccIncident {
  code: EccIncidentCode;
  severity: IncidentSeverity;
  companyId: string;
  capability: string | null;
  surface: string;
  actor: string;
  correlationId: string;
  eccDecision: boolean | null;
  legacyDecision: boolean | null;
  automaticAction: string;
  rollback: boolean;
  owner: string;
  detail: string;
  at: string;
}

const ALERT_TO_INCIDENT: Partial<Record<LiveAlert["code"], EccIncidentCode>> = {
  unexpected_allow: "unexpected_allow",
  unexpected_deny: "unexpected_deny",
  cross_tenant_resolution: "cross_tenant",
  low_confidence: "low_confidence",
  version_drift: "version_drift",
  dependency_mismatch: "dependency_missing",
  limit_mismatch: "limit_mismatch",
  unresolved_capability: "dependency_missing",
};

const incidentFrom = (
  code: EccIncidentCode,
  d: Pick<AccessDecisionRecord, "companyId" | "capability" | "surface" | "userId" | "correlationId" | "eccDecision" | "legacyDecision">,
  detail: string,
  at: string,
): EccIncident => {
  const p = INCIDENT_POLICY[code];
  return {
    code,
    severity: p.severity,
    companyId: d.companyId,
    capability: d.capability,
    surface: d.surface,
    actor: d.userId,
    correlationId: d.correlationId,
    eccDecision: d.eccDecision,
    legacyDecision: d.legacyDecision,
    automaticAction: p.automaticAction,
    rollback: p.rollback,
    owner: p.owner,
    detail,
    at,
  };
};

/**
 * En `ecc_stable` cada divergencia se convierte en incidente explícito.
 * Nunca hay fallback silencioso: si legacy gobierna, queda registrado.
 */
export function collectIncidents(run: EccPilotRunResult, at: string = run.generatedAt): EccIncident[] {
  const incidents: EccIncident[] = [];

  for (const d of run.decisions) {
    if (d.companyId !== QA_TESTING_COMPANY_ID) {
      incidents.push(incidentFrom("cross_tenant", d, "Decisión resuelta fuera del tenant graduado.", at));
    }
    if (d.legacyDecision !== d.eccDecision) {
      incidents.push(incidentFrom("legacy_mismatch", d, `legacy=${d.legacyDecision} vs ecc=${d.eccDecision}.`, at));
    }
    if (d.confidence === "LOW") {
      incidents.push(incidentFrom("low_confidence", d, d.confidenceReason, at));
    }
    if (d.fallback) {
      incidents.push(incidentFrom("resolver_error", d, d.fallbackReason ?? "Fallback a legacy registrado.", at));
    }
  }

  const bySurface = new Map(run.decisions.map(d => [d.surface, d]));
  for (const a of run.alerts) {
    const code = ALERT_TO_INCIDENT[a.code];
    if (!code) continue;
    const d = bySurface.get(a.subject) ?? run.decisions[0] ?? null;
    incidents.push(
      incidentFrom(
        code,
        {
          companyId: a.companyId,
          capability: d?.capability ?? null,
          surface: a.subject,
          userId: d?.userId ?? "desconocido",
          correlationId: d?.correlationId ?? `ecc4d:${a.code}:${a.subject}`,
          eccDecision: d?.eccDecision ?? null,
          legacyDecision: d?.legacyDecision ?? null,
        },
        a.detail,
        at,
      ),
    );
  }

  return incidents;
}

/** Un incidente con política de rollback obliga a revertir la graduación. */
export const incidentRequiresRollback = (incidents: readonly EccIncident[]): boolean =>
  incidents.some(i => i.rollback);

/* ───────────────────── 7. Contrato de adopción futura ───────────────────── */

export interface AdoptionPhase {
  order: number;
  key: string;
  label: string;
  evidence: string;
  skippable: false;
}

export const ADOPTION_CONTRACT: readonly AdoptionPhase[] = Object.freeze([
  { order: 1, key: "readiness", label: "Readiness READY o CONDITIONAL sin blocker", evidence: "Reconciliación por compañía sin blockers.", skippable: false },
  { order: 2, key: "critical_capabilities", label: "Capabilities críticas 100 % representadas", evidence: "Matriz crítica en match, 0 mappings faltantes.", skippable: false },
  { order: 3, key: "limits", label: "Límites explicados", evidence: "Uso vs límite del plan version, sin excesos sin explicación.", skippable: false },
  { order: 4, key: "overrides", label: "Overrides conocidos", evidence: "Cada override clasificado; ninguno 'desconocido'.", skippable: false },
  { order: 5, key: "no_contradictions", label: "Sin contradicciones de acceso", evidence: "Estado comercial, acceso y módulos coherentes.", skippable: false },
  { order: 6, key: "payroll_evaluated", label: "Payroll evaluado", evidence: "Impacto sobre periodos y nómina revisado y descartado.", skippable: false },
  { order: 7, key: "rollback_tested", label: "Rollback probado", evidence: "Rollback ejecutado en simulación con auditoría preservada.", skippable: false },
  { order: 8, key: "human_approval", label: "Aprobación humana", evidence: "Rol autorizado, motivo y expected_version.", skippable: false },
  { order: 9, key: "shadow_period", label: "Período en sombra", evidence: "ECC calculado en paralelo sin gobernar.", skippable: false },
  { order: 10, key: "pilot_observation", label: "Observación del piloto", evidence: "Ventana de actividad real completa (Fase 4C).", skippable: false },
  { order: 11, key: "graduation_criteria", label: "Criterios de graduación", evidence: "Checks 4D aprobados en su totalidad.", skippable: false },
]);

export type AdoptionState = Partial<Record<string, boolean>>;

export interface AdoptionEvaluation {
  companyId: string;
  phases: Array<AdoptionPhase & { met: boolean }>;
  blockedAt: AdoptionPhase | null;
  eligible: boolean;
  detail: string;
}

/**
 * Evalúa el contrato en orden estricto: no se puede saltar una fase.
 * La primera fase incumplida bloquea todas las siguientes.
 */
export function evaluateAdoptionContract(companyId: string, state: AdoptionState): AdoptionEvaluation {
  let blockedAt: AdoptionPhase | null = null;
  const phases = ADOPTION_CONTRACT.map(p => {
    const met = state[p.key] === true;
    if (!met && !blockedAt) blockedAt = p;
    return { ...p, met: met && !blockedAt };
  });
  const eligible = !blockedAt && !!companyId;
  return {
    companyId,
    phases,
    blockedAt,
    eligible,
    detail: eligible
      ? "Contrato de adopción completo: la compañía puede iniciar el ciclo shadow → piloto → graduación."
      : `Bloqueada en la fase ${(blockedAt as AdoptionPhase | null)?.order ?? "?"}: ${(blockedAt as AdoptionPhase | null)?.label ?? "company_id ausente"}.`,
  };
}

/* ───────────────────── 8. Retiro futuro de Legacy (diseño) ───────────────────── */

export interface LegacyRetirementStep {
  source: string;
  role: string;
  removalRisk: string;
  proofRequired: string;
}

export interface LegacyRetirementPlan {
  companyId: string;
  executed: false;
  steps: readonly LegacyRetirementStep[];
  preconditions: readonly string[];
  rollbackWindowDays: number;
  statement: string;
}

export const LEGACY_RETIREMENT_ROLLBACK_WINDOW_DAYS = 30;

/** Diseño, no ejecución: nada se retira en esta fase. */
export function buildLegacyRetirementPlan(companyId: string = QA_TESTING_COMPANY_ID): LegacyRetirementPlan {
  return {
    companyId,
    executed: false,
    rollbackWindowDays: LEGACY_RETIREMENT_ROLLBACK_WINDOW_DAYS,
    steps: Object.freeze([
      { source: "useSubscription", role: "Deriva plan efectivo y límites en el cliente.", removalRisk: "Pantallas sin plan mientras ECC no exponga límites vivos.", proofRequired: "ECC entrega plan version, límites y estado con la misma forma consumida hoy." },
      { source: "ModuleGate", role: "Gate visual de módulos por plan/company_modules.", removalRisk: "Fugas de UI o bloqueos indebidos si ECC no cubre todas las superficies.", proofRequired: "100 % de superficies mapeadas y 0 mismatches sostenidos durante la ventana." },
      { source: "plan_code", role: "Fuente legacy del tier comercial.", removalRisk: "Pérdida de trazabilidad histórica de facturación manual.", proofRequired: "Plan versions inmutables cubren todo el histórico consultado." },
      { source: "company_modules", role: "Override manual por compañía.", removalRisk: "Overrides operativos no representados en entitlements.", proofRequired: "Todo override clasificado y representado como entitlement explícito." },
      { source: "fallback legacy", role: "Red de seguridad ante ECC no concluyente.", removalRisk: "Denegaciones duras sin alternativa.", proofRequired: "0 fallbacks durante toda la ventana estable." },
      { source: "observabilidad dual", role: "Comparación legacy vs ECC.", removalRisk: "Ceguera ante regresiones.", proofRequired: "Observabilidad ECC autónoma con incidentes y alertas equivalentes." },
      { source: "rollback window", role: "Ventana para revertir la graduación.", removalRisk: "Sin retorno seguro.", proofRequired: `${LEGACY_RETIREMENT_ROLLBACK_WINDOW_DAYS} días en ecc_stable sin incidentes con política de rollback.` },
    ]),
    preconditions: Object.freeze([
      "Ventana estable sostenida sin incidentes críticos ni rollbacks.",
      "0 mismatches acumulados entre legacy y ECC.",
      "ECC expone límites, plan version y overrides sin depender de company_modules.",
      "Aprobación humana específica para el retiro, con expected_version.",
      "Plan de reversión documentado y probado antes de retirar la primera fuente.",
    ]),
    statement: "Diseño de retiro de Legacy documentado. No se retira ninguna fuente en la Fase 4D.",
  };
}

/* ───────────────────── 9. Declaración final ───────────────────── */

export const GRADUATION_STATEMENT =
  "QA Testing opera de forma estable bajo ECC, con Legacy en comparación temporal, rollback inmediato y cero cambios sobre las demás compañías.";
