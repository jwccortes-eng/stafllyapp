/**
 * ECC — Fase 3. Shadow reconciliation + cutover readiness.
 *
 * Modelo PURO: no lee red, no escribe, no toca gates. Legacy sigue gobernando
 * (`useSubscription.canAccessModule`, `ModuleGate`, `company_modules`,
 * `companies.plan_code`). Aquí sólo se compara, clasifica y explica.
 */
import type { EccReadModelInput } from "./commercial-read-model";
import { buildShadowReport, type ShadowCapabilityRow, type ShadowLimitRow, type ShadowReport } from "./legacy-mapping";
import { getCapability } from "./capability-catalog";
import { LIMIT_KEYS, LIMIT_LABEL } from "./plan-versions";
import type { EntitlementOverride } from "./overrides";

/* ───────────────────── 4. Capacidades críticas ───────────────────── */

/**
 * Nombre operativo solicitado → capability canónica del catálogo (o null).
 * Fase 3.1: documentos, cumplimiento, portal y auditoría ya están representados.
 * `shared.documents` vive una sola vez: no existe `stafly.documents`.
 */
export const CRITICAL_CAPABILITY_ALIASES: ReadonlyArray<{ alias: string; canonical: string | null; label: string }> =
  Object.freeze([
    { alias: "stafly.services", canonical: "stafly.ops.shifts", label: "Servicios" },
    { alias: "stafly.scheduling", canonical: "stafly.ops.shifts", label: "Programación" },
    { alias: "stafly.team_hub", canonical: "stafly.ops.command_center", label: "Team Hub" },
    { alias: "stafly.time_clock", canonical: "stafly.ops.timeclock", label: "Reloj de asistencia" },
    { alias: "stafly.payroll_review", canonical: "stafly.payroll.reconciliation", label: "Revisión de nómina" },
    { alias: "shared.identity", canonical: "shared.identity.directory", label: "Identidad" },
    { alias: "shared.documents", canonical: "shared.documents.storage", label: "Documentos" },
    { alias: "shared.documents.review", canonical: "shared.documents.review", label: "Revisión documental" },
    { alias: "shared.audit", canonical: "shared.audit.trail", label: "Auditoría" },
    { alias: "shared.notifications", canonical: "shared.comms.notifications", label: "Notificaciones" },
    { alias: "stafly.compliance", canonical: "stafly.compliance.requirements", label: "Cumplimiento" },
    {
      alias: "stafly.compliance.assignment_policy",
      canonical: "stafly.compliance.assignment_policy",
      label: "Política de asignación",
    },
    { alias: "stafly.worker_portal", canonical: "stafly.worker_portal.access", label: "Portal del trabajador" },
    {
      alias: "stafly.worker_portal.documents",
      canonical: "stafly.worker_portal.documents",
      label: "Documentos del trabajador",
    },
    { alias: "stafly.captain_room", canonical: "stafly.worker_portal.captain_room", label: "Sala del capitán" },
  ]);


export const CRITICAL_CANONICAL_KEYS: ReadonlySet<string> = new Set(
  CRITICAL_CAPABILITY_ALIASES.map(a => a.canonical).filter((k): k is string => !!k),
);

/* ───────────────────── 2. Clasificación de diferencias ───────────────────── */

export type DifferenceClass = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export const DIFFERENCE_CLASS_LABEL: Record<DifferenceClass, string> = {
  A: "Mapeo faltante",
  B: "Legacy inconsistente",
  C: "ECC incompleto",
  D: "Override manual",
  E: "Dato ambiguo",
  F: "Riesgo operativo",
  G: "Riesgo comercial",
  H: "Riesgo cross-tenant",
};

export type ResolutionAction =
  | "keep_legacy"
  | "adopt_ecc"
  | "create_mapping"
  | "create_override"
  | "fix_data"
  | "human_review"
  | "block_cutover";

export const RESOLUTION_ACTION_LABEL: Record<ResolutionAction, string> = {
  keep_legacy: "Mantener legacy",
  adopt_ecc: "Adoptar ECC",
  create_mapping: "Crear mapping",
  create_override: "Crear override explícito",
  fix_data: "Corregir dato",
  human_review: "Revisión humana",
  block_cutover: "Bloquear cutover",
};

