/**
 * ECC — FASE 2. MAPEO LEGACY → CANÓNICO + SHADOW MODE.
 *
 * Traduce las fuentes legacy (plan_code, company_modules, subscriptions,
 * límites de columna) al modelo canónico de Fase 2, SIN escribir nada y SIN
 * modificar las fuentes originales.
 *
 * Propiedades exigidas al mapeo: idempotente, auditable, reversible,
 * tenant-safe y explicable.
 */
import { LEGACY_MODULE_TO_CAPABILITY, getCapability } from "./capability-catalog";
import { LIMIT_KEYS, resolvePlanVersionAt, type PlanVersion } from "./plan-versions";
import { buildOverride, type EntitlementOverride } from "./overrides";
import {
  getEffectiveCommercialAccess,
  type CapabilityDecision,
  type EccResolutionContext,
  type EffectiveCommercialAccess,
} from "./entitlements";
import type { EccReadModelInput } from "./commercial-read-model";
import { MODULE_PLAN_MAP, resolveEffectivePlan, type PlanCode } from "@/hooks/useSubscription";

/** plan_code legacy → plan_key canónico. Reversible por tabla explícita. */
export const PLAN_CODE_TO_PLAN_KEY: Record<PlanCode, string> = {
  free: "stafly.free",
  paid_manual: "stafly.pro",
  enterprise: "stafly.enterprise",
};

export const PLAN_KEY_TO_PLAN_CODE: Record<string, PlanCode> = {
  "stafly.free": "free",
  "stafly.pro": "paid_manual",
  "stafly.enterprise": "enterprise",
};

export interface MappingEntry {
  source: string;
  target: string;
  action: "mapped" | "override_created" | "informational" | "unmapped";
  detail: string;
  reversible: boolean;
}

export interface LegacyMappingResult {
  companyId: string;
  planCode: PlanCode;
  planVersion: PlanVersion | null;
  overrides: EntitlementOverride[];
  usage: Record<string, number>;
  entries: MappingEntry[];
  unmapped: string[];
  generatedAt: string;
}

/**
 * Mapea una company legacy al contrato canónico equivalente.
 * Idempotente: mismos insumos ⇒ mismos ids de override (checksum del contenido).
 */
