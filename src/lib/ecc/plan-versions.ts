/**
 * ECC — FASE 2. PLAN VERSIONS INMUTABLES.
 *
 * Un plan NO es una fila editable: es una secuencia de versiones publicadas.
 * Una versión publicada jamás se edita; un cambio comercial crea una versión
 * nueva y los contratos existentes conservan la suya.
 *
 * Modelo puro (sin I/O). La persistencia (tablas + RPC versionadas) se define
 * en el reporte de Fase 2 y NO se ejecuta aquí: legacy sigue gobernando.
 */
import type { EccProduct } from "./capability-catalog";

export type PlanVersionStatus = "draft" | "published" | "deprecated" | "retired";
export type BillingCadence = "none" | "monthly" | "annual" | "custom";
export type LimitEnforcement = "hard" | "soft";
export type OveragePolicy = "block" | "warn" | "bill" | "ignore";
export type MeasurementWindow = "instant" | "daily" | "billing_period";

/** Límite canónico declarado por una versión de plan. Nunca es un permiso. */
export interface PlanLimitSpec {
  limitKey: string;
  value: number;
  scope: "company" | "account";
  enforcement: LimitEnforcement;
  /** Fracción 0–1 del valor a partir de la cual se avisa. */
  warningThreshold: number;
  overagePolicy: OveragePolicy;
  measurementWindow: MeasurementWindow;
}

export interface PlanVersion {
  id: string;
  planKey: string;
  version: number;
  product: EccProduct;
  name: string;
  description: string;
  currency: string;
  billing: {
    cadence: BillingCadence;
    amount: number | null;
    /** Cómo se cobra hoy realmente (manual/no cobrado) — sin inventar Stripe. */
    collection: "none" | "manual" | "automatic";
  };
  /** Capacidades concedidas por la versión (claves del catálogo canónico). */
  capabilities: string[];
  limits: PlanLimitSpec[];
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: PlanVersionStatus;
  createdBy: string;
  approvedBy: string | null;
  audit: { createdAt: string; approvedAt: string | null; note: string };
  /** Huella determinista del contenido comercial de la versión. */
  checksum: string;
}

export const LIMIT_KEYS = {
  employees: "shared.limit.employees",
  admins: "shared.limit.admins",
} as const;
export type LimitKey = string;

export const LIMIT_LABEL: Record<string, string> = {
  "shared.limit.employees": "Personas activas",
  "shared.limit.admins": "Administradores",
};

/* ───────────────────────────── Checksum ───────────────────────────── */