export interface ReconciliationFinding {
  id: string;
  companyId: string;
  scope: "capability" | "limit" | "access_state" | "plan" | "override" | "tenant";
  key: string;
  label: string;
  critical: boolean;
  legacy: string;
  ecc: string;
  legacySource: string;
  eccSource: string;
  status: ShadowCapabilityRow["status"] | "limit_difference" | "override_conflict" | "dependency_difference" | "inconsistent";
  classification: DifferenceClass;
  detail: string;
  /* 7. Plan de resolución */
  proposal: ResolutionAction;
  risk: "alto" | "medio" | "bajo";
  owner: string;
  evidence: string;
  rollback: string;
  accessImpact: string;
  commercialImpact: string;
  tenantImpact: string;
}

/* ───────────────────── 3. Readiness ───────────────────── */

export type Readiness = "READY" | "CONDITIONAL" | "NOT_READY" | "BLOCKED";

export const READINESS_LABEL: Record<Readiness, string> = {
  READY: "Listo",
  CONDITIONAL: "Condicional",
  NOT_READY: "No listo",
  BLOCKED: "Bloqueado",
};

/* ───────────────────── 6. Overrides ───────────────────── */

export type OverrideClass = "permanente" | "temporal" | "comercial" | "soporte" | "migracion" | "desconocido";

export interface OverrideInventoryRow {
  id: string;
  kind: EntitlementOverride["kind"];
  key: string;
  value: string;
  scope: EntitlementOverride["target"]["scope"];
  legacySource: string;
  classification: OverrideClass;
  reason: string;
  approvedBy: string | null;
  effectiveUntil: string | null;
  blocksReadiness: boolean;
}

function classifyOverride(o: EntitlementOverride): OverrideClass {
  const reason = (o.reason ?? "").toLowerCase();
  if (reason.includes("company_modules") || reason.includes("migración") || reason.includes("migracion")) return "migracion";
  if (o.effectiveUntil) return "temporal";
  if (reason.includes("paid_features")) return "comercial";
  if (reason.includes("soporte")) return "soporte";
  if (!o.reason || !o.approvedBy) return "desconocido";
  if (reason.includes("plan") || reason.includes("límite") || reason.includes("limite")) return "comercial";
  return "permanente";
}

/* ───────────────────── 5. Limits ───────────────────── */

export interface LimitReconciliationRow {
  limitKey: string;
  label: string;
  legacy: number | null;
  ecc: number;
  usage: number | null;
  overLimitRisk: boolean;
  cutoverImpact: string;
  recommendation: ResolutionAction;
  status: ShadowLimitRow["status"];
  detail: string;
}

/* ───────────────────── 1. Inventario por compañía ───────────────────── */

export interface CompanyReconciliation {
  companyId: string;
  companyName: string;
  accountId: string | null;
  accountDerived: boolean;
  approvalState: string;
  commercialState: string;
  accessState: string;
  planCodeLegacy: string;
  subscriptionLegacy: string;
  legacyModules: Array<{ module: string; active: boolean }>;
  planVersionId: string | null;
  entitlements: Record<string, boolean>;
  limits: LimitReconciliationRow[];
  overrides: OverrideInventoryRow[];
  criticalMatrix: Array<{
    alias: string;
    label: string;
    canonical: string | null;
    legacy: boolean | null;
    ecc: boolean | null;
    status: string;
    explained: boolean;
  }>;
  findings: ReconciliationFinding[];
  readiness: Readiness;
  readinessReasons: string[];
  blockers: string[];
  contradictions: string[];
  legacyDependencies: string[];
  isDemo: boolean;
  cutoverCandidate: boolean;
  candidateReason: string;
  shadow: ShadowReport;
  generatedAt: string;
}

const DEMO_HINTS = ["demo", "sandbox", "prueba", "test", "staging"];

const isDemoCompany = (name: string, slug?: string | null) =>
  DEMO_HINTS.some(h => `${name} ${slug ?? ""}`.toLowerCase().includes(h));

function classifyCapabilityRow(row: ShadowCapabilityRow, critical: boolean): DifferenceClass {
  if (row.status === "missing_mapping" || row.status === "unknown") return "A";
  if (row.status === "legacy_only") return critical ? "F" : "B";
  if (row.status === "ecc_only") return "C";
  if (row.status === "mismatch") return critical ? "F" : "G";
  return "E";
}

