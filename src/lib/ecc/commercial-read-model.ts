/**
 * ECC — FASE 1. CANONICAL COMMERCIAL READ MODEL (solo lectura).
 *
 * Modelo puro, sin I/O y sin efectos, que consolida en UNA sola lectura el
 * contrato comercial efectivo de una company:
 *
 *   identidad · approval · commercial · access · plan efectivo · subscription
 *   legacy · entitlements · límites · overrides · contradicciones · billing
 *   readiness · partner · warnings · source attribution · versión.
 *
 * Reglas duras de esta fase:
 *  - NO gobierna nada: es shadow. Los gates reales siguen en `useSubscription`
 *    + `ModuleGate` + `company_modules`.
 *  - NO inventa datos: toda capability declara su fuente real.
 *  - NO corrige contradicciones: las expone.
 *
 * Referencias:
 *  - docs/architecture/ECOSYSTEM_COMMERCIAL_CONTRACT_ECC_V1.md
 *  - docs/architecture/STAFLY_COMPANY_BILLING_SUBSCRIPTION_LIFECYCLE_FULL_AUDIT.md
 *  - docs/qa/COMPANY_BILLING_TRUTH_LAYER_PHASE_0.md
 *  - docs/qa/COMPANY_APPROVAL_ACCESS_STATE_PHASE_1.md
 */
import {
  MODULE_PLAN_MAP,
  PLAN_DEFAULTS,
  PLAN_INFO,
  resolveEffectivePlan,
  type PlanCode,
} from "@/hooks/useSubscription";
import {
  buildCompanyTruth,
  type CompanyModuleFlag,
  type LegacySubscription,
  type CompanyTruthInput,
} from "@/lib/billing/company-truth";
import {
  ACCESS_DESCRIPTION,
  CAPABILITIES,
  NEVER_BLOCKED,
  accessWarning,
  canDo,
  normalizeLifecycle,
  type AccessState,
  type ApprovalState,
  type Capability,
  type CommercialState,
  type CompanyLifecycle,
} from "@/lib/company/access-state";

const TIER_ORDER: PlanCode[] = ["free", "paid_manual", "enterprise"];
const tierIndex = (p: PlanCode) => Math.max(0, TIER_ORDER.indexOf(p));

/* ────────────────────────── Source attribution ────────────────────────── */

export const VALUE_SOURCES = [
  "plan_code",
  "company_modules",
  "subscription_legacy",
  "access_state",
  "approval_state",
  "manual_override",
  "default",
  "unknown",
] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export const SOURCE_LABEL: Record<ValueSource, string> = {
  plan_code: "companies.plan_code",
  company_modules: "company_modules (override)",
  subscription_legacy: "subscriptions (legacy)",
  access_state: "companies.access_state",
  approval_state: "companies.approval_state",
  manual_override: "override manual (paid_features_enabled / límites)",
  default: "valor por defecto del plan",
  unknown: "origen desconocido",
};

export type Confidence = "alta" | "media" | "baja";

/** Una capability nunca es un booleano suelto: siempre se explica. */
export interface CapabilityResolution {
  key: string;
  enabled: boolean;
  source: ValueSource;
  reason: string;
  limit: number | null;
  override: boolean;
  confidence: Confidence;
  contradiction: boolean;
}

export interface LimitResolution {
  key: "max_employees" | "max_admins";
  value: number;
  current: number;
  source: ValueSource;
  exceeded: boolean;
  reason: string;
}

export type BillingReadiness =
  | "not_configured"
  | "manual"
  | "legacy_partial"
  | "ready_for_subscription"
  | "inconsistent"
  | "blocked";

export const BILLING_READINESS_LABEL: Record<BillingReadiness, string> = {
  not_configured: "Sin configurar",
  manual: "Gestión manual",
  legacy_partial: "Legacy parcial",
  ready_for_subscription: "Listo para suscripción",
  inconsistent: "Inconsistente",
  blocked: "Bloqueado",
};

export const BILLING_REQUIREMENTS = [
  "approval",
  "contract",
  "plan_version",
  "billing_contact",
  "customer_mapping",
  "payment_method",
  "webhook",
  "currency",
  "tax_data",
] as const;
export type BillingRequirement = (typeof BILLING_REQUIREMENTS)[number];

