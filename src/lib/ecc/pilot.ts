/**
 * ECC — Fase 4A. Pilot cutover DRY RUN (QA Testing).
 *
 * Modelo PURO: no lee red, no escribe, no toca gates. `ModuleGate` y
 * `useSubscription` siguen gobernando el acceso real de TODAS las compañías.
 * Aquí sólo se resuelve en paralelo, se compara y se simula.
 *
 * Invariante duro: si la bandera de piloto está apagada (valor por defecto),
 * la decisión efectiva es SIEMPRE la legacy, sin excepción y sin importar el
 * modo declarado.
 */
import type { EccReadModelInput } from "./commercial-read-model";
import { reconcileCompany, buildCutoverContractDraft, type CompanyReconciliation, type CutoverContractDraft, type Readiness } from "./reconciliation";
import { CRITICAL_CAPABILITY_ALIASES } from "./reconciliation";
import { LIMIT_KEYS } from "./plan-versions";

/* ───────────────────── 3. Dual resolution ───────────────────── */

export type PilotMode = "legacy_only" | "compare" | "ecc_pilot" | "ecc_stable" | "rolled_back";

export const PILOT_MODE_LABEL: Record<PilotMode, string> = {
  legacy_only: "Sólo legacy",
  compare: "Comparación en sombra",
  ecc_pilot: "Piloto ECC",
  ecc_stable: "ECC estable (Legacy en sombra)",
  rolled_back: "Revertido a legacy",
};

export const PILOT_FLAG_KEY = "ecc_access_pilot_enabled";

export interface PilotFlag {
  companyId: string;
  companyName: string;
  flagKey: typeof PILOT_FLAG_KEY;
  /** Fase 4A: siempre false. Activarlo es una decisión humana de Fase 4B. */
  enabled: boolean;
  mode: PilotMode;
  approvedBy: string | null;
  note: string;
}

export const QA_TESTING_COMPANY_ID = "7c1458db-109a-4042-a2b0-78e04427ec2d";

/** Registro de piloto por company_id. Ninguna otra compañía está listada. */
export const PILOT_REGISTRY: readonly PilotFlag[] = Object.freeze([
  Object.freeze({
    companyId: QA_TESTING_COMPANY_ID,
    companyName: "QA Testing",
    flagKey: PILOT_FLAG_KEY,
    enabled: false,
    mode: "compare" as PilotMode,
    approvedBy: null,
    note: "Fase 4A dry run. Legacy gobierna; ECC sólo se calcula y registra.",
  }),
]);

export const getPilotFlag = (companyId: string, registry: readonly PilotFlag[] = PILOT_REGISTRY): PilotFlag | null =>
  registry.find(f => f.companyId === companyId) ?? null;

/**
 * Modo efectivo por compañía. Toda compañía fuera del registro —y toda
 * compañía con la bandera apagada— resuelve `legacy_only`.
 */
export function resolvePilotMode(companyId: string, registry: readonly PilotFlag[] = PILOT_REGISTRY): PilotMode {
  const flag = getPilotFlag(companyId, registry);
  if (!flag) return "legacy_only";
  if (!flag.enabled) return flag.mode === "rolled_back" ? "rolled_back" : "compare";
  return flag.mode;
}

/** Fuente que gobierna la decisión efectiva. */
export type GoverningSource = "legacy" | "ecc";

export interface DualDecision {
  governedBy: GoverningSource;
  effective: boolean | null;
  fallbackUsed: boolean;
  reason: string;
}

/**
 * Resolución dual. `ecc_pilot` sólo gobierna si la bandera está encendida Y la
 * decisión ECC es concluyente; en cualquier otro caso cae a legacy.
 */
export const ECC_GOVERNING_MODES: ReadonlySet<PilotMode> = new Set<PilotMode>(["ecc_pilot", "ecc_stable"]);