function proposalFor(cls: DifferenceClass, critical: boolean): ResolutionAction {
  switch (cls) {
    case "A":
      return "create_mapping";
    case "B":
      return "create_override";
    case "C":
      return "adopt_ecc";
    case "D":
      return "human_review";
    case "E":
      return "fix_data";
    case "F":
      return critical ? "block_cutover" : "keep_legacy";
    case "G":
      return "human_review";
    case "H":
      return "block_cutover";
  }
}

const OWNER_BY_CLASS: Record<DifferenceClass, string> = {
  A: "ecc-core (catálogo)",
  B: "operaciones Stafly",
  C: "ecc-core (plan versions)",
  D: "comercial",
  E: "datos / soporte",
  F: "operaciones Stafly",
  G: "comercial",
  H: "seguridad / plataforma",
};

/** Reconciliación completa de una compañía. Función pura. */
export function reconcileCompany(input: EccReadModelInput, at?: string): CompanyReconciliation {
  const shadow = buildShadowReport(input, at);
  const generatedAt = at ?? shadow.generatedAt;
  const findings: ReconciliationFinding[] = [];
  const c = input.company;

  const byCanonical = new Map(shadow.capabilities.map(r => [r.capabilityKey, r]));

  /* Capacidades */
  for (const row of shadow.capabilities) {
    if (row.status === "match") continue;
    if (row.status === "unknown" && !CRITICAL_CANONICAL_KEYS.has(row.capabilityKey)) continue;
    const critical = CRITICAL_CANONICAL_KEYS.has(row.capabilityKey);
    const cls = classifyCapabilityRow(row, critical);
    findings.push({
      id: `${c.id}:cap:${row.capabilityKey}`,
      companyId: c.id,
      scope: "capability",
      key: row.capabilityKey,
      label: getCapability(row.capabilityKey)?.name ?? row.capabilityKey,
      critical,
      legacy: row.legacy === null ? "sin gate" : row.legacy ? "habilitado" : "bloqueado",
      ecc: row.ecc ? "habilitado" : "bloqueado",
      legacySource: row.legacyModuleKey ? `company_modules.${row.legacyModuleKey} / plan_code` : "—",
      eccSource: row.eccReason,
      status: row.status,
      classification: cls,
      detail: row.detail,
      proposal: proposalFor(cls, critical),
      risk: critical ? "alto" : row.status === "legacy_only" ? "medio" : "bajo",
      owner: OWNER_BY_CLASS[cls],
      evidence: `shadow.capabilities[${row.capabilityKey}] · ${row.eccReason}`,
      rollback: "Ninguno: el gate legacy nunca se modificó.",
      accessImpact:
        row.status === "legacy_only"
          ? "Un cutover retiraría acceso que hoy existe."
          : row.status === "mismatch"
            ? "Un cutover concedería acceso que hoy no existe."
            : "Sin impacto mientras legacy gobierne.",
      commercialImpact: critical ? "Capacidad operativa crítica: afecta facturación y continuidad." : "Bajo.",
      tenantImpact: "Ninguno: la resolución está aislada por company_id.",
    });
  }

  /* Límites */
  const usageByKey: Record<string, number | null> = {
    [LIMIT_KEYS.employees]: input.employeeCount ?? null,
    [LIMIT_KEYS.admins]: input.userCount ?? null,
  };
  const limits: LimitReconciliationRow[] = shadow.limits.map(l => {
    const usage = usageByKey[l.limitKey] ?? null;
    const overLimitRisk = usage !== null && Number.isFinite(l.ecc) && usage > l.ecc;
    const status = l.status;
    const recommendation: ResolutionAction = overLimitRisk
      ? "create_override"
      : status === "match"
        ? "adopt_ecc"
        : "human_review";
    if (status !== "match" || overLimitRisk) {
      findings.push({
        id: `${c.id}:limit:${l.limitKey}`,
        companyId: c.id,
        scope: "limit",
        key: l.limitKey,
        label: LIMIT_LABEL[l.limitKey] ?? l.limitKey,
        critical: overLimitRisk,
        legacy: l.legacy === null ? "sin valor" : String(l.legacy),
        ecc: Number.isFinite(l.ecc) ? String(l.ecc) : "sin límite",
        legacySource: `companies.${l.limitKey.includes("admins") ? "max_admins" : "max_employees"}`,
        eccSource: shadow.planVersionId ?? "plan version no resuelta",
        status: "limit_difference",
        classification: overLimitRisk ? "F" : "D",
        detail: overLimitRisk
          ? `Uso actual ${usage} supera el límite canónico ${l.ecc}.`
          : l.detail,
        proposal: recommendation,
        risk: overLimitRisk ? "alto" : "bajo",
        owner: overLimitRisk ? "operaciones Stafly" : "comercial",
        evidence: `shadow.limits[${l.limitKey}] · uso=${usage ?? "n/d"}`,
        rollback: "Ninguno: no se aplicó ningún límite nuevo.",
        accessImpact: overLimitRisk ? "Un cutover podría bloquear altas de personas o administradores." : "Sin impacto.",
        commercialImpact: "Puede requerir cambio de plan o excepción comercial.",
        tenantImpact: "Ninguno.",
      });
    }
    return {
      limitKey: l.limitKey,
      label: LIMIT_LABEL[l.limitKey] ?? l.limitKey,
      legacy: l.legacy,
      ecc: l.ecc,
      usage,
      overLimitRisk,
      cutoverImpact: overLimitRisk
        ? "Bloqueo potencial de operación al aplicar el límite canónico."
        : status === "match"
          ? "Ninguno."
          : "Cambio de tope al adoptar ECC; requiere confirmación comercial.",
      recommendation,
      status,
      detail: l.detail,
    };
  });

  /* Overrides */
  const overrides: OverrideInventoryRow[] = shadow.access.overridesApplied.map(o => {
    const classification = classifyOverride(o);
    const blocksReadiness = classification === "desconocido";
    if (blocksReadiness) {
      findings.push({
        id: `${c.id}:override:${o.id}`,
        companyId: c.id,
        scope: "override",
        key: o.key,
        label: `Override ${o.kind}`,
        critical: true,
        legacy: "excepción legacy",
        ecc: String(o.value),
        legacySource: "company_modules / paid_features_enabled",
        eccSource: `override ${o.id}`,
        status: "override_conflict",
        classification: "D",
        detail: "Override sin motivo o sin aprobador identificable: bloquea readiness hasta revisión humana.",
        proposal: "human_review",
        risk: "alto",
        owner: "comercial",
        evidence: o.reason || "sin motivo registrado",
        rollback: "Ninguno: el override sólo existe en shadow.",
        accessImpact: "Desconocido hasta clasificarlo.",
        commercialImpact: "Desconocido.",
        tenantImpact: "Ninguno: el override está acotado por scope.",
      });
    }
    return {
      id: o.id,
      kind: o.kind,
      key: o.key,
      value: String(o.value),
      scope: o.target.scope,
      legacySource: o.reason.includes("company_modules") ? "company_modules" : "companies",
      classification,
      reason: o.reason,
      approvedBy: o.approvedBy,
      effectiveUntil: o.effectiveUntil,
      blocksReadiness,
    };
  });

  /* Estado de acceso / plan */
  const approvalState = c.approval_state ?? "sin dato";
  const accessState = c.access_state ?? "sin dato";
  const commercialState = c.commercial_state ?? "sin dato";
  const contradictions: string[] = [];

  if (accessState === "active" && approvalState !== "approved") {
    contradictions.push("Acceso activo sin aprobación humana registrada.");
    findings.push({
      id: `${c.id}:access_state`,
      companyId: c.id,
      scope: "access_state",
      key: "access_state",
      label: "Estado de acceso",
      critical: true,
      legacy: `${approvalState} / ${accessState}`,
      ecc: "requiere approval_state=approved",
      legacySource: "companies.approval_state / access_state",
      eccSource: "ECC lifecycle Fase 1",
      status: "inconsistent",
      classification: "F",
      detail: "La compañía opera con acceso activo sin estado de aprobación coherente.",
      proposal: "block_cutover",
      risk: "alto",
      owner: "operaciones Stafly",
      evidence: `approval_state=${approvalState}, access_state=${accessState}`,
      rollback: "No aplica: no se modificó ningún estado.",
      accessImpact: "Un cutover podría cortar acceso o legitimar acceso indebido.",
      commercialImpact: "Alto: relación comercial no verificada.",
      tenantImpact: "Ninguno.",
    });
  }
  if (!c.plan_code && c.paid_features_enabled) {
    contradictions.push("paid_features_enabled sin plan_code declarado: plan ambiguo.");
    findings.push({
      id: `${c.id}:plan`,
      companyId: c.id,
      scope: "plan",
      key: "plan_code",
      label: "Plan efectivo",
      critical: true,
      legacy: "null + paid_features_enabled",
      ecc: shadow.planVersionId ?? "sin versión",
      legacySource: "companies.plan_code",
      eccSource: "resolución por elevación",
      status: "inconsistent",
      classification: "E",
      detail: "El plan efectivo se deriva de una bandera, no de un plan declarado.",
      proposal: "fix_data",
      risk: "alto",
      owner: "comercial",
      evidence: "companies.plan_code = null, paid_features_enabled = true",
      rollback: "No aplica.",
      accessImpact: "Ninguno hoy; ambigüedad al fijar la versión de plan del contrato.",
      commercialImpact: "Plan facturable indeterminado.",
      tenantImpact: "Ninguno.",
    });
  }
  if (shadow.access.planVersion === null) {
    contradictions.push("No hay versión de plan canónica vigente para la compañía.");
  }

  /* Matriz crítica */
  const criticalMatrix = CRITICAL_CAPABILITY_ALIASES.map(a => {
    if (!a.canonical) {
      return {
        alias: a.alias,
        label: a.label,
        canonical: null,
        legacy: null,
        ecc: null,
        status: "missing_mapping",
        explained: false,
      };
    }
    const row = byCanonical.get(a.canonical);
    if (!row) {
      return { alias: a.alias, label: a.label, canonical: a.canonical, legacy: null, ecc: null, status: "unknown", explained: false };
    }
    return {
      alias: a.alias,
      label: a.label,
      canonical: a.canonical,
      legacy: row.legacy,
      ecc: row.ecc,
      status: row.status,
      explained: row.status === "match",
    };
  });

  for (const m of criticalMatrix) {
    if (m.canonical === null) {
      findings.push({
        id: `${c.id}:critical:${m.alias}`,
        companyId: c.id,
        scope: "capability",
        key: m.alias,
        label: m.label,
        critical: true,
        legacy: "gobernado por código, sin capability",
        ecc: "no existe en el catálogo",
        legacySource: "rutas y RLS",
        eccSource: "—",
        status: "missing_mapping",
        classification: "A",
        detail: "Capacidad operativa crítica sin representación canónica: el ECC no puede gobernarla todavía.",
        proposal: "create_mapping",
        risk: "alto",
        owner: "ecc-core (catálogo)",
        evidence: `alias ${m.alias} sin canonical`,
        rollback: "No aplica.",
        accessImpact: "Un cutover dejaría la capacidad sin gobierno explícito.",
        commercialImpact: "No se puede empaquetar ni facturar.",
        tenantImpact: "Ninguno.",
      });
    }
  }

  /* Readiness explicable */
  const reasons: string[] = [];
  const blockers: string[] = [];

  const criticalFindings = findings.filter(f => f.critical);
  const missingCriticalMapping = criticalMatrix.filter(m => !m.canonical || m.status === "unknown");
  const criticalMismatch = criticalMatrix.filter(m => m.canonical && m.status !== "match" && m.status !== "unknown");
  const unknownOverrides = overrides.filter(o => o.blocksReadiness);
  const limitMismatch = limits.filter(l => l.status !== "match");
  const overLimit = limits.filter(l => l.overLimitRisk);

  let readiness: Readiness;
  if (shadow.access.planVersion === null || unknownOverrides.length > 0) {
    readiness = "BLOCKED";
    if (shadow.access.planVersion === null) blockers.push("Sin versión de plan canónica vigente: datos insuficientes.");
    if (unknownOverrides.length > 0) blockers.push(`${unknownOverrides.length} override(s) sin clasificar.`);
  } else if (contradictions.length > 0 || criticalMismatch.length > 0 || overLimit.length > 0) {
    readiness = "NOT_READY";
    for (const x of contradictions) blockers.push(x);
    for (const m of criticalMismatch) blockers.push(`Capacidad crítica ${m.label}: ${m.status}.`);
    for (const l of overLimit) blockers.push(`Uso por encima del límite canónico en ${l.label}.`);
  } else if (missingCriticalMapping.length > 0) {
    readiness = "NOT_READY";
    blockers.push(
      `${missingCriticalMapping.length} capacidad(es) crítica(s) sin mapeo canónico: ${missingCriticalMapping
        .map(m => m.alias)
        .join(", ")}.`,
    );
  } else if (limitMismatch.length > 0 || shadow.missingMappings.length > 0 || findings.length > 0) {
    readiness = "CONDITIONAL";
    if (limitMismatch.length > 0) reasons.push("Diferencias de límites explicadas por override controlado.");
    if (shadow.missingMappings.length > 0)
      reasons.push(`Módulos legacy sin capacidad canónica: ${shadow.missingMappings.join(", ")}.`);
    if (findings.length > 0) reasons.push(`${findings.length} diferencia(s) no crítica(s) clasificada(s).`);
  } else {
    readiness = "READY";
    reasons.push("Todas las capacidades críticas coinciden, los límites coinciden y no hay contradicciones.");
  }

  if (readiness !== "READY" && reasons.length === 0) {
    reasons.push(...blockers);
  }
  if (criticalFindings.length > 0) {
    reasons.push(`${criticalFindings.length} hallazgo(s) crítico(s) con owner asignado.`);
  }

  const isDemo = isDemoCompany(c.name, c.slug);
  const hasPayroll = shadow.capabilities.some(
    r => r.capabilityKey.startsWith("stafly.payroll.") && (r.legacy === true || r.ecc),
  );
  let candidateReason: string;
  let cutoverCandidate = false;
  if (!isDemo) {
    candidateReason = "Compañía productiva: excluida por política de Fase 3.";
  } else if (readiness === "BLOCKED" || readiness === "NOT_READY") {
    candidateReason = `Readiness ${readiness}: resolver blockers antes de proponerla.`;
  } else if (hasPayroll && !isDemo) {
    candidateReason = "Payroll activo: excluida.";
  } else {
    cutoverCandidate = true;
    candidateReason = "Compañía demo con readiness aceptable: candidata propuesta, no ejecutada.";
  }

  return {
    companyId: c.id,
    companyName: c.name,
    accountId: input.commercialAccount?.id ?? null,
    accountDerived: input.commercialAccount?.derived ?? true,
    approvalState,
    commercialState,
    accessState,
    planCodeLegacy: c.plan_code ?? "sin plan",
    subscriptionLegacy: input.subscription ? `${input.subscription.status ?? "sin estado"}` : "sin suscripción",
    legacyModules: (input.modules ?? []).map(m => ({ module: m.module, active: !!m.is_active })),
    planVersionId: shadow.planVersionId,
    entitlements: Object.fromEntries(shadow.capabilities.map(r => [r.capabilityKey, r.ecc])),
    limits,
    overrides,
    criticalMatrix,
    findings,
    readiness,
    readinessReasons: reasons,
    blockers,
    contradictions,
    legacyDependencies: shadow.legacyDependencies,
    isDemo,
    cutoverCandidate,
    candidateReason,
    shadow,
    generatedAt,
  };
}

