/**
 * ROL PRINCIPAL — capa de lectura para la administración de usuarios (P1).
 *
 * NO introduce roles nuevos, NO cambia el modelo de permisos y NO toca
 * membresías. Solo responde, con lo que ya existe, la pregunta operativa:
 *
 *   "¿Qué puede hacer esta persona?"
 *
 * Regla   = rol principal (membresía + plantilla canónica reconocida).
 * Excepción = overrides explícitos de la empresa.
 */
import {
  CANONICAL_ROLES,
  SCOPE_LABELS,
  templateActionsFor,
  type CanonicalRole,
  type PermissionScope,
} from "./role-model";

export interface PrimaryRoleResult {
  /** Rol canónico reconocido, si el acceso coincide con una plantilla. */
  role: CanonicalRole | null;
  /** Etiqueta lista para mostrar (nunca vacía). */
  label: string;
  scope: PermissionScope;
  scopeLabel: string;
  /** El acceso no coincide con ninguna plantilla: está personalizado. */
  custom: boolean;
}

/** Rol por defecto de una membresía cuando no hay overrides explícitos. */
function defaultForMembership(membershipRole: string): CanonicalRole | null {
  if (membershipRole === "company_owner") return CANONICAL_ROLES.find((r) => r.key === "company_owner") ?? null;
  if (membershipRole === "manager") return CANONICAL_ROLES.find((r) => r.key === "service_supervisor") ?? null;
  if (membershipRole === "employee") return CANONICAL_ROLES.find((r) => r.key === "worker") ?? null;
  return null; // admin: acceso total de empresa hasta que se aplique una plantilla
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
};

/**
 * Deriva el rol principal a partir de la membresía y de los overrides de
 * acción explícitos de la empresa (mapa acción → concedida).
 */
export function resolvePrimaryRole(
  membershipRole: string,
  actionOverrides: Record<string, boolean> = {},
): PrimaryRoleResult {
  const entries = Object.entries(actionOverrides);
  const granted = new Set(entries.filter(([, v]) => v).map(([k]) => k));

  if (entries.length === 0) {
    const fallback = defaultForMembership(membershipRole);
    if (fallback) {
      return {
        role: fallback,
        label: fallback.label,
        scope: fallback.scope,
        scopeLabel: SCOPE_LABELS[fallback.scope],
        custom: false,
      };
    }
    return {
      role: null,
      label: "Administrador de empresa",
      scope: "COMPANY",
      scopeLabel: SCOPE_LABELS.COMPANY,
      custom: false,
    };
  }

  let best: { role: CanonicalRole; score: number } | null = null;
  for (const role of CANONICAL_ROLES) {
    if (role.key === "company_owner") continue;
    const score = jaccard(granted, new Set(templateActionsFor(role)));
    if (!best || score > best.score) best = { role, score };
  }

  if (best && best.score >= 0.75) {
    return {
      role: best.role,
      label: best.role.label,
      scope: best.role.scope,
      scopeLabel: SCOPE_LABELS[best.role.scope],
      custom: false,
    };
  }

  const fallback = defaultForMembership(membershipRole);
  return {
    role: null,
    label: "Acceso personalizado",
    scope: fallback?.scope ?? "COMPANY",
    scopeLabel: SCOPE_LABELS[fallback?.scope ?? "COMPANY"],
    custom: true,
  };
}

/**
 * Roles que se pueden asignar como rol principal desde la consola.
 * `company_owner` no se asigna aquí: se define en la membresía.
 */
export function assignableRoles(membershipRole: string): CanonicalRole[] {
  if (membershipRole === "company_owner") return [];
  return CANONICAL_ROLES.filter((r) => r.key !== "company_owner");
}