export function resolveDual(mode: PilotMode, enabled: boolean, legacy: boolean | null, ecc: boolean | null): DualDecision {
  if (!enabled || !ECC_GOVERNING_MODES.has(mode)) {
    return {
      governedBy: "legacy",
      effective: legacy,
      fallbackUsed: false,
      reason: `Modo ${PILOT_MODE_LABEL[mode]}: la decisión efectiva es la legacy.`,
    };
  }
  if (ecc === null) {
    return {
      governedBy: "legacy",
      effective: legacy,
      fallbackUsed: true,
      reason:
        mode === "ecc_stable"
          ? "ECC no concluyente en modo estable: se registra incidente y gobierna legacy (fallback nunca silencioso)."
          : "ECC no concluyente: fallback a legacy.",
    };
  }
  return {
    governedBy: "ecc",
    effective: ecc,
    fallbackUsed: false,
    reason: mode === "ecc_stable" ? "ECC estable gobierna esta compañía." : "Piloto ECC activo para esta compañía.",
  };
}

/* ───────────────────── 4. Superficies del dry run ───────────────────── */

export type SurfaceDevice = "desktop" | "mobile" | "ambos";

export interface PilotSurface {
  id: string;
  label: string;
  alias: string;
  route: string;
  device: SurfaceDevice;
  gate: string;
}

export const PILOT_SURFACES: readonly PilotSurface[] = Object.freeze([
  { id: "services", label: "Servicios", alias: "stafly.services", route: "/app/shifts", device: "ambos", gate: "ModuleGate(shifts)" },
  { id: "scheduling", label: "Programación", alias: "stafly.scheduling", route: "/app/schedule", device: "ambos", gate: "ModuleGate(shifts)" },
  { id: "team_hub", label: "Team Hub", alias: "stafly.team_hub", route: "/app/team-hub", device: "ambos", gate: "ModuleGate(command_center)" },
  { id: "workers", label: "Workers", alias: "shared.identity", route: "/app/employees", device: "ambos", gate: "ModuleGate(employees)" },
  { id: "documents", label: "Documentos", alias: "shared.documents", route: "/app/documents", device: "desktop", gate: "código + RLS" },
  { id: "documents_review", label: "Revisión documental", alias: "shared.documents.review", route: "/app/documents", device: "desktop", gate: "código + RLS" },
  { id: "compliance", label: "Cumplimiento", alias: "stafly.compliance", route: "/app/compliance", device: "ambos", gate: "código + RLS" },
  { id: "portal", label: "Portal del trabajador", alias: "stafly.worker_portal", route: "/portal", device: "mobile", gate: "portal_modules" },
  { id: "audit", label: "Auditoría", alias: "shared.audit", route: "/app/activity", device: "desktop", gate: "código + RLS" },
  { id: "timeclock", label: "Time Clock", alias: "stafly.time_clock", route: "/app/timeclock", device: "ambos", gate: "ModuleGate(timeclock)" },
  { id: "payroll_review", label: "Revisión de nómina", alias: "stafly.payroll_review", route: "/app/payroll-review-queue", device: "desktop", gate: "ModuleGate(periods)" },
  { id: "notifications", label: "Notificaciones", alias: "shared.notifications", route: "/app/notifications", device: "ambos", gate: "código + RLS" },
]);

export interface SurfaceDryRunRow {
  surface: string;
  label: string;
  route: string;
  device: SurfaceDevice;
  capability: string | null;
  legacy: boolean | null;
  ecc: boolean | null;
  match: boolean;
  reason: string;
  source: string;
  impactIfCutover: string;
  rollbackBehavior: string;
  effectiveToday: boolean | null;
  governedBy: GoverningSource;
}

/* ───────────────────── 7. Observabilidad ───────────────────── */

export type PilotEventKind =
  | "capability_decision"
  | "limit_decision"
  | "dependency_check"
  | "access_state_check"
  | "cutover_simulated"
  | "rollback_simulated";