/* ───────────────────── 13. Multi-company ───────────────────── */

export interface AccountReconciliation {
  accountId: string | null;
  companyIds: string[];
  distinctPlanVersions: string[];
  sharedCapabilityConsistent: boolean;
  crossTenantLeak: boolean;
  detail: string;
}

export function reconcileAccounts(companies: CompanyReconciliation[]): AccountReconciliation[] {
  const byAccount = new Map<string, CompanyReconciliation[]>();
  for (const c of companies) {
    const key = c.accountId ?? `__company__${c.companyId}`;
    byAccount.set(key, [...(byAccount.get(key) ?? []), c]);
  }
  return [...byAccount.entries()].map(([key, list]) => {
    const accountId = key.startsWith("__company__") ? null : key;
    const distinctPlanVersions = [...new Set(list.map(c => c.planVersionId ?? "sin versión"))];
    const sharedKeys = [...CRITICAL_CANONICAL_KEYS].filter(k => k.startsWith("shared."));
    const sharedCapabilityConsistent = sharedKeys.every(k => {
      const values = list.map(c => c.entitlements[k]);
      return new Set(values).size <= 1;
    });
    // Fuga cross-tenant: un override de scope company aplicado a otra company.
    const crossTenantLeak = list.some(c =>
      c.overrides.some(o => o.scope === "company" && !c.shadow.access.overridesApplied.some(x => x.id === o.id)),
    );
    return {
      accountId,
      companyIds: list.map(c => c.companyId),
      distinctPlanVersions,
      sharedCapabilityConsistent,
      crossTenantLeak,
      detail: sharedCapabilityConsistent
        ? "Capacidades compartidas coherentes dentro de la cuenta; los planes se resuelven por compañía."
        : "Las capacidades shared.* difieren entre compañías de la misma cuenta: revisar contrato de cuenta.",
    };
  });
}

