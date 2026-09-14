/**
 * STAFLY — CANONICAL ENTITLEMENTS LAYER (P1, SHADOW MODE).
 *
 * Capa única que responde: plan efectivo → entitlements del plan →
 * overrides/grandfathering → uso canónico → límite efectivo → decisión sombra.
 *
 * REGLA DURA DE ESTA FASE: este módulo es OBSERVACIONAL. No bloquea ninguna
 * acción de producción. El gating vigente sigue siendo `useSubscription`
 * (`canAddEmployees` / `canAddAdmins`). Nada aquí toca billing, auth, RLS,
 * payroll, turnos ni datos de personas.
 *
 * Modelo puro (sin I/O): recibe filas ya leídas y devuelve decisiones.
 */

/* ============================================================
 * 1. IDENTIFICADORES CANÓNICOS
 * ============================================================ */

export type CanonicalPlan = "starter" | "operations" | "scale";
export type EntitlementKey = "active_workers" | "admin_users";

export type PlanConfidence = "high" | "medium" | "low";

export type ShadowStatus =
  | "WITHIN_LIMIT"
  | "NEAR_LIMIT"
  | "AT_LIMIT"
  | "WOULD_EXCEED"
  | "UNLIMITED"
  | "CUSTOM"
  | "NEEDS_REVIEW";

/**
 * Catálogo canónico. `null` = sin tope estandarizado (capacidad contractual).
 * Scale NO se implementa como tope duro de 150: "150+" es posicionamiento
 * comercial, no un cap. Su capacidad real se expresa con overrides explícitos.
 */
export const PLAN_ENTITLEMENTS: Record<
  CanonicalPlan,
  Record<EntitlementKey, number | null>
> = {
  starter: { active_workers: 25, admin_users: 2 },
  operations: { active_workers: 75, admin_users: 10 },
  scale: { active_workers: null, admin_users: null },
};

export const PLAN_LABEL: Record<CanonicalPlan, string> = {
  starter: "Starter",
  operations: "Operations",
  scale: "Scale",
};

/** Códigos internos legacy → plan canónico. */
const LEGACY_PLAN_MAP: Record<string, CanonicalPlan> = {
  free: "starter",
  starter: "starter",
  paid_manual: "operations",
  operations: "operations",
  pro: "operations",
  enterprise: "scale",
  scale: "scale",
};

/**
 * Valores centinela legacy en `companies.max_*`: significan "sin tope real",
 * no una capacidad negociada. No se convierten en overrides.
 */
const WORKER_SENTINEL_MIN = 999;
const ADMIN_SENTINEL_MIN = 99;

/* ============================================================
 * 2. ENTRADA
 * ============================================================ */

export interface CompanyEntitlementInput {
  id: string;
  name: string;
  plan_code: string | null;
  plan_status: string | null;
  paid_features_enabled: boolean | null;
  max_employees: number | null;
  max_admins: number | null;
  is_active: boolean | null;
  /** Fila de `subscriptions` (señal secundaria, hoy NO autoritativa). */
  subscription_plan?: string | null;
  subscription_status?: string | null;
  /** Overrides explícitos y auditables (ver sección 4). */
  overrides?: EntitlementOverrideRecord[];
  /** Uso canónico ya calculado (ver `active-worker-usage`). */
  usage: Partial<Record<EntitlementKey, number>>;
}

/* ============================================================
 * 3. RESOLUCIÓN DE PLAN
 * ============================================================ */

export interface PlanResolution {
  plan: CanonicalPlan | null;
  source: string;
  legacy_source: string | null;
  subscription_plan: CanonicalPlan | null;
  confidence: PlanConfidence;
  needs_review: boolean;
  conflicts: string[];
}

export function resolveCanonicalPlan(c: CompanyEntitlementInput): PlanResolution {
  const conflicts: string[] = [];
  const legacyRaw = (c.plan_code ?? "").trim().toLowerCase();
  const legacy = LEGACY_PLAN_MAP[legacyRaw] ?? null;
  const subRaw = (c.subscription_plan ?? "").trim().toLowerCase();
  const sub = subRaw ? (LEGACY_PLAN_MAP[subRaw] ?? null) : null;

  if (!legacy) conflicts.push(`plan_code desconocido: "${c.plan_code ?? "∅"}"`);
  if (subRaw && !sub) conflicts.push(`subscription.plan desconocido: "${c.subscription_plan}"`);

  let plan = legacy;
  let source = "companies.plan_code";

  // `paid_features_enabled` eleva a Scale (comportamiento vigente en producción).
  if (c.paid_features_enabled && plan && plan !== "scale") {
    plan = "scale";
    source = "companies.paid_features_enabled";
    conflicts.push("paid_features_enabled eleva el plan por encima de plan_code");
  }

  if (sub && plan && sub !== plan) {
    conflicts.push(
      `subscriptions.plan (${sub}) no coincide con el plan efectivo de la empresa (${plan})`,
    );
  }

  if (!plan) {
    return {
      plan: null,
      source: "unresolved",
      legacy_source: c.plan_code ?? null,
      subscription_plan: sub,
      confidence: "low",
      needs_review: true,
      conflicts,
    };
  }

  const confidence: PlanConfidence =
    conflicts.length === 0 ? "high" : conflicts.length === 1 ? "medium" : "low";

  return {
    plan,
    source,
    legacy_source: c.plan_code ?? null,
    subscription_plan: sub,
    confidence,
    needs_review: conflicts.length > 0,
    conflicts,
  };
}