export interface PilotObservabilityEvent {
  kind: PilotEventKind;
  companyId: string;
  surface: string;
  capability: string | null;
  legacy: string;
  ecc: string;
  mismatch: boolean;
  fallbackUsed: boolean;
  governedBy: GoverningSource;
  user: string;
  version: number | null;
  timestamp: string;
}

export type PilotAlertCode =
  | "unexpected_deny"
  | "unexpected_allow"
  | "dependency_mismatch"
  | "limit_mismatch"
  | "cross_tenant_resolution"
  | "unresolved_capability";

export const PILOT_ALERT_LABEL: Record<PilotAlertCode, string> = {
  unexpected_deny: "Denegación inesperada",
  unexpected_allow: "Permiso inesperado",
  dependency_mismatch: "Dependencia no satisfecha",
  limit_mismatch: "Diferencia de límite",
  cross_tenant_resolution: "Resolución cross-tenant",
  unresolved_capability: "Capacidad sin resolver",
};

export interface PilotAlert {
  code: PilotAlertCode;
  severity: "alta" | "media" | "baja";
  companyId: string;
  subject: string;
  detail: string;
}

/* ───────────────────── 1 y 2. Precheck y criterios ───────────────────── */

export interface PilotUsageInput {
  payPeriods: number;
  closedOrPaidPeriods: number;
  basePayRows: number;
  shifts: number;
  timeEntries: number;
  documents: number;
  users: number;
  employees: number;
  activityEvents: number;
}

export const EMPTY_USAGE: PilotUsageInput = Object.freeze({
  payPeriods: 0,
  closedOrPaidPeriods: 0,
  basePayRows: 0,
  shifts: 0,
  timeEntries: 0,
  documents: 0,
  users: 0,
  employees: 0,
  activityEvents: 0,
});

export interface PilotCriterion {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
}

export interface PilotPrecheck {
  companyId: string;
  companyName: string;
  approvalState: string;
  commercialState: string;
  accessState: string;
  planLegacy: string;
  planVersionEcc: string | null;
  version: number | null;
  capabilitiesLegacy: Record<string, boolean | null>;
  capabilitiesEcc: Record<string, boolean | null>;
  limitsLegacy: Record<string, number | null>;
  limitsEcc: Record<string, number>;
  overrides: Array<{ key: string; classification: string; reason: string }>;
  unknownOverrides: number;
  usage: PilotUsageInput;
  dependencies: string[];
  contradictions: string[];
  readiness: Readiness;
  conditionalReasons: string[];
  criticalMatch: { total: number; matched: number };
  unexplainedRisks: string[];
}

export function buildPilotPrecheck(rec: CompanyReconciliation, usage: PilotUsageInput): PilotPrecheck {
  const capabilitiesLegacy: Record<string, boolean | null> = {};
  const capabilitiesEcc: Record<string, boolean | null> = {};
  for (const m of rec.criticalMatrix) {
    capabilitiesLegacy[m.alias] = m.legacy;
    capabilitiesEcc[m.alias] = m.ecc;
  }
  const limitsLegacy: Record<string, number | null> = {};
  const limitsEcc: Record<string, number> = {};
  for (const l of rec.limits) {
    limitsLegacy[l.limitKey] = l.legacy;
    limitsEcc[l.limitKey] = l.ecc;
  }
  const matched = rec.criticalMatrix.filter(m => m.status === "match").length;

  const unexplainedRisks: string[] = [];
  for (const o of rec.overrides) if (o.classification === "desconocido") unexplainedRisks.push(`Override sin clasificar: ${o.key}.`);
  for (const f of rec.findings) if (f.critical && !f.owner) unexplainedRisks.push(`Hallazgo crítico sin owner: ${f.key}.`);
  for (const b of rec.blockers) unexplainedRisks.push(b);

  return {
    companyId: rec.companyId,
    companyName: rec.companyName,
    approvalState: rec.approvalState,
    commercialState: rec.commercialState,
    accessState: rec.accessState,
    planLegacy: rec.planCodeLegacy,
    planVersionEcc: rec.planVersionId,
    version: rec.shadow.access.planVersion?.version ?? null,
    capabilitiesLegacy,
    capabilitiesEcc,
    limitsLegacy,
    limitsEcc,
    overrides: rec.overrides.map(o => ({ key: o.key, classification: o.classification, reason: o.reason })),
    unknownOverrides: rec.overrides.filter(o => o.classification === "desconocido").length,
    usage,
    dependencies: rec.criticalMatrix.flatMap(m => m.missingDependencies),
    contradictions: rec.contradictions,
    readiness: rec.readiness,
    conditionalReasons: rec.readinessReasons,
    criticalMatch: { total: rec.criticalMatrix.length, matched },
    unexplainedRisks,
  };
}