/* ───────────────────── 8. Shadow period ───────────────────── */

export interface ShadowPeriodPolicy {
  minimumDays: number;
  startedAt: string | null;
  observed: string[];
  requiresExplicitApproval: true;
  autoCutover: false;
}

export const SHADOW_PERIOD_POLICY: ShadowPeriodPolicy = Object.freeze({
  minimumDays: 30,
  startedAt: null,
  observed: [
    "capability mismatches",
    "limit mismatches",
    "access mismatches",
    "unknown sources",
    "override expirations",
    "readiness changes",
    "companies newly blocked",
    "legacy-only dependencies",
  ],
  requiresExplicitApproval: true,
  autoCutover: false,
});

export interface ShadowPeriodStatus {
  daysObserved: number;
  minimumDays: number;
  windowComplete: boolean;
  approvalGranted: boolean;
  cutoverAllowed: false;
  detail: string;
}

/** El cumplimiento de días NUNCA habilita cutover por sí solo. */
export function evaluateShadowPeriod(startedAt: string | null, now: string | Date = new Date()): ShadowPeriodStatus {
  const nowMs = new Date(now).getTime();
  const daysObserved = startedAt ? Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 86_400_000)) : 0;
  const windowComplete = daysObserved >= SHADOW_PERIOD_POLICY.minimumDays;
  return {
    daysObserved,
    minimumDays: SHADOW_PERIOD_POLICY.minimumDays,
    windowComplete,
    approvalGranted: false,
    cutoverAllowed: false,
    detail: windowComplete
      ? "Ventana de observación cumplida. El cutover sigue requiriendo aprobación humana explícita."
      : `Faltan ${SHADOW_PERIOD_POLICY.minimumDays - daysObserved} día(s) de observación mínima.`,
  };
}

