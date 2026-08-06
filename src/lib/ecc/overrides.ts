/**
 * ECC — FASE 2. OVERRIDES APPEND-ONLY.
 *
 * Un override es una excepción comercial explícita, auditada y con vigencia.
 * Nunca es una nota libre, nunca se edita y nunca se borra: se revoca con un
 * registro nuevo. Modelo puro (sin I/O).
 */
import { eccChecksum } from "./plan-versions";

export type OverrideTargetScope = "company" | "account";
export type OverrideKind = "capability" | "limit";

/** Overrides sensibles: exigen aprobación reforzada (approvedBy ≠ createdBy). */
export const SENSITIVE_CAPABILITY_PREFIXES = ["stafly.payroll.", "stafly.billing.", "shared.integrations."];

export interface EntitlementOverride {
  id: string;
  kind: OverrideKind;
  target: { scope: OverrideTargetScope; id: string };
  /** capability_key cuando kind = "capability"; limit_key cuando kind = "limit". */
  key: string;
  /** boolean para capability, number para limit. */
  value: boolean | number;
  reason: string;
  createdBy: string;
  approvedBy: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  /** Mayor prioridad gana entre overrides simultáneos del mismo key. */
  priority: number;
  revocable: boolean;
  /** Registro que revoca a éste (append-only: no se borra el original). */
  revokedBy: string | null;
  version: number;
  audit: { createdAt: string; note: string; checksum: string };
}

export const isSensitiveOverride = (o: Pick<EntitlementOverride, "kind" | "key">) =>
  o.kind === "capability" && SENSITIVE_CAPABILITY_PREFIXES.some(p => o.key.startsWith(p));

export interface OverrideDraft {
  kind: OverrideKind;
  target: { scope: OverrideTargetScope; id: string };
  key: string;
  value: boolean | number;
  reason: string;
  createdBy: string;
  approvedBy?: string | null;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  priority?: number;
  revocable?: boolean;
  note?: string;
}

/**
 * Construye un override válido o explica por qué no lo es.
 * Idempotente: el `id` deriva del contenido, así que reintentar no duplica.
 */
export function buildOverride(draft: OverrideDraft): { ok: true; override: EntitlementOverride } | { ok: false; error: string } {
  const reason = draft.reason?.trim() ?? "";
  if (reason.length < 10) return { ok: false, error: "El motivo es obligatorio y debe ser explícito (mín. 10 caracteres)." };
  if (!draft.createdBy) return { ok: false, error: "Falta createdBy." };
  if (draft.kind === "capability" && typeof draft.value !== "boolean") {
    return { ok: false, error: "Un override de capability debe tener valor booleano." };
  }
  if (draft.kind === "limit" && typeof draft.value !== "number") {
    return { ok: false, error: "Un override de límite debe tener valor numérico." };
  }
  if (draft.effectiveUntil && new Date(draft.effectiveUntil) <= new Date(draft.effectiveFrom)) {
    return { ok: false, error: "effective_until debe ser posterior a effective_from." };
  }
  const approvedBy = draft.approvedBy ?? null;
  if (isSensitiveOverride(draft)) {
    if (!approvedBy) return { ok: false, error: `El override sobre ${draft.key} es sensible y requiere aprobación reforzada.` };
    if (approvedBy === draft.createdBy) {
      return { ok: false, error: "Un override sensible no puede ser aprobado por quien lo crea." };
    }
  }
  const body = {
    kind: draft.kind,
    target: draft.target,
    key: draft.key,
    value: draft.value,
    effectiveFrom: draft.effectiveFrom,
    effectiveUntil: draft.effectiveUntil ?? null,
  };
  const checksum = eccChecksum(body);
  return {
    ok: true,
    override: {
      id: `ovr:${draft.target.scope}:${draft.target.id}:${draft.key}:${checksum}`,
      ...body,
      reason,
      createdBy: draft.createdBy,
      approvedBy,
      priority: draft.priority ?? (isSensitiveOverride(draft) ? 100 : 50),
      revocable: draft.revocable ?? true,
      revokedBy: null,
      version: 1,
      audit: { createdAt: new Date().toISOString(), note: draft.note ?? "", checksum },
    },
  };
}

export const isOverrideActive = (o: EntitlementOverride, at: string | Date = new Date()): boolean => {
  if (o.revokedBy) return false;
  const t = new Date(at).getTime();
  if (t < new Date(o.effectiveFrom).getTime()) return false;
  if (o.effectiveUntil && t >= new Date(o.effectiveUntil).getTime()) return false;
  return true;
};

/** Override ganador para un key: activo, mayor prioridad, más reciente. */
export function winningOverride(
  overrides: EntitlementOverride[],
  kind: OverrideKind,
  key: string,
  at: string | Date = new Date(),
): EntitlementOverride | null {
  const active = overrides.filter(o => o.kind === kind && o.key === key && isOverrideActive(o, at));
  if (active.length === 0) return null;
  return active.sort(
    (a, b) =>
      b.priority - a.priority ||
      new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
  )[0];
}

/** Revocación append-only: devuelve el par (original marcado, registro nuevo). */
export function revokeOverride(
  original: EntitlementOverride,
  by: string,
  reason: string,
): { ok: true; revoked: EntitlementOverride } | { ok: false; error: string } {
  if (!original.revocable) return { ok: false, error: `El override ${original.id} no es revocable.` };
  if (reason.trim().length < 10) return { ok: false, error: "La revocación requiere motivo explícito." };
  return {
    ok: true,
    revoked: {
      ...original,
      revokedBy: by,
      version: original.version + 1,
      audit: { ...original.audit, note: `${original.audit.note} | revocado: ${reason}`.trim() },
    },
  };
}