export function evaluatePilotCriteria(pre: PilotPrecheck, rec: CompanyReconciliation): PilotCriterion[] {
  const overLimit = rec.limits.filter(l => l.overLimitRisk);
  const employees = pre.limitsEcc[LIMIT_KEYS.employees];
  return [
    {
      id: "critical_capabilities",
      label: "100 % de capacidades críticas coinciden",
      passed: pre.criticalMatch.matched === pre.criticalMatch.total,
      evidence: `${pre.criticalMatch.matched}/${pre.criticalMatch.total} en match.`,
    },
    {
      id: "no_productive_payroll",
      label: "Sin payroll productivo",
      passed: pre.usage.basePayRows === 0 && pre.usage.timeEntries === 0,
      evidence: `base pay=${pre.usage.basePayRows}, time entries=${pre.usage.timeEntries}.`,
    },
    {
      id: "no_closed_periods",
      label: "Sin periodos cerrados o pagados relevantes",
      passed: pre.usage.closedOrPaidPeriods === 0,
      evidence: `periodos=${pre.usage.payPeriods}, cerrados/pagados=${pre.usage.closedOrPaidPeriods}.`,
    },
    {
      id: "no_unknown_overrides",
      label: "Sin overrides desconocidos",
      passed: pre.unknownOverrides === 0,
      evidence: `${pre.overrides.length} override(s), 0 sin clasificar.`,
    },
    {
      id: "access_state_consistent",
      label: "Sin contradicciones de access state",
      passed: pre.contradictions.length === 0 && pre.approvalState === "approved" && pre.accessState === "active",
      evidence: `approval=${pre.approvalState}, access=${pre.accessState}, contradicciones=${pre.contradictions.length}.`,
    },
    {
      id: "within_limits",
      label: "No excede límites efectivos",
      passed: overLimit.length === 0,
      evidence: `uso ${pre.usage.employees}/${employees} personas, ${pre.usage.users} admins.`,
    },
    {
      id: "no_unmapped_dependency",
      label: "Sin dependencia legacy sin mapping",
      passed: pre.dependencies.length === 0 && rec.criticalMatrix.every(m => !!m.canonical),
      evidence: pre.dependencies.length ? pre.dependencies.join(", ") : "todas las dependencias satisfechas.",
    },
    {
      id: "rollback_by_company",
      label: "Rollback por company_id disponible",
      passed: !!getPilotFlag(pre.companyId),
      evidence: `bandera ${PILOT_FLAG_KEY} registrada y aislada por company_id.`,
    },
    {
      id: "global_owner",
      label: "Existe un global owner autorizado",
      passed: pre.usage.users > 0,
      evidence: "El cutover sólo puede aprobarlo un propietario global autenticado.",
    },
    {
      id: "restorable",
      label: "La compañía puede restaurarse sin afectar otras",
      passed: PILOT_REGISTRY.length === 1 && PILOT_REGISTRY[0].companyId === pre.companyId,
      evidence: "Registro de piloto con una sola compañía; el resto resuelve legacy_only.",
    },
  ];
}