/* ───────────────────── 10. Cutover contract (diseño, inactivo) ───────────────────── */

export interface CutoverContractDraft {
  companyId: string;
  expectedVersion: number | null;
  readiness: Readiness;
  approvedBy: string | null;
  cutoverAt: string | null;
  rollbackWindowHours: number;
  legacyFallback: true;
  tenantSafe: boolean;
  audit: { generatedAt: string; generatedBy: string; note: string };
  capabilitiesSnapshot: Record<string, boolean>;
  limitsSnapshot: Record<string, number>;
  executable: false;
}

/** Construye el contrato de cutover SIN ejecutarlo (`executable: false` siempre). */
export function buildCutoverContractDraft(rec: CompanyReconciliation, generatedBy = "ecc-core"): CutoverContractDraft {
  return {
    companyId: rec.companyId,
    expectedVersion: rec.shadow.access.planVersion ? (rec.shadow.access.planVersion.version ?? null) : null,
    readiness: rec.readiness,
    approvedBy: null,
    cutoverAt: null,
    rollbackWindowHours: 72,
    legacyFallback: true,
    tenantSafe: rec.contradictions.length === 0,
    audit: {
      generatedAt: rec.generatedAt,
      generatedBy,
      note: "Borrador de Fase 3. No ejecuta cutover ni modifica gates.",
    },
    capabilitiesSnapshot: { ...rec.entitlements },
    limitsSnapshot: Object.fromEntries(rec.limits.map(l => [l.limitKey, l.ecc])),
    executable: false,
  };
}

