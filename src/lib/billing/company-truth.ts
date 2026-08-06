/**
 * COMPANY BILLING TRUTH LAYER — Fase 0 (solo lectura)
 *
 * Modelo puro que expone la realidad comercial y de acceso de una empresa.
 * No muta nada, no simula suscripciones, vencimientos ni facturación SaaS.
 *
 * Fuente real de entitlements: `companies.plan_code` (+ `paid_features_enabled`)
 * resuelta con el MISMO resolver que usa `useSubscription` + `ModuleGate`.
 * `subscriptions` es legacy: hoy NO gobierna el acceso.
 *
 * Referencia: docs/architecture/STAFLY_COMPANY_BILLING_SUBSCRIPTION_LIFECYCLE_FULL_AUDIT.md
 */
import {
  MODULE_PLAN_MAP,
  PLAN_DEFAULTS,
  PLAN_INFO,
  resolveEffectivePlan,
  type PlanCode,
} from "@/hooks/useSubscription";

const TIER_ORDER: PlanCode[] = ["free", "paid_manual", "enterprise"];
const tierIndex = (p: PlanCode) => Math.max(0, TIER_ORDER.indexOf(p));

/** Plan legacy declarado en `subscriptions` (vocabulario comercial distinto). */
export interface LegacySubscription {
  plan: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface CompanyModuleFlag {
  module: string;
  is_active: boolean;
}

export interface CompanyTruthInput {
  id: string;
  name: string;
  is_active: boolean;
  /** `companies.status` (active / inactive / suspended / …) */
  status: string | null;
  plan_code: string | null;
  plan_status: string | null;
  billing_status: string | null;
  paid_features_enabled: boolean;
  max_employees: number | null;
  max_admins: number | null;
  modules: CompanyModuleFlag[];
  subscription: LegacySubscription | null;
  user_count: number;
  employee_count: number;
}

export type CommercialState =
  | "not_configured"
  | "manual"
  | "legacy_subscription"
  | "inconsistent";

export type AccessState = "active" | "restricted";

export interface Contradiction {
  code: string;
  title: string;
  detail: string;
  recommendation: string;
  severity: "alta" | "media";
}

export interface CompanyEntitlements {
  /** Módulos que el plan efectivo concede por jerarquía. */
  inherited: string[];
  /** Módulos activos en `company_modules` que el plan NO concede (override que suma). */
  added: string[];
  /** Módulos desactivados en `company_modules` que el plan sí concede (override que NO se aplica hoy). */
  removedAttempted: string[];
  limits: {
    maxEmployees: number;
    maxAdmins: number;
    employeeCount: number;
    userCount: number;
  };
  /** `paid_features_enabled` elevó el plan por encima de `plan_code`. */
  paidFeaturesOverride: boolean;
}

export interface CompanyTruth {
  id: string;
  name: string;
  effectivePlan: PlanCode;
  effectivePlanLabel: string;
  /** Valor crudo almacenado en `companies.plan_code`. */
  rawPlanCode: string;
  planSource: "companies.plan_code" | "companies.paid_features_enabled";
  entitlements: CompanyEntitlements;
  approval: { implemented: false; label: string };
  access: { state: AccessState; label: string; reason: string };
  commercial: { state: CommercialState; label: string; detail: string };
  subscription: LegacySubscription | null;
  contradictions: Contradiction[];
}

export const COMMERCIAL_LABEL: Record<CommercialState, string> = {
  not_configured: "Billing no configurado",
  manual: "Gestión manual",
  legacy_subscription: "Subscription legacy",
  inconsistent: "Configuración inconsistente",
};

const ACCESS_LABEL: Record<AccessState, string> = {
  active: "Acceso activo",
  restricted: "Acceso restringido",
};

function computeEntitlements(input: CompanyTruthInput, plan: PlanCode): CompanyEntitlements {
  const activeKeys = new Set(input.modules.filter(m => m.is_active).map(m => m.module));
  const disabledKeys = new Set(input.modules.filter(m => !m.is_active).map(m => m.module));

  const inherited: string[] = [];
  const removedAttempted: string[] = [];
  for (const [moduleKey, required] of Object.entries(MODULE_PLAN_MAP)) {
    if (tierIndex(plan) >= tierIndex(required)) {
      inherited.push(moduleKey);
      if (disabledKeys.has(moduleKey)) removedAttempted.push(moduleKey);
    }
  }
  const inheritedSet = new Set(inherited);
  const added = [...activeKeys].filter(k => !inheritedSet.has(k)).sort();

  return {
    inherited: inherited.sort(),
    added,
    removedAttempted: removedAttempted.sort(),
    limits: {
      maxEmployees: input.max_employees ?? PLAN_DEFAULTS[plan].maxEmployees,
      maxAdmins: input.max_admins ?? PLAN_DEFAULTS[plan].maxAdmins,
      employeeCount: input.employee_count,
      userCount: input.user_count,
    },
    paidFeaturesOverride:
      input.paid_features_enabled && (input.plan_code ?? "free") !== "enterprise",
  };
}

function detectContradictions(
  input: CompanyTruthInput,
  plan: PlanCode,
  ent: CompanyEntitlements,
): Contradiction[] {
  const out: Contradiction[] = [];
  const sub = input.subscription;
  const status = (input.status ?? "").toLowerCase();
  const subActive = sub?.status === "active" || sub?.status === "trialing";

  if (status && status !== "active" && input.is_active) {
    out.push({
      code: "active_flag_vs_status",
      title: "Acceso abierto con estado no activo",
      detail: `\`status\` = "${status}" pero el acceso sigue abierto (\`is_active\` = true).`,
      recommendation: "Revisar manualmente cuál es el estado correcto antes de tocar el acceso.",
      severity: "alta",
    });
  }
  if (status === "active" && !input.is_active) {
    out.push({
      code: "inactive_flag_vs_active_status",
      title: "Estado activo con acceso cerrado",
      detail: "`status` = \"active\" pero el acceso está cerrado (`is_active` = false).",
      recommendation: "Confirmar si la empresa debe operar o si el estado quedó desincronizado.",
      severity: "alta",
    });
  }
  if (!sub) {
    out.push({
      code: "plan_without_subscription",
      title: "Plan sin subscription registrada",
      detail: `Plan efectivo "${PLAN_INFO[plan].label}" sin ninguna fila en subscriptions.`,
      recommendation: "Normal hoy: el acceso es manual. No crear subscription para 'cuadrar' la vista.",
      severity: "media",
    });
  }
  if (sub && subActive && !sub.stripe_customer_id) {
    out.push({
      code: "subscription_without_customer",
      title: "Subscription activa sin cliente de pago",
      detail: `Subscription "${sub.plan ?? "—"}" en estado "${sub.status}" sin customer registrado.`,
      recommendation: "Tratar como registro legacy; no representa un cobro real.",
      severity: "media",
    });
  }
  if (sub && plan === "free" && subActive && (sub.plan ?? "free") !== "free") {
    out.push({
      code: "free_with_paid_subscription",
      title: "Plan efectivo gratuito con subscription de pago",
      detail: `El acceso se rige por plan "${PLAN_INFO[plan].label}" mientras subscriptions declara "${sub.plan}".`,
      recommendation: "Definir el plan comercial real antes de conectar cualquier cobro.",
      severity: "alta",
    });
  }
  if (sub && (sub.plan ?? "").toLowerCase() !== "" && sub.plan !== input.plan_code) {
    out.push({
      code: "plan_label_mismatch",
      title: "Plan visual distinto al plan efectivo",
      detail: `companies.plan_code = "${input.plan_code ?? "—"}" vs subscriptions.plan = "${sub.plan}".`,
      recommendation: "Mostrar siempre el plan efectivo; subscriptions no gobierna entitlements.",
      severity: "media",
    });
  }
  if (ent.added.length > 0) {
    out.push({
      code: "modules_beyond_plan",
      title: "Módulos activados fuera del plan",
      detail: `${ent.added.length} módulo(s) activos que el plan efectivo no concede: ${ent.added.join(", ")}.`,
      recommendation: "Confirmar si es cortesía intencional o un override olvidado.",
      severity: "media",
    });
  }
  if (ent.removedAttempted.length > 0) {
    out.push({
      code: "module_removal_ineffective",
      title: "Módulos desactivados que siguen accesibles",
      detail: `${ent.removedAttempted.length} módulo(s) marcados inactivos pero concedidos por el plan: ${ent.removedAttempted.join(", ")}.`,
      recommendation: "El gating por plan ignora la desactivación manual; documentar o ajustar el plan.",
      severity: "media",
    });
  }
  if (ent.paidFeaturesOverride) {
    out.push({
      code: "paid_features_override",
      title: "Acceso elevado por bandera manual",
      detail: `plan_code = "${input.plan_code ?? "free"}" pero \`paid_features_enabled\` eleva el acceso a ${PLAN_INFO[plan].label}.`,
      recommendation: "Alinear plan_code con el acceso realmente concedido.",
      severity: "media",
    });
  }
  if (input.is_active) {
    out.push({
      code: "active_without_approval",
      title: "Tenant activo sin modelo de aprobación",
      detail: "No existen estados draft / needs_review / approved / rejected en el modelo de datos.",
      recommendation: "Fase posterior: introducir aprobación explícita previa a la activación.",
      severity: "media",
    });
  }
  return out;
}

function computeCommercial(
  input: CompanyTruthInput,
  contradictions: Contradiction[],
): CompanyTruth["commercial"] {
  const sub = input.subscription;
  const hasHardContradiction = contradictions.some(c => c.severity === "alta");
  if (hasHardContradiction) {
    return {
      state: "inconsistent",
      label: COMMERCIAL_LABEL.inconsistent,
      detail: "Las fuentes comerciales se contradicen entre sí.",
    };
  }
  if (sub) {
    return {
      state: "legacy_subscription",
      label: COMMERCIAL_LABEL.legacy_subscription,
      detail: "Existe una fila en subscriptions que no gobierna el acceso.",
    };
  }
  if ((input.billing_status ?? "none") !== "none") {
    return {
      state: "manual",
      label: COMMERCIAL_LABEL.manual,
      detail: `Estado comercial administrado manualmente (billing_status = "${input.billing_status}").`,
    };
  }
  return {
    state: "not_configured",
    label: COMMERCIAL_LABEL.not_configured,
    detail: "No hay facturación SaaS conectada para esta empresa.",
  };
}

export function buildCompanyTruth(input: CompanyTruthInput): CompanyTruth {
  const plan = resolveEffectivePlan(input.plan_code ?? null, input.paid_features_enabled);
  const entitlements = computeEntitlements(input, plan);
  const contradictions = detectContradictions(input, plan, entitlements);
  const commercial = computeCommercial(input, contradictions);

  const accessState: AccessState = input.is_active ? "active" : "restricted";

  return {
    id: input.id,
    name: input.name,
    effectivePlan: plan,
    effectivePlanLabel: PLAN_INFO[plan].label,
    rawPlanCode: input.plan_code ?? "free",
    planSource: entitlements.paidFeaturesOverride
      ? "companies.paid_features_enabled"
      : "companies.plan_code",
    entitlements,
    approval: { implemented: false, label: "Modelo de aprobación no implementado" },
    access: {
      state: accessState,
      label: ACCESS_LABEL[accessState],
      reason: input.is_active
        ? "`is_active` = true (activación manual, sin aprobación formal)."
        : "`is_active` = false: la empresa no puede operar.",
    },
    commercial,
    subscription: input.subscription,
    contradictions,
  };
}

/** Resumen honesto para la cabecera del Command Center. */
export function summarizeTruth(list: CompanyTruth[]) {
  return {
    total: list.length,
    needsReview: list.filter(t => t.contradictions.some(c => c.severity === "alta")).length,
    withContradictions: list.filter(t => t.contradictions.length > 0).length,
    billingNotConfigured: list.filter(t => t.commercial.state === "not_configured").length,
    legacySubscriptions: list.filter(t => t.commercial.state === "legacy_subscription").length,
    restricted: list.filter(t => t.access.state === "restricted").length,
    approvalImplemented: false,
  };
}