export const BILLING_REQUIREMENT_LABEL: Record<BillingRequirement, string> = {
  approval: "Aprobación humana",
  contract: "Contrato comercial",
  plan_version: "Versión de plan",
  billing_contact: "Contacto de facturación",
  customer_mapping: "Mapeo de cliente de pago",
  payment_method: "Método de pago",
  webhook: "Webhook de facturación",
  currency: "Moneda",
  tax_data: "Datos fiscales",
};

export interface EccContradiction {
  code: string;
  title: string;
  detail: string;
  recommendation: string;
  severity: "alta" | "media";
  sources: ValueSource[];
}

export interface EccPartner {
  id: string | null;
  name: string | null;
  relationship: "none" | "reseller" | "referral" | "unknown";
  consistent: boolean;
}

/* ─────────────────────────────── Entrada ─────────────────────────────── */

export interface EccReadModelInput {
  /** Agrupador comercial. Hoy no existe tabla: se deriva, nunca se inventa. */
  commercialAccount?: {
    id: string | null;
    name: string | null;
    companyIds: string[];
    /** true cuando la agrupación es inferida y no persistida. */
    derived: boolean;
  } | null;
  company: {
    id: string;
    name: string;
    slug?: string | null;
    is_active: boolean;
    status: string | null;
    approval_state?: string | null;
    access_state?: string | null;
    commercial_state?: string | null;
    rejection_reason?: string | null;
    access_state_reason?: string | null;
    plan_code: string | null;
    plan_status: string | null;
    billing_status: string | null;
    paid_features_enabled: boolean;
    max_employees: number | null;
    max_admins: number | null;
    version?: number | null;
  };
  modules: CompanyModuleFlag[];
  subscription: LegacySubscription | null;
  userCount: number;
  employeeCount: number;
  partner?: EccPartner | null;
  generatedAt?: string;
}

/* ─────────────────────────────── Salida ─────────────────────────────── */

export interface EccReadModel {
  commercialAccount: {
    id: string | null;
    name: string | null;
    companyIds: string[];
    derived: boolean;
    scope: "account" | "company";
  };
  company: { id: string; name: string; slug: string | null };
  approvalState: { value: ApprovalState; source: ValueSource; reason: string };
  commercialState: { value: CommercialState; source: ValueSource; reason: string };
  accessState: { value: AccessState; source: ValueSource; reason: string };
  effectivePlan: PlanCode;
  effectivePlanLabel: string;
  planSource: ValueSource;
  subscriptions: LegacySubscription[];
  effectiveEntitlements: Record<string, CapabilityResolution>;
  entitlementSources: Record<string, ValueSource>;
  /** Capacidades de ciclo de vida (operar / leer / exportar), no de plan. */
  lifecycleCapabilities: Record<Capability, CapabilityResolution>;
  effectiveLimits: Record<"max_employees" | "max_admins", LimitResolution>;
  limitSources: Record<"max_employees" | "max_admins", ValueSource>;
  overrides: Array<{ key: string; kind: "module_added" | "module_removed" | "plan_elevation" | "limit"; detail: string }>;
  partner: EccPartner;
  billingReadiness: { state: BillingReadiness; missing: BillingRequirement[]; detail: string };
  contradictions: EccContradiction[];
  warnings: string[];
  legacySources: string[];
  legalAccessPreserved: boolean;
  version: number | null;
  generatedAt: string;
}

/* ───────────────────────────── Resolución ───────────────────────────── */