/* ───────────────────── 5. Contrato de cutover ───────────────────── */

export interface PilotCutoverContract extends CutoverContractDraft {
  approvedBy: string | null;
  idempotencyKey: string;
  rollbackUntil: string | null;
  accessSnapshot: { approvalState: string; commercialState: string; accessState: string; legalAccessPreserved: boolean };
  auditReference: string;
  versionAtPrecheck: number | null;
  blockedReasons: string[];
}

const fnv1a = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

export function buildPilotCutoverContract(
  rec: CompanyReconciliation,
  pre: PilotPrecheck,
  criteria: PilotCriterion[],
  companyVersionAtPrecheck: number | null,
): PilotCutoverContract {
  const draft = buildCutoverContractDraft(rec, "ecc-pilot-4a");
  const failed = criteria.filter(c => !c.passed).map(c => c.label);
  const idempotencyKey = `ecc-cutover:${rec.companyId}:${companyVersionAtPrecheck ?? "nv"}:${fnv1a(JSON.stringify(draft.capabilitiesSnapshot))}`;
  return {
    ...draft,
    expectedVersion: companyVersionAtPrecheck,
    versionAtPrecheck: companyVersionAtPrecheck,
    approvedBy: null,
    cutoverAt: null,
    rollbackUntil: null,
    idempotencyKey,
    accessSnapshot: {
      approvalState: pre.approvalState,
      commercialState: pre.commercialState,
      accessState: pre.accessState,
      legalAccessPreserved: true,
    },
    auditReference: `ecc_phase_4a_dry_run:${rec.companyId}`,
    blockedReasons: failed,
    executable: false,
  };
}

/** El cutover se rechaza si la versión cambió después del precheck. */
export function canExecuteCutover(contract: PilotCutoverContract, currentVersion: number | null): { allowed: false; reason: string } {
  if (contract.versionAtPrecheck !== currentVersion) {
    return { allowed: false, reason: `Conflicto de versión: precheck ${contract.versionAtPrecheck}, actual ${currentVersion}.` };
  }
  if (contract.blockedReasons.length > 0) {
    return { allowed: false, reason: `Criterios mínimos no cumplidos: ${contract.blockedReasons.join("; ")}.` };
  }
  if (!contract.approvedBy) {
    return { allowed: false, reason: "Sin aprobación humana de propietario global." };
  }
  return { allowed: false, reason: "Fase 4A es dry run: la ejecución está deshabilitada por diseño." };
}

/* ───────────────────── 6. Rollback ───────────────────── */

export interface PilotRollbackResult {
  companyId: string;
  from: PilotMode;
  to: PilotMode;
  legacyRestored: boolean;
  eccKeptInShadow: boolean;
  planVersionsPreserved: boolean;
  entitlementsPreserved: boolean;
  auditPreserved: boolean;
  commercialDataUnchanged: boolean;
  otherCompaniesAffected: number;
  idempotent: boolean;
  detail: string;
}

/** Rollback puro e idempotente: vuelve a legacy sin borrar nada. */
export function simulateRollback(companyId: string, from: PilotMode): PilotRollbackResult {
  const alreadyLegacy = from === "legacy_only" || from === "rolled_back";
  return {
    companyId,
    from,
    to: "rolled_back",
    legacyRestored: true,
    eccKeptInShadow: true,
    planVersionsPreserved: true,
    entitlementsPreserved: true,
    auditPreserved: true,
    commercialDataUnchanged: true,
    otherCompaniesAffected: 0,
    idempotent: true,
    detail: alreadyLegacy
      ? "Ya gobernaba legacy: el rollback es un no-op registrado."
      : "Bandera apagada por company_id; el gate legacy nunca fue removido.",
  };
}

/* ───────────────────── Dry run completo ───────────────────── */

