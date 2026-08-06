/**
 * ECC — FASE 2. RESOLVER CANÓNICO DE ENTITLEMENTS Y LÍMITES.
 *
 * Ninguna respuesta es un booleano suelto: siempre trae fuente, razón,
 * confianza, contradicción, versión de plan, override, límite, dependencias
 * y momento efectivo.
 *
 * SHADOW: este resolver no gobierna ningún gate real. `useSubscription`,
 * `ModuleGate` y `company_modules` siguen decidiendo el acceso.
 */
import {
  CAPABILITY_CATALOG,
  capabilityDependencyChain,
  getCapability,
  type CapabilityDefinition,
  type EccProduct,
} from "./capability-catalog";
import {
  LIMIT_LABEL,
  getPlanVersionById,
  resolvePlanVersionAt,
  type PlanLimitSpec,
  type PlanVersion,
} from "./plan-versions";
import { winningOverride, type EntitlementOverride } from "./overrides";

export type EntitlementSource =
  | "plan_version"
  | "override"
  | "dependency"
  | "catalog_default"
  | "not_in_catalog";

export const ENTITLEMENT_SOURCE_LABEL: Record<EntitlementSource, string> = {
  plan_version: "versión de plan",
  override: "override aprobado",
  dependency: "dependencia no satisfecha",
  catalog_default: "valor por defecto del catálogo",
  not_in_catalog: "capacidad no catalogada",
};

export type EccConfidence = "alta" | "media" | "baja";

export interface CapabilityDecision {
  key: string;
  product: EccProduct | null;
  result: boolean;
  source: EntitlementSource;
  reason: string;
  confidence: EccConfidence;
  contradiction: boolean;
  planVersion: { id: string; planKey: string; version: number } | null;
  override: { id: string; reason: string; approvedBy: string | null; effectiveUntil: string | null } | null;
  limit: LimitDecision | null;
  dependencies: Array<{ key: string; satisfied: boolean }>;
  missingConfig: string[];
  effectiveAt: string;
}

export interface LimitDecision {
  key: string;
  label: string;
  value: number;
  scope: "company" | "account";
  enforcement: "hard" | "soft";
  warningThreshold: number;
  overagePolicy: PlanLimitSpec["overagePolicy"];
  measurementWindow: PlanLimitSpec["measurementWindow"];
  source: "plan_version" | "override" | "unset";
  reason: string;
  planVersion: string | null;
  override: string | null;
  current: number | null;
  exceeded: boolean;
  warning: boolean;
  effectiveAt: string;
}

/** Contexto de resolución de una company dentro de una cuenta comercial. */
export interface EccResolutionContext {
  accountId: string | null;
  companyId: string;
  /** Contrato: plan version asignada al contrato (id) o plan key para resolver por fecha. */
  contract: { planVersionId?: string | null; planKey?: string | null; product: EccProduct };
  overrides: EntitlementOverride[];
  /** Uso actual por limit_key, para evaluar excedidos. */
  usage?: Record<string, number>;
  at?: string;
  /** Productos habilitados para la cuenta: nada se hereda automáticamente. */
  products?: EccProduct[];
}

function resolveContractPlanVersion(ctx: EccResolutionContext): PlanVersion | null {
  if (ctx.contract.planVersionId) {
    const pinned = getPlanVersionById(ctx.contract.planVersionId);
    if (pinned) return pinned;
  }
  if (ctx.contract.planKey) return resolvePlanVersionAt(ctx.contract.planKey, ctx.at ?? new Date());
  return null;
}

const scopedOverrides = (ctx: EccResolutionContext) =>
  ctx.overrides.filter(
    o =>
      (o.target.scope === "company" && o.target.id === ctx.companyId) ||
      (o.target.scope === "account" && !!ctx.accountId && o.target.id === ctx.accountId),
  );

/** Productos alcanzables: shared siempre + los contratados explícitamente. */
function allowedProducts(ctx: EccResolutionContext): Set<EccProduct> {
  const set = new Set<EccProduct>(["shared", ctx.contract.product]);
  for (const p of ctx.products ?? []) set.add(p);
  return set;
}

/* ─────────────────────────── resolveLimits ─────────────────────────── */