/* ───────────────────── 11. Rollback ───────────────────── */

export interface RollbackPlanStep {
  order: number;
  action: string;
  guarantee: string;
}

export const ROLLBACK_PLAN: readonly RollbackPlanStep[] = Object.freeze([
  { order: 1, action: "Desactivar la bandera de resolución ECC para la compañía piloto.", guarantee: "Inmediato y por compañía." },
  { order: 2, action: "Restaurar el gate legacy (`useSubscription` + `company_modules`).", guarantee: "El gate legacy nunca fue removido." },
  { order: 3, action: "Conservar el audit del intento de cutover.", guarantee: "Append-only, no se borra." },
  { order: 4, action: "Mantener plan version y entitlements ECC en shadow.", guarantee: "No se elimina ninguna entidad canónica." },
  { order: 5, action: "Revertir la resolución de acceso al valor legacy.", guarantee: "Sin pérdida de acceso para el tenant." },
  { order: 6, action: "Conservar overrides con su motivo y aprobador.", guarantee: "Append-only." },
  { order: 7, action: "No tocar billing ni suscripciones.", guarantee: "Stripe y cobros permanecen intactos." },
]);

/* ───────────────────── Resumen de flota ───────────────────── */

export interface FleetReadinessSummary {
  total: number;
  byReadiness: Record<Readiness, number>;
  criticalFindings: number;
  findingsByClass: Record<DifferenceClass, number>;
  unresolvedWithoutOwner: number;
  candidates: Array<{ companyId: string; companyName: string; reason: string }>;
  blocked: Array<{ companyId: string; companyName: string; blockers: string[] }>;
  legacyDependencies: string[];
  generatedAt: string;
}