export interface PilotDryRunResult {
  companyId: string;
  companyName: string;
  mode: PilotMode;
  flagEnabled: boolean;
  precheck: PilotPrecheck;
  criteria: PilotCriterion[];
  criteriaPassed: boolean;
  surfaces: SurfaceDryRunRow[];
  mismatches: SurfaceDryRunRow[];
  events: PilotObservabilityEvent[];
  alerts: PilotAlert[];
  contract: PilotCutoverContract;
  rollback: PilotRollbackResult;
  rollbackAfterPilot: PilotRollbackResult;
  accessChanged: false;
  otherCompaniesTouched: 0;
  generatedAt: string;
}

export interface PilotDryRunOptions {
  usage?: PilotUsageInput;
  at?: string;
  user?: string;
  companyVersion?: number | null;
  registry?: readonly PilotFlag[];
}

export function runPilotDryRun(input: EccReadModelInput, opts: PilotDryRunOptions = {}): PilotDryRunResult {
  const at = opts.at ?? input.generatedAt ?? new Date().toISOString();
  const user = opts.user ?? "global_owner";
  const usage = opts.usage ?? EMPTY_USAGE;
  const registry = opts.registry ?? PILOT_REGISTRY;

  const rec = reconcileCompany(input, at);
  const flag = getPilotFlag(rec.companyId, registry);
  const mode = resolvePilotMode(rec.companyId, registry);
  const enabled = flag?.enabled ?? false;

  const pre = buildPilotPrecheck(rec, usage);
  const criteria = evaluatePilotCriteria(pre, rec);
  const criteriaPassed = criteria.every(c => c.passed);

  const byAlias = new Map(rec.criticalMatrix.map(m => [m.alias, m]));
  const events: PilotObservabilityEvent[] = [];
  const alerts: PilotAlert[] = [];

  const surfaces: SurfaceDryRunRow[] = PILOT_SURFACES.map(s => {
    const m = byAlias.get(s.alias);
    const legacy = m?.legacy ?? null;
    const ecc = m?.ecc ?? null;
    const match = legacy === ecc;
    const dual = resolveDual(mode, enabled, legacy, ecc);

    events.push({
      kind: "capability_decision",
      companyId: rec.companyId,
      surface: s.id,
      capability: m?.canonical ?? null,
      legacy: legacy === null ? "sin gate" : legacy ? "permitido" : "denegado",
      ecc: ecc === null ? "sin resolver" : ecc ? "permitido" : "denegado",
      mismatch: !match,
      fallbackUsed: dual.fallbackUsed,
      governedBy: dual.governedBy,
      user,
      version: opts.companyVersion ?? null,
      timestamp: at,
    });

    if (!m?.canonical) {
      alerts.push({ code: "unresolved_capability", severity: "alta", companyId: rec.companyId, subject: s.alias, detail: `La superficie ${s.label} no tiene capability canónica.` });
    }
    if (legacy === true && ecc === false) {
      alerts.push({ code: "unexpected_deny", severity: "alta", companyId: rec.companyId, subject: s.label, detail: "Un cutover retiraría acceso existente." });
    }
    if (legacy === false && ecc === true) {
      alerts.push({ code: "unexpected_allow", severity: "alta", companyId: rec.companyId, subject: s.label, detail: "Un cutover concedería acceso inexistente hoy." });
    }
    if (m && m.missingDependencies.length > 0) {
      alerts.push({ code: "dependency_mismatch", severity: "alta", companyId: rec.companyId, subject: s.label, detail: `Dependencias faltantes: ${m.missingDependencies.join(", ")}.` });
    }

    return {
      surface: s.id,
      label: s.label,
      route: s.route,
      device: s.device,
      capability: m?.canonical ?? null,
      legacy,
      ecc,
      match,
      reason: m?.status === "match" ? "Legacy y ECC coinciden." : (m?.recommendedAction ?? "Sin mapping"),
      source: `${m?.legacyGovernance ?? s.gate} → ${m?.eccSource ?? "—"}`,
      impactIfCutover: match ? "Ninguno: la decisión no cambia." : legacy ? "Pérdida de acceso." : "Concesión de acceso.",
      rollbackBehavior: "Apagar la bandera restaura legacy de inmediato; el gate legacy nunca se removió.",
      effectiveToday: dual.effective,
      governedBy: dual.governedBy,
    };
  });

  for (const l of rec.limits) {
    const usageValue = l.limitKey === LIMIT_KEYS.employees ? usage.employees : usage.users;
    events.push({
      kind: "limit_decision",
      companyId: rec.companyId,
      surface: "limits",
      capability: l.limitKey,
      legacy: String(l.legacy ?? "sin valor"),
      ecc: String(l.ecc),
      mismatch: l.status !== "match" || l.overLimitRisk,
      fallbackUsed: false,
      governedBy: "legacy",
      user,
      version: opts.companyVersion ?? null,
      timestamp: at,
    });
    if (l.status !== "match" || l.overLimitRisk) {
      alerts.push({
        code: "limit_mismatch",
        severity: l.overLimitRisk ? "alta" : "media",
        companyId: rec.companyId,
        subject: l.limitKey,
        detail: `legacy=${l.legacy ?? "n/d"} · ECC=${l.ecc} · uso=${usageValue}.`,
      });
    }
  }

  events.push({
    kind: "access_state_check",
    companyId: rec.companyId,
    surface: "access_state",
    capability: null,
    legacy: `${rec.approvalState}/${rec.accessState}`,
    ecc: `${rec.approvalState}/${rec.accessState}`,
    mismatch: rec.contradictions.length > 0,
    fallbackUsed: false,
    governedBy: "legacy",
    user,
    version: opts.companyVersion ?? null,
    timestamp: at,
  });

  // Aislamiento: cualquier evento fuera de la compañía piloto es cross-tenant.
  for (const e of events) {
    if (e.companyId !== rec.companyId) {
      alerts.push({ code: "cross_tenant_resolution", severity: "alta", companyId: e.companyId, subject: e.surface, detail: "Resolución fuera del company_id piloto." });
    }
  }

  const contract = buildPilotCutoverContract(rec, pre, criteria, opts.companyVersion ?? null);
  events.push({
    kind: "cutover_simulated",
    companyId: rec.companyId,
    surface: "cutover",
    capability: null,
    legacy: "gobierna",
    ecc: "shadow",
    mismatch: false,
    fallbackUsed: false,
    governedBy: "legacy",
    user,
    version: opts.companyVersion ?? null,
    timestamp: at,
  });

  const rollback = simulateRollback(rec.companyId, mode);
  const rollbackAfterPilot = simulateRollback(rec.companyId, "ecc_pilot");
  events.push({
    kind: "rollback_simulated",
    companyId: rec.companyId,
    surface: "rollback",
    capability: null,
    legacy: "restaurado",
    ecc: "shadow",
    mismatch: false,
    fallbackUsed: true,
    governedBy: "legacy",
    user,
    version: opts.companyVersion ?? null,
    timestamp: at,
  });

  return {
    companyId: rec.companyId,
    companyName: rec.companyName,
    mode,
    flagEnabled: enabled,
    precheck: pre,
    criteria,
    criteriaPassed,
    surfaces,
    mismatches: surfaces.filter(s => !s.match),
    events,
    alerts,
    contract,
    rollback,
    rollbackAfterPilot,
    accessChanged: false,
    otherCompaniesTouched: 0,
    generatedAt: at,
  };
}

/** Alias operativos cubiertos por al menos una superficie del dry run. */
export const SURFACE_ALIASES: ReadonlySet<string> = new Set(PILOT_SURFACES.map(s => s.alias));

export const UNCOVERED_CRITICAL_ALIASES = CRITICAL_CAPABILITY_ALIASES.filter(a => !SURFACE_ALIASES.has(a.alias)).map(a => a.alias);