export function resolveLimits(ctx: EccResolutionContext): Record<string, LimitDecision> {
  const at = ctx.at ?? new Date().toISOString();
  const plan = resolveContractPlanVersion(ctx);
  const overrides = scopedOverrides(ctx);
  const out: Record<string, LimitDecision> = {};

  const keys = new Set<string>([
    ...(plan?.limits.map(l => l.limitKey) ?? []),
    ...overrides.filter(o => o.kind === "limit").map(o => o.key),
  ]);

  for (const key of keys) {
    const spec = plan?.limits.find(l => l.limitKey === key) ?? null;
    const ovr = winningOverride(overrides, "limit", key, at);
    const current = ctx.usage?.[key] ?? null;
    const value = typeof ovr?.value === "number" ? ovr.value : spec?.value ?? Number.POSITIVE_INFINITY;
    const source: LimitDecision["source"] = ovr ? "override" : spec ? "plan_version" : "unset";
    const enforcement = spec?.enforcement ?? "soft";
    const warningThreshold = spec?.warningThreshold ?? 0.8;
    out[key] = {
      key,
      label: LIMIT_LABEL[key] ?? key,
      value,
      scope: spec?.scope ?? "company",
      enforcement,
      warningThreshold,
      overagePolicy: spec?.overagePolicy ?? "warn",
      measurementWindow: spec?.measurementWindow ?? "instant",
      source,
      reason: ovr
        ? `Override vigente hasta ${ovr.effectiveUntil ?? "sin vencimiento"}: ${ovr.reason}`
        : spec
          ? `Definido por ${plan?.id} (${enforcement}).`
          : "Sin límite declarado en la versión de plan.",
      planVersion: plan?.id ?? null,
      override: ovr?.id ?? null,
      current,
      exceeded: current !== null && Number.isFinite(value) && current > value,
      warning:
        current !== null &&
        Number.isFinite(value) &&
        current <= value &&
        current >= value * warningThreshold,
      effectiveAt: at,
    };
  }
  return out;
}

/* ────────────────────────── resolveEntitlements ────────────────────────── */

export function resolveEntitlements(ctx: EccResolutionContext): Record<string, CapabilityDecision> {
  const at = ctx.at ?? new Date().toISOString();
  const plan = resolveContractPlanVersion(ctx);
  const overrides = scopedOverrides(ctx);
  const limits = resolveLimits(ctx);
  const products = allowedProducts(ctx);
  const granted = new Set(plan?.capabilities ?? []);

  // Paso 1 — decisión directa (plan + override), sin dependencias todavía.
  const direct = new Map<string, { value: boolean; source: EntitlementSource; ovr: EntitlementOverride | null; contradiction: boolean }>();
  const catalog = CAPABILITY_CATALOG.filter(c => products.has(c.product));

  for (const def of catalog) {
    const ovr = winningOverride(overrides, "capability", def.key, at);
    const byPlan = granted.has(def.key);
    if (ovr) {
      direct.set(def.key, {
        value: ovr.value === true,
        source: "override",
        ovr,
        contradiction: byPlan !== (ovr.value === true),
      });
    } else if (plan) {
      direct.set(def.key, { value: byPlan, source: byPlan ? "plan_version" : "catalog_default", ovr: null, contradiction: false });
    } else {
      direct.set(def.key, { value: def.defaultState, source: "catalog_default", ovr: null, contradiction: false });
    }
  }

  // Paso 2 — dependencias: una capacidad sin su base no puede quedar activa.
  const out: Record<string, CapabilityDecision> = {};
  for (const def of catalog) {
    const d = direct.get(def.key)!;
    const deps = def.dependencies.map(k => ({ key: k, satisfied: direct.get(k)?.value === true }));
    const unmet = deps.filter(x => !x.satisfied);
    const result = d.value && unmet.length === 0;
    const limitKey = def.key.includes("identity.employees") ? "shared.limit.employees" : null;

    out[def.key] = {
      key: def.key,
      product: def.product,
      result,
      source: d.value && unmet.length > 0 ? "dependency" : d.source,
      reason: buildReason(def, d, unmet, plan, result),
      confidence: d.ovr ? "media" : plan ? "alta" : "baja",
      contradiction: d.contradiction || (d.value && unmet.length > 0),
      planVersion: plan ? { id: plan.id, planKey: plan.planKey, version: plan.version } : null,
      override: d.ovr
        ? { id: d.ovr.id, reason: d.ovr.reason, approvedBy: d.ovr.approvedBy, effectiveUntil: d.ovr.effectiveUntil }
        : null,
      limit: limitKey ? limits[limitKey] ?? null : null,
      dependencies: deps,
      missingConfig: def.requiredConfig,
      effectiveAt: at,
    };
  }
  return out;
}