/* ============================================================
 * 4. OVERRIDES / GRANDFATHERING
 * ============================================================ */

export interface EntitlementOverrideRecord {
  company_id: string;
  key: EntitlementKey;
  /** `null` = capacidad sin tope estandarizado (contrato custom). */
  limit: number | null;
  reason: string;
  source: "negotiated_contract" | "grandfathered" | "migration" | "legacy_column" | "manual_review";
  effective_from: string;
  effective_until?: string | null;
}

export function isOverrideActive(
  o: EntitlementOverrideRecord,
  at: Date = new Date(),
): boolean {
  const t = at.getTime();
  if (new Date(o.effective_from).getTime() > t) return false;
  if (o.effective_until && new Date(o.effective_until).getTime() <= t) return false;
  return true;
}

/**
 * Derivación read-only de overrides implícitos desde las columnas legacy
 * `companies.max_employees` / `max_admins`.
 *
 * No crea ni escribe nada: solo explica el comportamiento que hoy ya existe,
 * para que el motor sombra no contradiga a producción. Los valores centinela
 * (999+/99+) se leen como "sin tope", no como capacidad negociada.
 */
export function deriveLegacyOverrides(
  c: CompanyEntitlementInput,
  plan: CanonicalPlan,
): EntitlementOverrideRecord[] {
  const out: EntitlementOverrideRecord[] = [];
  const base = PLAN_ENTITLEMENTS[plan];
  const from = "1970-01-01T00:00:00.000Z";

  const w = c.max_employees;
  if (typeof w === "number" && Number.isFinite(w)) {
    if (w >= WORKER_SENTINEL_MIN) {
      if (base.active_workers !== null) {
        out.push({
          company_id: c.id,
          key: "active_workers",
          limit: null,
          reason: `Columna legacy max_employees=${w} (centinela "sin tope")`,
          source: "legacy_column",
          effective_from: from,
        });
      }
    } else if (w !== base.active_workers) {
      out.push({
        company_id: c.id,
        key: "active_workers",
        limit: w,
        reason: `Columna legacy max_employees=${w} distinta del plan ${plan}`,
        source: "legacy_column",
        effective_from: from,
      });
    }
  }

  const a = c.max_admins;
  if (typeof a === "number" && Number.isFinite(a)) {
    if (a >= ADMIN_SENTINEL_MIN) {
      if (base.admin_users !== null) {
        out.push({
          company_id: c.id,
          key: "admin_users",
          limit: null,
          reason: `Columna legacy max_admins=${a} (centinela "sin tope")`,
          source: "legacy_column",
          effective_from: from,
        });
      }
    } else if (a !== base.admin_users) {
      out.push({
        company_id: c.id,
        key: "admin_users",
        limit: a,
        reason: `Columna legacy max_admins=${a} distinta del plan ${plan}`,
        source: "legacy_column",
        effective_from: from,
      });
    }
  }

  return out;
}

function pickOverride(
  overrides: EntitlementOverrideRecord[],
  key: EntitlementKey,
  at: Date,
): EntitlementOverrideRecord | null {
  const active = overrides.filter((o) => o.key === key && isOverrideActive(o, at));
  if (active.length === 0) return null;
  // El más reciente gana; los explícitos pesan más que los derivados legacy.
  return active.sort((a, b) => {
    const weight = (o: EntitlementOverrideRecord) => (o.source === "legacy_column" ? 0 : 1);
    return (
      weight(b) - weight(a) ||
      new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime()
    );
  })[0];
}

/* ============================================================
 * 5. EVALUADOR CANÓNICO
 * ============================================================ */

export interface EntitlementEvaluation {
  company_id: string;
  company_name: string;
  key: EntitlementKey;
  plan: CanonicalPlan | null;
  plan_label: string;
  plan_source: string;
  plan_confidence: PlanConfidence;
  base_limit: number | null;
  override_limit: number | null;
  override: EntitlementOverrideRecord | null;
  effective_limit: number | null;
  current_usage: number;
  remaining_capacity: number | null;
  status: ShadowStatus;
  reason: string;
  conflicts: string[];
}