function resolveModuleCapability(
  moduleKey: string,
  plan: PlanCode,
  active: Set<string>,
  disabled: Set<string>,
  lifecycle: CompanyLifecycle,
): CapabilityResolution {
  const required = MODULE_PLAN_MAP[moduleKey] ?? "free";
  const planGrants = tierIndex(plan) >= tierIndex(required);
  const moduleActive = active.has(moduleKey);
  const moduleDisabled = disabled.has(moduleKey);

  // El gate real (useSubscription.canAccessModule): plan OR override activo.
  const enabled = planGrants || moduleActive;

  let source: ValueSource = "default";
  let reason = "";
  let contradiction = false;
  let override = false;
  let confidence: Confidence = "alta";

  if (planGrants && moduleDisabled) {
    source = "plan_code";
    reason = `El plan ${PLAN_INFO[plan].label} lo concede aunque company_modules lo marca inactivo; la desactivación no se aplica.`;
    contradiction = true;
    override = true;
    confidence = "media";
  } else if (planGrants) {
    source = "plan_code";
    reason = `Concedido por el plan efectivo ${PLAN_INFO[plan].label} (requiere ${PLAN_INFO[required].label}).`;
  } else if (moduleActive) {
    source = "company_modules";
    reason = `El plan ${PLAN_INFO[plan].label} no lo concede; está habilitado por override en company_modules.`;
    contradiction = true;
    override = true;
    confidence = "media";
  } else {
    source = "plan_code";
    reason = `Requiere ${PLAN_INFO[required].label}; el plan efectivo es ${PLAN_INFO[plan].label}.`;
  }

  // El ciclo de vida puede impedir la operación aunque el entitlement exista.
  if (enabled && lifecycle.approval_state !== "approved") {
    reason += " La empresa no está aprobada: la operación nueva queda bloqueada por access-state.";
    confidence = "media";
  }

  return {
    key: moduleKey,
    enabled,
    source,
    reason,
    limit: null,
    override,
    confidence,
    contradiction,
  };
}

function resolveLifecycleCapability(
  cap: Capability,
  lifecycle: CompanyLifecycle,
): CapabilityResolution {
  const enabled = canDo(lifecycle, cap);
  const never = NEVER_BLOCKED.includes(cap);
  if (never) {
    return {
      key: cap,
      enabled: true,
      source: "access_state",
      reason: "Obligación legal / acceso a datos propios: nunca se bloquea.",
      limit: null,
      override: false,
      confidence: "alta",
      contradiction: false,
    };
  }
  if (lifecycle.approval_state !== "approved") {
    return {
      key: cap,
      enabled,
      source: "approval_state",
      reason:
        lifecycle.approval_state === "rejected"
          ? `Solicitud rechazada: ${lifecycle.rejection_reason ?? "sin motivo registrado"}.`
          : "Pendiente de aprobación humana.",
      limit: null,
      override: false,
      confidence: "alta",
      contradiction: false,
    };
  }
  return {
    key: cap,
    enabled,
    source: "access_state",
    reason: ACCESS_DESCRIPTION[lifecycle.access_state],
    limit: null,
    override: false,
    confidence: "alta",
    contradiction: false,
  };
}

function resolveBillingReadiness(
  input: EccReadModelInput,
  lifecycle: CompanyLifecycle,
  contradictions: EccContradiction[],
): EccReadModel["billingReadiness"] {
  const sub = input.subscription;
  const missing: BillingRequirement[] = [];
  if (lifecycle.approval_state !== "approved") missing.push("approval");
  missing.push("contract", "plan_version"); // no existen todavía en el modelo de datos
  missing.push("billing_contact");
  if (!sub?.stripe_customer_id) missing.push("customer_mapping");
  missing.push("payment_method", "webhook", "currency", "tax_data");

  if (lifecycle.approval_state === "rejected" || lifecycle.access_state === "cancelled") {
    return {
      state: "blocked",
      missing,
      detail: "La empresa está rechazada o cancelada: no puede iniciarse ningún cobro.",
    };
  }
  if (contradictions.some(c => c.severity === "alta")) {
    return {
      state: "inconsistent",
      missing,
      detail: "Hay contradicciones de severidad alta: resolverlas antes de facturar.",
    };
  }
  if (sub && sub.stripe_customer_id) {
    return {
      state: "ready_for_subscription",
      missing,
      detail: "Existe mapeo de cliente de pago; falta el contrato y el resto del contrato comercial.",
    };
  }
  if (sub) {
    return {
      state: "legacy_partial",
      missing,
      detail: "Subscription legacy registrada sin cliente de pago: no representa un cobro real.",
    };
  }
  if ((input.company.billing_status ?? "none") !== "none") {
    return {
      state: "manual",
      missing,
      detail: `Condición comercial administrada manualmente (billing_status = "${input.company.billing_status}").`,
    };
  }
  return {
    state: "not_configured",
    missing,
    detail: "No hay facturación conectada para esta empresa.",
  };
}