export function mapLegacyCompanyToEcc(input: EccReadModelInput, at?: string): LegacyMappingResult {
  const effectiveAt = at ?? new Date().toISOString();
  const planCode = resolveEffectivePlan(input.company.plan_code, input.company.paid_features_enabled);
  const planKey = PLAN_CODE_TO_PLAN_KEY[planCode];
  const planVersion = resolvePlanVersionAt(planKey, effectiveAt);
  const entries: MappingEntry[] = [];
  const unmapped: string[] = [];
  const overrides: EntitlementOverride[] = [];

  entries.push({
    source: `companies.plan_code=${input.company.plan_code ?? "null"}${input.company.paid_features_enabled ? " + paid_features_enabled" : ""}`,
    target: planVersion?.id ?? planKey,
    action: "mapped",
    detail: `Plan efectivo legacy ${planCode} mapeado a la versión canónica vigente.`,
    reversible: true,
  });

  // company_modules → override de capability (nunca se toca la fuente).
  for (const m of input.modules ?? []) {
    const capKey = LEGACY_MODULE_TO_CAPABILITY[m.module];
    if (!capKey) {
      unmapped.push(m.module);
      entries.push({
        source: `company_modules.${m.module}`,
        target: "—",
        action: "unmapped",
        detail: "Módulo legacy sin capacidad canónica equivalente. Requiere decisión de catálogo antes del cutover.",
        reversible: true,
      });
      continue;
    }
    const grantedByPlan = (planVersion?.capabilities ?? []).includes(capKey);
    if (grantedByPlan === m.is_active) {
      entries.push({
        source: `company_modules.${m.module}=${m.is_active}`,
        target: capKey,
        action: "mapped",
        detail: "Coincide con la versión de plan: no genera override.",
        reversible: true,
      });
      continue;
    }
    const built = buildOverride({
      kind: "capability",
      target: { scope: "company", id: input.company.id },
      key: capKey,
      value: m.is_active,
      reason: `Migración de company_modules.${m.module} (${m.is_active ? "activo" : "inactivo"}) fuera del plan ${planKey}.`,
      createdBy: "ecc-migration",
      approvedBy: "ecc-core",
      effectiveFrom: "2024-01-01",
      note: "Mapeo shadow Fase 2. No modifica company_modules.",
    });
    if (!built.ok) {
      unmapped.push(m.module);
      entries.push({
        source: `company_modules.${m.module}`,
        target: capKey,
        action: "unmapped",
        detail: `Override rechazado: ${built.error}`,
        reversible: true,
      });
    } else {
      overrides.push(built.override);
      entries.push({
        source: `company_modules.${m.module}=${m.is_active}`,
        target: capKey,
        action: "override_created",
        detail: `Diferencia contra el plan: se representa como override ${m.is_active ? "concesivo" : "restrictivo"}.`,
        reversible: true,
      });
    }

  }

  // Límites de columna → override de limit cuando difieren del plan.
  const legacyLimits: Array<[string, number | null]> = [
    [LIMIT_KEYS.employees, input.company.max_employees],
    [LIMIT_KEYS.admins, input.company.max_admins],
  ];
  for (const [limitKey, value] of legacyLimits) {
    if (value === null || value === undefined) continue;
    const spec = planVersion?.limits.find(l => l.limitKey === limitKey);
    if (spec && spec.value === value) {
      entries.push({ source: `companies.${limitKey}`, target: limitKey, action: "mapped", detail: "Igual al plan.", reversible: true });
      continue;
    }
    const built = buildOverride({
      kind: "limit",
      target: { scope: "company", id: input.company.id },
      key: limitKey,
      value,
      reason: `Límite legacy en columna companies distinto del plan ${planKey}.`,
      createdBy: "ecc-migration",
      approvedBy: "ecc-core",
      effectiveFrom: "2024-01-01",
      note: "Mapeo shadow Fase 2.",
    });
    if (built.ok) {
      overrides.push(built.override);
      entries.push({ source: `companies.${limitKey}=${value}`, target: limitKey, action: "override_created", detail: "Se representa como override de límite.", reversible: true });
    }
  }

  // Subscriptions legacy → sólo referencia informativa (no gobiernan acceso).
  if (input.subscription) {
    entries.push({
      source: `subscriptions.${input.subscription.plan ?? "?"}`,
      target: planVersion?.id ?? planKey,
      action: "informational",
      detail: "Suscripción legacy conservada como referencia: hoy no gobierna acceso ni cobro.",
      reversible: true,
    });
  }

  return {
    companyId: input.company.id,
    planCode,
    planVersion,
    overrides,
    usage: {
      [LIMIT_KEYS.employees]: input.employeeCount,
      [LIMIT_KEYS.admins]: input.userCount,
    },
    entries,
    unmapped,
    generatedAt: effectiveAt,
  };
}

/** Contexto canónico listo para el resolver, derivado del legacy. */
export function buildResolutionContext(
  input: EccReadModelInput,
  mapping = mapLegacyCompanyToEcc(input),
): EccResolutionContext {
  return {
    accountId: input.commercialAccount?.id ?? null,
    companyId: input.company.id,
    contract: {
      planVersionId: mapping.planVersion?.id ?? null,
      planKey: mapping.planVersion?.planKey ?? PLAN_CODE_TO_PLAN_KEY[mapping.planCode],
      product: "stafly",
    },
    overrides: mapping.overrides,
    usage: mapping.usage,
    at: mapping.generatedAt,
  };
}

/* ─────────────────────────── Shadow mode ─────────────────────────── */

export type ShadowStatus = "match" | "mismatch" | "unknown" | "missing_mapping" | "legacy_only" | "ecc_only";

export interface ShadowCapabilityRow {
  capabilityKey: string;
  legacyModuleKey: string | null;
  legacy: boolean | null;
  ecc: boolean;
  status: ShadowStatus;
  detail: string;
  eccReason: string;
}

export interface ShadowLimitRow {
  limitKey: string;
  legacy: number | null;
  ecc: number;
  status: ShadowStatus;
  detail: string;
}

export interface ShadowReport {
  companyId: string;
  companyName: string;
  planCodeLegacy: PlanCode;
  planVersionId: string | null;
  capabilities: ShadowCapabilityRow[];
  limits: ShadowLimitRow[];
  counts: Record<ShadowStatus, number>;
  missingMappings: string[];
  cutoverReady: boolean;
  legacyDependencies: string[];
  access: EffectiveCommercialAccess;
  generatedAt: string;
}

/** Decisión legacy real: plan tier OR override activo en company_modules. */
function legacyModuleDecision(moduleKey: string, plan: PlanCode, input: EccReadModelInput): boolean {
  const TIERS: PlanCode[] = ["free", "paid_manual", "enterprise"];
  const required = MODULE_PLAN_MAP[moduleKey] ?? "free";
  const planGrants = TIERS.indexOf(plan) >= TIERS.indexOf(required);
  const active = (input.modules ?? []).some(m => m.module === moduleKey && m.is_active);
  return planGrants || active;
}