function buildReason(
  def: CapabilityDefinition,
  d: { value: boolean; source: EntitlementSource; ovr: EntitlementOverride | null; contradiction: boolean },
  unmet: Array<{ key: string }>,
  plan: PlanVersion | null,
  result: boolean,
): string {
  if (d.ovr) {
    const verb = d.ovr.value === true ? "concede" : "revoca";
    const window = d.ovr.effectiveUntil ? `hasta ${d.ovr.effectiveUntil}` : "sin vencimiento";
    const dep = unmet.length > 0 ? ` Bloqueada por dependencia sin satisfacer: ${unmet.map(u => u.key).join(", ")}.` : "";
    return `Override ${verb} la capacidad (${window}). Motivo: ${d.ovr.reason}.${dep}`;
  }
  if (unmet.length > 0) return `Concedida por el plan pero inactiva: falta ${unmet.map(u => u.key).join(", ")}.`;
  if (result && plan) return `Concedida por ${plan.planKey} v${plan.version} (${def.tier}).`;
  if (plan) return `No incluida en ${plan.planKey} v${plan.version}.`;
  return `Sin contrato resuelto: se aplica el valor por defecto del catálogo (${def.defaultState ? "activa" : "inactiva"}).`;
}

/* ───────────────────── canUse / explain / access ───────────────────── */

export function explainCapability(ctx: EccResolutionContext, key: string): CapabilityDecision {
  const def = getCapability(key);
  const at = ctx.at ?? new Date().toISOString();
  if (!def) {
    return {
      key,
      product: null,
      result: false,
      source: "not_in_catalog",
      reason: `La capacidad ${key} no existe en el catálogo canónico.`,
      confidence: "baja",
      contradiction: true,
      planVersion: null,
      override: null,
      limit: null,
      dependencies: [],
      missingConfig: [],
      effectiveAt: at,
    };
  }
  const resolved = resolveEntitlements(ctx)[key];
  if (resolved) return resolved;
  return {
    key,
    product: def.product,
    result: false,
    source: "catalog_default",
    reason: `El producto ${def.product} no está contratado por esta compañía; no hay herencia automática entre productos.`,
    confidence: "alta",
    contradiction: false,
    planVersion: null,
    override: null,
    limit: null,
    dependencies: capabilityDependencyChain(key).map(k => ({ key: k, satisfied: false })),
    missingConfig: def.requiredConfig,
    effectiveAt: at,
  };
}

/** Nunca devuelve un booleano suelto. */
export const canUseCapability = (ctx: EccResolutionContext, key: string): CapabilityDecision =>
  explainCapability(ctx, key);

export interface EffectiveCommercialAccess {
  accountId: string | null;
  companyId: string;
  planVersion: PlanVersion | null;
  entitlements: Record<string, CapabilityDecision>;
  limits: Record<string, LimitDecision>;
  overridesApplied: EntitlementOverride[];
  contradictions: string[];
  products: EccProduct[];
  effectiveAt: string;
}

export function getEffectiveCommercialAccess(ctx: EccResolutionContext): EffectiveCommercialAccess {
  const at = ctx.at ?? new Date().toISOString();
  const entitlements = resolveEntitlements(ctx);
  const limits = resolveLimits(ctx);
  const applied = scopedOverrides(ctx).filter(o => {
    const kind = o.kind;
    const w = winningOverride(scopedOverrides(ctx), kind, o.key, at);
    return w?.id === o.id;
  });
  const contradictions = Object.values(entitlements)
    .filter(e => e.contradiction)
    .map(e => `${e.key}: ${e.reason}`);
  return {
    accountId: ctx.accountId,
    companyId: ctx.companyId,
    planVersion: resolveContractPlanVersion(ctx),
    entitlements,
    limits,
    overridesApplied: applied,
    contradictions,
    products: [...allowedProducts(ctx)],
    effectiveAt: at,
  };
}