const NEAR_LIMIT_RATIO = 0.9;

export function evaluateEntitlement(
  c: CompanyEntitlementInput,
  key: EntitlementKey,
  opts: { at?: Date; includeLegacyOverrides?: boolean } = {},
): EntitlementEvaluation {
  const at = opts.at ?? new Date();
  const includeLegacy = opts.includeLegacyOverrides ?? true;
  const resolution = resolveCanonicalPlan(c);
  const usage = c.usage[key] ?? 0;

  if (!resolution.plan) {
    return {
      company_id: c.id,
      company_name: c.name,
      key,
      plan: null,
      plan_label: "Requiere revisión",
      plan_source: resolution.source,
      plan_confidence: resolution.confidence,
      base_limit: null,
      override_limit: null,
      override: null,
      effective_limit: null,
      current_usage: usage,
      remaining_capacity: null,
      status: "NEEDS_REVIEW",
      reason: "El plan de la empresa no puede resolverse sin ambigüedad.",
      conflicts: resolution.conflicts,
    };
  }

  const plan = resolution.plan;
  const base = PLAN_ENTITLEMENTS[plan][key];
  const all = [
    ...(c.overrides ?? []),
    ...(includeLegacy ? deriveLegacyOverrides(c, plan) : []),
  ];
  const override = pickOverride(all, key, at);
  const effective = override ? override.limit : base;

  let status: ShadowStatus;
  let reason: string;

  if (resolution.needs_review && resolution.confidence === "low") {
    status = "NEEDS_REVIEW";
    reason = "Señales de plan contradictorias; no se aplica ningún tope sombra.";
  } else if (effective === null) {
    status = plan === "scale" ? "CUSTOM" : "UNLIMITED";
    reason =
      plan === "scale"
        ? "Scale: capacidad contractual, sin tope estandarizado."
        : "Sin tope configurado para esta clave.";
  } else if (usage > effective) {
    status = "WOULD_EXCEED";
    reason = `El uso actual (${usage}) supera el límite efectivo (${effective}).`;
  } else if (usage === effective) {
    status = "AT_LIMIT";
    reason = "El uso actual iguala el límite efectivo.";
  } else if (usage >= effective * NEAR_LIMIT_RATIO) {
    status = "NEAR_LIMIT";
    reason = "El uso actual está cerca del límite efectivo.";
  } else {
    status = "WITHIN_LIMIT";
    reason = "Dentro del límite efectivo.";
  }

  return {
    company_id: c.id,
    company_name: c.name,
    key,
    plan,
    plan_label: PLAN_LABEL[plan],
    plan_source: resolution.source,
    plan_confidence: resolution.confidence,
    base_limit: base,
    override_limit: override ? override.limit : null,
    override,
    effective_limit: effective,
    current_usage: usage,
    remaining_capacity: effective === null ? null : Math.max(0, effective - usage),
    status,
    reason,
    conflicts: resolution.conflicts,
  };
}

/* ============================================================
 * 6. API DE DECISIÓN EN SOMBRA (NO BLOQUEA)
 * ============================================================ */

export interface ShadowDecision {
  /** Lo que ocurriría si el enforcement estuviera activo. NO se aplica hoy. */
  allowed_under_future_rules: boolean;
  enforced: false;
  key: EntitlementKey;
  current_usage: number;
  effective_limit: number | null;
  projected_usage: number;
  status: ShadowStatus;
  reason: string;
  evaluation: EntitlementEvaluation;
}

export function checkEntitlementShadow(
  c: CompanyEntitlementInput,
  key: EntitlementKey,
  requestedDelta = 1,
  opts: { at?: Date } = {},
): ShadowDecision {
  const evaluation = evaluateEntitlement(c, key, opts);
  const projected = evaluation.current_usage + requestedDelta;
  const limit = evaluation.effective_limit;

  let status: ShadowStatus = evaluation.status;
  let allowed = true;

  if (evaluation.status === "NEEDS_REVIEW") {
    allowed = true; // nunca se niega por ambigüedad
  } else if (limit === null) {
    allowed = true;
  } else if (projected > limit) {
    allowed = false;
    status = "WOULD_EXCEED";
  } else if (projected === limit) {
    status = "AT_LIMIT";
  } else if (projected >= limit * NEAR_LIMIT_RATIO) {
    status = "NEAR_LIMIT";
  }

  return {
    allowed_under_future_rules: allowed,
    enforced: false,
    key,
    current_usage: evaluation.current_usage,
    effective_limit: limit,
    projected_usage: projected,
    status,
    reason:
      limit === null
        ? evaluation.reason
        : `Uso proyectado ${projected} frente a límite efectivo ${limit}.`,
    evaluation,
  };
}