export function buildShadowReport(input: EccReadModelInput, at?: string): ShadowReport {
  const mapping = mapLegacyCompanyToEcc(input, at);
  const ctx = buildResolutionContext(input, mapping);
  const access = getEffectiveCommercialAccess(ctx);
  const plan = mapping.planCode;

  const capabilities: ShadowCapabilityRow[] = [];
  const counts: Record<ShadowStatus, number> = {
    match: 0,
    mismatch: 0,
    unknown: 0,
    missing_mapping: 0,
    legacy_only: 0,
    ecc_only: 0,
  };

  const seenLegacy = new Set<string>();
  for (const [capKey, decision] of Object.entries(access.entitlements) as Array<[string, CapabilityDecision]>) {
    const def = getCapability(capKey);
    const legacyKey = def?.legacyModuleKey ?? null;
    if (legacyKey) seenLegacy.add(legacyKey);
    const legacy = legacyKey ? legacyModuleDecision(legacyKey, plan, input) : null;
    let status: ShadowStatus;
    let detail: string;
    if (legacy === null) {
      status = decision.result ? "ecc_only" : "unknown";
      detail = decision.result
        ? "Capacidad canónica sin equivalente legacy: hoy no está gobernada por ningún gate."
        : "Sin equivalente legacy ni concesión canónica.";
    } else if (legacy === decision.result) {
      status = "match";
      detail = "Legacy y ECC coinciden.";
    } else if (legacy && !decision.result) {
      status = "legacy_only";
      detail = "Legacy concede acceso que la versión canónica no incluye.";
    } else {
      status = "mismatch";
      detail = "ECC concede lo que el gate legacy niega hoy.";
    }
    counts[status] += 1;
    capabilities.push({
      capabilityKey: capKey,
      legacyModuleKey: legacyKey,
      legacy,
      ecc: decision.result,
      status,
      detail,
      eccReason: decision.reason,
    });
  }

  const missingMappings = [...mapping.unmapped];
  for (const legacyKey of Object.keys(MODULE_PLAN_MAP)) {
    if (seenLegacy.has(legacyKey)) continue;
    if (!missingMappings.includes(legacyKey)) missingMappings.push(legacyKey);
  }
  counts.missing_mapping = missingMappings.length;

  const limits: ShadowLimitRow[] = [
    ["shared.limit.employees", input.company.max_employees] as const,
    ["shared.limit.admins", input.company.max_admins] as const,
  ].map(([key, legacyValue]) => {
    const eccLimit = access.limits[key];
    const ecc = eccLimit?.value ?? Number.POSITIVE_INFINITY;
    const legacy = legacyValue ?? null;
    const status: ShadowStatus = legacy === null ? "unknown" : legacy === ecc ? "match" : "mismatch";
    counts[status] += 1;
    return {
      limitKey: key,
      legacy,
      ecc,
      status,
      detail:
        legacy === null
          ? "Sin valor legacy en columna: el plan define el límite."
          : legacy === ecc
            ? "Coinciden."
            : `Legacy ${legacy} vs canónico ${ecc} (${eccLimit?.source ?? "unset"}).`,
    };
  });

  const legacyDependencies = [
    "useSubscription.canAccessModule",
    "ModuleGate",
    "company_modules",
    "companies.plan_code",
    "companies.paid_features_enabled",
    ...(input.subscription ? ["subscriptions (legacy)"] : []),
  ];

  return {
    companyId: input.company.id,
    companyName: input.company.name,
    planCodeLegacy: plan,
    planVersionId: mapping.planVersion?.id ?? null,
    capabilities,
    limits,
    counts,
    missingMappings,
    cutoverReady: counts.mismatch === 0 && counts.legacy_only === 0 && missingMappings.length === 0,
    legacyDependencies,
    access,
    generatedAt: mapping.generatedAt,
  };
}

export interface EccPhase2Metrics {
  companies: number;
  cutoverReady: number;
  withMismatch: number;
  withOverrides: number;
  missingMappings: string[];
}

export function summarizePhase2(reports: ShadowReport[]): EccPhase2Metrics {
  const missing = new Set<string>();
  reports.forEach(r => r.missingMappings.forEach(m => missing.add(m)));
  return {
    companies: reports.length,
    cutoverReady: reports.filter(r => r.cutoverReady).length,
    withMismatch: reports.filter(r => r.counts.mismatch > 0 || r.counts.legacy_only > 0).length,
    withOverrides: reports.filter(r => r.access.overridesApplied.length > 0).length,
    missingMappings: [...missing],
  };
}