/** FNV-1a 32-bit hexadecimal. Determinista y sin dependencias. */
export function eccChecksum(value: unknown): string {
  const json = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${hash.toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Contenido comercial que define la identidad de una versión. */
const checksumPayload = (p: PlanVersion) => ({
  planKey: p.planKey,
  version: p.version,
  product: p.product,
  currency: p.currency,
  billing: p.billing,
  capabilities: [...p.capabilities].sort(),
  limits: [...p.limits].sort((a, b) => a.limitKey.localeCompare(b.limitKey)),
  effectiveFrom: p.effectiveFrom,
});

export const computePlanVersionChecksum = (p: PlanVersion) => eccChecksum(checksumPayload(p));

export const verifyPlanVersion = (p: PlanVersion) => computePlanVersionChecksum(p) === p.checksum;

/* ─────────────────────────── Catálogo seed ─────────────────────────── */

function seed(p: Omit<PlanVersion, "checksum" | "id"> & { id?: string }): PlanVersion {
  const withId: PlanVersion = {
    ...p,
    id: p.id ?? `${p.planKey}@v${p.version}`,
    checksum: "",
  };
  return Object.freeze({ ...withId, checksum: computePlanVersionChecksum(withId) });
}

const limit = (
  limitKey: string,
  value: number,
  enforcement: LimitEnforcement = "hard",
  overagePolicy: OveragePolicy = "block",
): PlanLimitSpec => ({
  limitKey,
  value,
  scope: "company",
  enforcement,
  warningThreshold: 0.8,
  overagePolicy,
  measurementWindow: "instant",
});

const FREE_CAPS = [
  "shared.identity.directory",
  "shared.identity.employees",
  "shared.comms.announcements",
  "shared.data.export",
  "stafly.ops.shifts",
  "stafly.ops.concepts",
  "stafly.ops.applications",
];

const PRO_CAPS = [
  ...FREE_CAPS,
  "shared.comms.chat",
  "shared.data.reports",
  "shared.integrations.api",
  "stafly.ops.timeclock",
  "stafly.ops.locations",
  "stafly.ops.clients",
  "stafly.ops.automations",
  "stafly.ops.movements",
  "stafly.ops.command_center",
  "stafly.payroll.periods",
  "stafly.payroll.run",
  "stafly.payroll.summary",
  "stafly.payroll.reconciliation",
  "stafly.payroll.import",
  "stafly.billing.tenant_invoicing",
  "stafly.billing.monetization",
];

const ENTERPRISE_CAPS = [...PRO_CAPS];

/**
 * Versiones publicadas. `v1` documenta el estado histórico; `v2` es la versión
 * vigente. Ninguna se edita: se agregan versiones nuevas al final.
 */
export const PLAN_VERSIONS: readonly PlanVersion[] = Object.freeze([
  seed({
    planKey: "stafly.free",
    version: 1,
    product: "stafly",
    name: "Starter",
    description: "Operación básica sin costo. Versión histórica.",
    currency: "USD",
    billing: { cadence: "none", amount: 0, collection: "none" },
    capabilities: FREE_CAPS,
    limits: [limit(LIMIT_KEYS.employees, 10), limit(LIMIT_KEYS.admins, 2)],
    effectiveFrom: "2024-01-01",
    effectiveUntil: "2026-01-01",
    status: "deprecated",
    createdBy: "system",
    approvedBy: "system",
    audit: { createdAt: "2024-01-01T00:00:00Z", approvedAt: "2024-01-01T00:00:00Z", note: "Versión histórica derivada de plan_code=free." },
  }),
  seed({
    planKey: "stafly.free",
    version: 2,
    product: "stafly",
    name: "Starter",
    description: "Operación básica sin costo.",
    currency: "USD",
    billing: { cadence: "none", amount: 0, collection: "none" },
    capabilities: FREE_CAPS,
    limits: [limit(LIMIT_KEYS.employees, 10), limit(LIMIT_KEYS.admins, 2, "hard", "warn")],
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    status: "published",
    createdBy: "system",
    approvedBy: "ecc-core",
    audit: { createdAt: "2026-01-01T00:00:00Z", approvedAt: "2026-01-01T00:00:00Z", note: "Ajuste de política de exceso de administradores." },
  }),
  seed({
    planKey: "stafly.pro",
    version: 1,
    product: "stafly",
    name: "Pro",
    description: "Operación completa con nómina, asistencia y clientes.",
    currency: "USD",
    billing: { cadence: "monthly", amount: null, collection: "manual" },
    capabilities: PRO_CAPS,
    limits: [limit(LIMIT_KEYS.employees, 999), limit(LIMIT_KEYS.admins, 10)],
    effectiveFrom: "2024-01-01",
    effectiveUntil: null,
    status: "published",
    createdBy: "system",
    approvedBy: "ecc-core",
    audit: { createdAt: "2024-01-01T00:00:00Z", approvedAt: "2024-01-01T00:00:00Z", note: "Derivada de plan_code=paid_manual. Cobro manual, sin Stripe." },
  }),
  seed({
    planKey: "stafly.enterprise",
    version: 1,
    product: "stafly",
    name: "Enterprise",
    description: "Acceso completo sin límites operativos.",
    currency: "USD",
    billing: { cadence: "custom", amount: null, collection: "manual" },
    capabilities: ENTERPRISE_CAPS,
    limits: [
      limit(LIMIT_KEYS.employees, Number.POSITIVE_INFINITY, "soft", "ignore"),
      limit(LIMIT_KEYS.admins, Number.POSITIVE_INFINITY, "soft", "ignore"),
    ],
    effectiveFrom: "2024-01-01",
    effectiveUntil: null,
    status: "published",
    createdBy: "system",
    approvedBy: "ecc-core",
    audit: { createdAt: "2024-01-01T00:00:00Z", approvedAt: "2024-01-01T00:00:00Z", note: "Derivada de plan_code=enterprise / paid_features_enabled." },
  }),
  seed({
    planKey: "parceros.talent_free",
    version: 1,
    product: "parceros",
    name: "Parceros Talento",
    description: "Pasaporte laboral y reputación para trabajadores.",
    currency: "USD",
    billing: { cadence: "none", amount: 0, collection: "none" },
    capabilities: ["parceros.passport.profile", "parceros.reputation.reviews", "shared.data.export"],
    limits: [],
    effectiveFrom: "2025-01-01",
    effectiveUntil: null,
    status: "published",
    createdBy: "system",
    approvedBy: "ecc-core",
    audit: { createdAt: "2025-01-01T00:00:00Z", approvedAt: "2025-01-01T00:00:00Z", note: "Producto separado: no hereda capacidades de Stafly." },
  }),
]);

export const PLAN_VERSION_BY_ID: ReadonlyMap<string, PlanVersion> = new Map(
  PLAN_VERSIONS.map(p => [p.id, p]),
);

export const getPlanVersionById = (id: string): PlanVersion | null => PLAN_VERSION_BY_ID.get(id) ?? null;

export const getPlanVersion = (planKey: string, version: number): PlanVersion | null =>
  PLAN_VERSIONS.find(p => p.planKey === planKey && p.version === version) ?? null;

export const planVersionsFor = (planKey: string): PlanVersion[] =>
  PLAN_VERSIONS.filter(p => p.planKey === planKey).sort((a, b) => a.version - b.version);

/** Versión vigente de un plan en una fecha dada. Nunca reescribe historia. */
export function resolvePlanVersionAt(planKey: string, at: string | Date = new Date()): PlanVersion | null {
  const t = new Date(at).getTime();
  const candidates = planVersionsFor(planKey).filter(p => {
    if (p.status === "draft" || p.status === "retired") return false;
    const from = new Date(p.effectiveFrom).getTime();
    const until = p.effectiveUntil ? new Date(p.effectiveUntil).getTime() : Number.POSITIVE_INFINITY;
    return t >= from && t < until;
  });
  if (candidates.length === 0) {
    const published = planVersionsFor(planKey).filter(p => p.status === "published");
    return published[published.length - 1] ?? null;
  }
  return candidates[candidates.length - 1];
}

/** Última versión publicada (la que recibirían contratos nuevos). */
export const latestPublishedVersion = (planKey: string): PlanVersion | null => {
  const published = planVersionsFor(planKey).filter(p => p.status === "published");
  return published[published.length - 1] ?? null;
};

/**
 * Regla de inmutabilidad: publicar cambios SIEMPRE produce una versión nueva.
 * Función pura — devuelve el candidato, nunca muta el registro existente.
 */
export function draftNextVersion(
  planKey: string,
  changes: Partial<Pick<PlanVersion, "capabilities" | "limits" | "billing" | "name" | "description" | "currency">>,
  meta: { createdBy: string; effectiveFrom: string; note: string },
): { ok: true; next: PlanVersion } | { ok: false; error: string } {
  const base = latestPublishedVersion(planKey);
  if (!base) return { ok: false, error: `No existe versión publicada para ${planKey}` };
  if (new Date(meta.effectiveFrom).getTime() < new Date(base.effectiveFrom).getTime()) {
    return { ok: false, error: "effective_from no puede anteceder a la versión vigente (no se reescribe historia)." };
  }
  const next = seed({
    ...base,
    ...changes,
    id: `${planKey}@v${base.version + 1}`,
    version: base.version + 1,
    effectiveFrom: meta.effectiveFrom,
    effectiveUntil: null,
    status: "draft",
    createdBy: meta.createdBy,
    approvedBy: null,
    audit: { createdAt: new Date().toISOString(), approvedAt: null, note: meta.note },
  });
  return { ok: true, next };
}

/** Guardia explícita: cualquier intento de editar una versión publicada falla. */
export function assertPlanVersionEditable(p: PlanVersion): { ok: boolean; error?: string } {
  if (p.status === "draft") return { ok: true };
  return { ok: false, error: `La versión ${p.id} está ${p.status}: crea una versión nueva en lugar de editarla.` };
}