function detectEccContradictions(
  input: EccReadModelInput,
  plan: PlanCode,
  lifecycle: CompanyLifecycle,
  moduleCaps: Record<string, CapabilityResolution>,
  limits: EccReadModel["effectiveLimits"],
): EccContradiction[] {
  const out: EccContradiction[] = [];
  const sub = input.subscription;
  const subActive = sub?.status === "active" || sub?.status === "trialing";
  const c = input.company;
  const push = (x: EccContradiction) => out.push(x);

  if (sub && (sub.plan ?? "") !== "" && sub.plan !== (c.plan_code ?? "free")) {
    push({
      code: "plan_vs_subscription_plan",
      title: "Plan efectivo distinto al plan de subscription",
      detail: `plan_code = "${c.plan_code ?? "free"}" vs subscriptions.plan = "${sub.plan}".`,
      recommendation: "El acceso lo gobierna plan_code; subscriptions es legacy y no debe mostrarse como verdad.",
      severity: "media",
      sources: ["plan_code", "subscription_legacy"],
    });
  }
  if (sub && subActive && !sub.stripe_customer_id) {
    push({
      code: "active_subscription_without_customer",
      title: "Subscription activa sin customer",
      detail: `Subscription "${sub.plan ?? "—"}" en estado "${sub.status}" sin stripe_customer_id.`,
      recommendation: "Tratar como registro legacy; no habilita cobro.",
      severity: "media",
      sources: ["subscription_legacy"],
    });
  }
  if (c.is_active && lifecycle.approval_state !== "approved") {
    push({
      code: "active_without_approval",
      title: "Empresa activa sin aprobación",
      detail: `is_active = true con approval_state = "${lifecycle.approval_state}".`,
      recommendation: "Someter a revisión humana o corregir el estado de aprobación.",
      severity: "alta",
      sources: ["approval_state"],
    });
  }
  if (lifecycle.access_state === "active" && lifecycle.commercial_state === "cancelled") {
    push({
      code: "access_active_commercial_cancelled",
      title: "Acceso activo con condición comercial cancelada",
      detail: "access_state = active mientras commercial_state = cancelled.",
      recommendation: "Definir si corresponde grace, restricted o reactivación comercial.",
      severity: "alta",
      sources: ["access_state"],
    });
  }
  for (const cap of Object.values(moduleCaps)) {
    if (cap.contradiction) {
      push({
        code: `module_override_${cap.key}`,
        title: `Override contradictorio en módulo ${cap.key}`,
        detail: cap.reason,
        recommendation: "Alinear el plan con el override o retirar el override.",
        severity: "media",
        sources: ["plan_code", "company_modules"],
      });
    }
  }
  for (const l of Object.values(limits)) {
    if (l.exceeded) {
      push({
        code: `limit_exceeded_${l.key}`,
        title: `Consumo por encima del límite (${l.key})`,
        detail: `Consumo ${l.current} sobre un límite de ${l.value}.`,
        recommendation: "Revisar el plan efectivo o el límite manual antes de facturar.",
        severity: "media",
        sources: [l.source],
      });
    }
  }
  if (plan === "enterprise" && !sub) {
    push({
      code: "enterprise_without_subscription",
      title: "Enterprise sin subscription",
      detail: "Plan efectivo enterprise sin ninguna fila en subscriptions.",
      recommendation: "Normal hoy (acceso manual). No crear subscription para cuadrar la vista.",
      severity: "media",
      sources: ["plan_code"],
    });
  }
  if (plan === "free" && subActive && (sub?.plan ?? "free") !== "free") {
    push({
      code: "free_with_paid_subscription",
      title: "Plan efectivo free con subscription de pago",
      detail: `plan efectivo free mientras subscriptions declara "${sub?.plan}".`,
      recommendation: "Definir el plan comercial real antes de conectar cobros.",
      severity: "alta",
      sources: ["plan_code", "subscription_legacy"],
    });
  }
  if ((c.status ?? "").toLowerCase() === "inactive" && c.is_active) {
    push({
      code: "inactive_status_with_active_flag",
      title: "status inactive con is_active = true",
      detail: "El acceso sigue abierto pese al estado inactivo.",
      recommendation: "Resolver manualmente cuál es el estado correcto.",
      severity: "alta",
      sources: ["access_state", "unknown"],
    });
  }
  if (input.partner && input.partner.relationship !== "none" && !input.partner.consistent) {
    push({
      code: "partner_data_inconsistent",
      title: "Datos de partner inconsistentes",
      detail: `Relación "${input.partner.relationship}" sin identidad de partner completa.`,
      recommendation: "Completar o retirar la relación de partner antes de facturar a terceros.",
      severity: "media",
      sources: ["unknown"],
    });
  }
  return out;
}