export function summarizeFleetReadiness(recs: CompanyReconciliation[], at?: string): FleetReadinessSummary {
  const byReadiness: Record<Readiness, number> = { READY: 0, CONDITIONAL: 0, NOT_READY: 0, BLOCKED: 0 };
  const findingsByClass: Record<DifferenceClass, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 };
  const legacyDependencies = new Set<string>();
  let criticalFindings = 0;
  let unresolvedWithoutOwner = 0;

  for (const r of recs) {
    byReadiness[r.readiness] += 1;
    for (const d of r.legacyDependencies) legacyDependencies.add(d);
    for (const f of r.findings) {
      findingsByClass[f.classification] += 1;
      if (f.critical) criticalFindings += 1;
      if (!f.owner) unresolvedWithoutOwner += 1;
    }
  }

  return {
    total: recs.length,
    byReadiness,
    criticalFindings,
    findingsByClass,
    unresolvedWithoutOwner,
    candidates: recs
      .filter(r => r.cutoverCandidate)
      .map(r => ({ companyId: r.companyId, companyName: r.companyName, reason: r.candidateReason })),
    blocked: recs
      .filter(r => r.readiness === "BLOCKED" || r.readiness === "NOT_READY")
      .map(r => ({ companyId: r.companyId, companyName: r.companyName, blockers: r.blockers })),
    legacyDependencies: [...legacyDependencies],
    generatedAt: at ?? new Date().toISOString(),
  };
}

/* ───────────────────── 14. Seguridad de lectura ───────────────────── */

export type ReadinessViewerRole = "global_owner" | "tenant_admin" | "other";

export interface ReadinessVisibility {
  canSeeFleet: boolean;
  canSeeCompany: boolean;
  canApproveCutover: false;
  reason: string;
}

/** Sólo el propietario global ve readiness multi-tenant. Nadie aprueba cutover en Fase 3. */
export function readinessVisibility(
  role: ReadinessViewerRole,
  viewerCompanyIds: string[],
  targetCompanyId: string,
): ReadinessVisibility {
  if (role === "global_owner") {
    return { canSeeFleet: true, canSeeCompany: true, canApproveCutover: false, reason: "Propietario global: lectura completa, sin aprobación en Fase 3." };
  }
  if (role === "tenant_admin") {
    const own = viewerCompanyIds.includes(targetCompanyId);
    return {
      canSeeFleet: false,
      canSeeCompany: own,
      canApproveCutover: false,
      reason: own ? "Administrador del tenant: sólo su propia compañía." : "Compañía ajena: acceso denegado.",
    };
  }
  return { canSeeFleet: false, canSeeCompany: false, canApproveCutover: false, reason: "Sin permisos de lectura de readiness." };
}
