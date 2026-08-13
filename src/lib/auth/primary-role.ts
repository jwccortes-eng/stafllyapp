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
  getCanonicalRole,
  templateActionsFor,
  type CanonicalRole,
  type PermissionScope,
} from "./role-model";

export interface RoleSuggestion {
  role: CanonicalRole;
  /** Similitud Jaccard 0..1 entre overrides concedidos y la plantilla. */
  score: number;
}

export interface PrimaryRoleResult {
  /** Rol canónico vigente (explícito o derivado de la membresía). */
  role: CanonicalRole | null;
  /** Etiqueta lista para mostrar (nunca vacía). */
  label: string;
  scope: PermissionScope;
  scopeLabel: string;
  /** No hay rol explícito y el acceso no coincide con ninguna plantilla. */
  custom: boolean;
  /** true cuando el rol viene de `company_users.operating_role_key`. */
  explicit: boolean;
  /** Diagnóstico Jaccard. NUNCA reasigna el rol; solo informa. */
  suggestion: RoleSuggestion | null;
}

/** Rol por defecto de una membresía cuando no hay rol explícito. */
function defaultForMembership(membershipRole: string): CanonicalRole | null {
  if (membershipRole === "company_owner") return CANONICAL_ROLES.find((r) => r.key === "company_owner") ?? null;
  if (membershipRole === "manager") return CANONICAL_ROLES.find((r) => r.key === "service_supervisor") ?? null;
  if (membershipRole === "employee") return CANONICAL_ROLES.find((r) => r.key === "worker") ?? null;
  return null; // admin: acceso total de empresa hasta que se asigne un rol operativo
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
};

/**
 * DIAGNÓSTICO. Rol al que más se parecen los overrides concedidos.
 * Solo se usa para sugerir/migrar, nunca como fuente de verdad del rol.
 */
export function suggestRoleFromOverrides(
  actionOverrides: Record<string, boolean> = {},
): RoleSuggestion | null {
  const entries = Object.entries(actionOverrides);
  if (entries.length === 0) return null;
  const granted = new Set(entries.filter(([, v]) => v).map(([k]) => k));
  if (granted.size === 0) return null;

  let best: RoleSuggestion | null = null;
  for (const role of CANONICAL_ROLES) {
    if (role.key === "company_owner") continue;
    const score = jaccard(granted, new Set(templateActionsFor(role)));
    if (!best || score > best.score) best = { role, score };
  }
  return best;
}

const result = (
  role: CanonicalRole | null,
  opts: { label?: string; custom?: boolean; explicit: boolean; suggestion: RoleSuggestion | null; scope?: PermissionScope },
): PrimaryRoleResult => {
  const scope = role?.scope ?? opts.scope ?? "COMPANY";
  return {
    role,
    label: opts.label ?? role?.label ?? "Acceso personalizado",
    scope,
    scopeLabel: SCOPE_LABELS[scope],
    custom: opts.custom ?? false,
    explicit: opts.explicit,
    suggestion: opts.suggestion,
  };
};

/**
 * ROL OPERATIVO VIGENTE.
 *
 * Prioridad:
 *   1. Rol explícito de la membresía (`company_users.operating_role_key`).
 *   2. Owner: nunca se degrada por overrides.
 *   3. Default de la membresía cuando no hay rol explícito.
 *
 * Los overrides NO determinan el rol: solo alimentan la sugerencia.
 */
export function resolvePrimaryRole(
  membershipRole: string,
  actionOverrides: Record<string, boolean> = {},
  explicitRoleKey?: string | null,
): PrimaryRoleResult {
  const suggestion = suggestRoleFromOverrides(actionOverrides);

  // 2. Owner protegido.
  if (membershipRole === "company_owner") {
    const owner = CANONICAL_ROLES.find((r) => r.key === "company_owner") ?? null;
    return result(owner, { explicit: true, suggestion });
  }

  // 1. Rol explícito.
  if (explicitRoleKey) {
    const explicit = getCanonicalRole(explicitRoleKey) ?? null;
    if (explicit) return result(explicit, { explicit: true, suggestion });
  }

  // 3. Default de membresía.
  const fallback = defaultForMembership(membershipRole);
  if (fallback) return result(fallback, { explicit: false, suggestion });

  return result(null, {
    label: "Administrador de empresa",
    explicit: false,
    suggestion,
    scope: "COMPANY",
  });
}


/**
 * Roles que se pueden asignar como rol principal desde la consola.
 * `company_owner` no se asigna aquí: se define en la membresía.
 */
export function assignableRoles(membershipRole: string): CanonicalRole[] {
  if (membershipRole === "company_owner") return [];
  return CANONICAL_ROLES.filter((r) => r.key !== "company_owner");
}