/** Lectura canónica del contrato comercial efectivo de una company. */
export function getCommercialContractReadModel(input: EccReadModelInput): EccReadModel {
  const c = input.company;
  const lifecycle = normalizeLifecycle({
    approval_state: c.approval_state,
    access_state: c.access_state,
    commercial_state: c.commercial_state,
    is_active: c.is_active,
    rejection_reason: c.rejection_reason,
    access_state_reason: c.access_state_reason,
    version: c.version,
  });

  const plan = resolveEffectivePlan(c.plan_code ?? null, c.paid_features_enabled);
  const planElevated = c.paid_features_enabled && (c.plan_code ?? "free") !== "enterprise";
  const planSource: ValueSource = planElevated ? "manual_override" : "plan_code";

  const active = new Set(input.modules.filter(m => m.is_active).map(m => m.module));
  const disabled = new Set(input.modules.filter(m => !m.is_active).map(m => m.module));

  const moduleKeys = Array.from(new Set([...Object.keys(MODULE_PLAN_MAP), ...active, ...disabled])).sort();
  const effectiveEntitlements: Record<string, CapabilityResolution> = {};
  for (const key of moduleKeys) {
    effectiveEntitlements[key] = resolveModuleCapability(key, plan, active, disabled, lifecycle);
  }
  const entitlementSources = Object.fromEntries(
    Object.entries(effectiveEntitlements).map(([k, v]) => [k, v.source]),
  ) as Record<string, ValueSource>;

  const lifecycleCapabilities = Object.fromEntries(
    CAPABILITIES.map(cap => [cap, resolveLifecycleCapability(cap, lifecycle)]),
  ) as Record<Capability, CapabilityResolution>;

  const maxEmployees = c.max_employees ?? PLAN_DEFAULTS[plan].maxEmployees;
  const maxAdmins = c.max_admins ?? PLAN_DEFAULTS[plan].maxAdmins;
  const effectiveLimits: EccReadModel["effectiveLimits"] = {
    max_employees: {
      key: "max_employees",
      value: maxEmployees,
      current: input.employeeCount,
      source: c.max_employees != null ? "manual_override" : "default",
      exceeded: Number.isFinite(maxEmployees) && input.employeeCount > maxEmployees,
      reason:
        c.max_employees != null
          ? "Límite fijado manualmente en companies.max_employees."
          : `Límite por defecto del plan ${PLAN_INFO[plan].label}.`,
    },
    max_admins: {
      key: "max_admins",
      value: maxAdmins,
      current: input.userCount,
      source: c.max_admins != null ? "manual_override" : "default",
      exceeded: Number.isFinite(maxAdmins) && input.userCount > maxAdmins,
      reason:
        c.max_admins != null
          ? "Límite fijado manualmente en companies.max_admins."
          : `Límite por defecto del plan ${PLAN_INFO[plan].label}.`,
    },
  };

  const contradictions = detectEccContradictions(input, plan, lifecycle, effectiveEntitlements, effectiveLimits);

  const overrides: EccReadModel["overrides"] = [];
  for (const cap of Object.values(effectiveEntitlements)) {
    if (cap.override && cap.source === "company_modules") {
      overrides.push({ key: cap.key, kind: "module_added", detail: cap.reason });
    } else if (cap.override && cap.source === "plan_code") {
      overrides.push({ key: cap.key, kind: "module_removed", detail: cap.reason });
    }
  }
  if (planElevated) {
    overrides.push({
      key: "paid_features_enabled",
      kind: "plan_elevation",
      detail: `plan_code = "${c.plan_code ?? "free"}" elevado a ${PLAN_INFO[plan].label} por bandera manual.`,
    });
  }
  for (const l of Object.values(effectiveLimits)) {
    if (l.source === "manual_override") {
      overrides.push({ key: l.key, kind: "limit", detail: l.reason });
    }
  }

  const billingReadiness = resolveBillingReadiness(input, lifecycle, contradictions);

  const warnings: string[] = [];
  const lifeWarning = accessWarning(lifecycle);
  if (lifeWarning) warnings.push(lifeWarning);
  if (billingReadiness.state === "inconsistent") warnings.push("Contrato comercial inconsistente: revisar contradicciones.");
  if (input.subscription) warnings.push("Existe una subscription legacy que no gobierna entitlements.");
  if (Object.values(effectiveEntitlements).some(x => x.confidence !== "alta")) {
    warnings.push("Algunas capacidades dependen de overrides: confianza media.");
  }

  const legacySources: string[] = [];
  if (input.subscription) legacySources.push("subscriptions");
  if (input.modules.length > 0) legacySources.push("company_modules");
  legacySources.push("companies.plan_code", "companies.paid_features_enabled", "useSubscription/ModuleGate");

  const legalAccessPreserved = NEVER_BLOCKED.every(cap => lifecycleCapabilities[cap].enabled);

  const account = input.commercialAccount ?? {
    id: null,
    name: null,
    companyIds: [c.id],
    derived: true,
  };

  return {
    commercialAccount: {
      id: account.id,
      name: account.name,
      companyIds: account.companyIds.length > 0 ? account.companyIds : [c.id],
      derived: account.derived,
      scope: account.companyIds.length > 1 ? "account" : "company",
    },
    company: { id: c.id, name: c.name, slug: c.slug ?? null },
    approvalState: {
      value: lifecycle.approval_state,
      source: "approval_state",
      reason:
        lifecycle.approval_state === "rejected"
          ? `Rechazada: ${lifecycle.rejection_reason ?? "sin motivo registrado"}.`
          : `Estado de aprobación registrado en companies.approval_state.`,
    },
    commercialState: {
      value: lifecycle.commercial_state,
      source: "access_state",
      reason: "Condición comercial registrada en companies.commercial_state (sin pasarela conectada).",
    },
    accessState: {
      value: lifecycle.access_state,
      source: "access_state",
      reason: lifecycle.access_state_reason || ACCESS_DESCRIPTION[lifecycle.access_state],
    },
    effectivePlan: plan,
    effectivePlanLabel: PLAN_INFO[plan].label,
    planSource,
    subscriptions: input.subscription ? [input.subscription] : [],
    effectiveEntitlements,
    entitlementSources,
    lifecycleCapabilities,
    effectiveLimits,
    limitSources: {
      max_employees: effectiveLimits.max_employees.source,
      max_admins: effectiveLimits.max_admins.source,
    },
    overrides,
    partner: input.partner ?? { id: null, name: null, relationship: "none", consistent: true },
    billingReadiness,
    contradictions,
    warnings,
    legacySources,
    legalAccessPreserved,
    version: c.version ?? null,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

/* ─────────────────────── Shadow comparison (Fase 1) ─────────────────────── */

export interface ShadowDifference {
  kind: "capability" | "limit" | "plan";
  key: string;
  legacy: string;
  ecc: string;
  detail: string;
}

/**
 * Compara el read model ECC contra la resolución legacy que hoy gobierna
 * (`useSubscription.canAccessModule` = plan OR company_modules activo).
 * Cero efectos: sólo reporta diferencias.
 */
export function compareWithLegacy(model: EccReadModel, input: EccReadModelInput): ShadowDifference[] {
  const diffs: ShadowDifference[] = [];
  const plan = resolveEffectivePlan(input.company.plan_code ?? null, input.company.paid_features_enabled);
  const active = new Set(input.modules.filter(m => m.is_active).map(m => m.module));

  if (plan !== model.effectivePlan) {
    diffs.push({
      kind: "plan",
      key: "effective_plan",
      legacy: plan,
      ecc: model.effectivePlan,
      detail: "El plan efectivo difiere entre el resolver legacy y el ECC.",
    });
  }

  for (const [key, cap] of Object.entries(model.effectiveEntitlements)) {
    const required = MODULE_PLAN_MAP[key];
    const legacyEnabled = required ? tierIndex(plan) >= tierIndex(required) || active.has(key) : true;
    if (legacyEnabled !== cap.enabled) {
      diffs.push({
        kind: "capability",
        key,
        legacy: String(legacyEnabled),
        ecc: String(cap.enabled),
        detail: cap.reason,
      });
    }
  }

  const legacyLimits = {
    max_employees: input.company.max_employees ?? PLAN_DEFAULTS[plan].maxEmployees,
    max_admins: input.company.max_admins ?? PLAN_DEFAULTS[plan].maxAdmins,
  };
  for (const key of ["max_employees", "max_admins"] as const) {
    if (legacyLimits[key] !== model.effectiveLimits[key].value) {
      diffs.push({
        kind: "limit",
        key,
        legacy: String(legacyLimits[key]),
        ecc: String(model.effectiveLimits[key].value),
        detail: model.effectiveLimits[key].reason,
      });
    }
  }
  return diffs;
}

/* ───────────────────────────── Observabilidad ───────────────────────────── */

export interface EccAdoptionMetrics {
  companiesAnalyzed: number;
  contradictionsByCode: Record<string, number>;
  contradictionsHigh: number;
  capabilitiesDiffering: number;
  limitsDiffering: number;
  billingReadiness: Record<BillingReadiness, number>;
  unknownSources: number;
  legacyDependencies: Record<string, number>;
  legalAccessBreaches: number;
}

export function summarizeEcc(
  entries: Array<{ model: EccReadModel; diffs: ShadowDifference[] }>,
): EccAdoptionMetrics {
  const metrics: EccAdoptionMetrics = {
    companiesAnalyzed: entries.length,
    contradictionsByCode: {},
    contradictionsHigh: 0,
    capabilitiesDiffering: 0,
    limitsDiffering: 0,
    billingReadiness: {
      not_configured: 0,
      manual: 0,
      legacy_partial: 0,
      ready_for_subscription: 0,
      inconsistent: 0,
      blocked: 0,
    },
    unknownSources: 0,
    legacyDependencies: {},
    legalAccessBreaches: 0,
  };

  for (const { model, diffs } of entries) {
    for (const x of model.contradictions) {
      metrics.contradictionsByCode[x.code] = (metrics.contradictionsByCode[x.code] ?? 0) + 1;
      if (x.severity === "alta") metrics.contradictionsHigh += 1;
    }
    metrics.capabilitiesDiffering += diffs.filter(d => d.kind === "capability").length;
    metrics.limitsDiffering += diffs.filter(d => d.kind === "limit").length;
    metrics.billingReadiness[model.billingReadiness.state] += 1;
    metrics.unknownSources += Object.values(model.entitlementSources).filter(s => s === "unknown").length;
    for (const dep of model.legacySources) {
      metrics.legacyDependencies[dep] = (metrics.legacyDependencies[dep] ?? 0) + 1;
    }
    if (!model.legalAccessPreserved) metrics.legalAccessBreaches += 1;
  }
  return metrics;
}

/** Puente con la Fase 0: mismo input, para no duplicar el detector existente. */
export function toCompanyTruthInput(input: EccReadModelInput): CompanyTruthInput {
  return {
    id: input.company.id,
    name: input.company.name,
    is_active: input.company.is_active,
    status: input.company.status,
    plan_code: input.company.plan_code,
    plan_status: input.company.plan_status,
    billing_status: input.company.billing_status,
    paid_features_enabled: input.company.paid_features_enabled,
    max_employees: input.company.max_employees,
    max_admins: input.company.max_admins,
    modules: input.modules,
    subscription: input.subscription,
    user_count: input.userCount,
    employee_count: input.employeeCount,
  };
}

export const buildCompanyTruthFromEccInput = (input: EccReadModelInput) =>
  buildCompanyTruth(toCompanyTruthInput(input));
