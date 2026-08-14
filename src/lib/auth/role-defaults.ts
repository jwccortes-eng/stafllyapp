/**
 * ALLOWLIST DE PERMISOS POR ROL OPERATIVO — P0 Authorization Model Hardening.
 *
 * Cambio de modelo:
 *   ANTES  membership `admin` = acceso total + denegaciones explícitas (denylist).
 *   AHORA  `company_users.operating_role_key` concede explícitamente (allowlist).
 *          Lo que no está concedido, se deniega. No hay fallback a "full".
 *
 * Únicos accesos totales:
 *   - staff de plataforma (`user_roles` developer/owner),
 *   - `company_users.role = 'company_owner'` DENTRO de su compañía.
 *
 * Este archivo debe mantenerse en espejo con la función SQL
 * `public.operating_role_permissions()`.
 */
import { PERMISSION_CATALOG } from "./permission-catalog";
import { CANONICAL_ROLES, type CanonicalRoleKey } from "./role-model";

/**
 * Rol sintético para membresías `admin` que todavía NO tienen
 * `operating_role_key`. No autoriza escrituras: solo lectura operativa,
 * para que la persona pueda trabajar mientras el dueño le asigna su rol.
 */
export const UNASSIGNED_ADMIN_ROLE = "admin_unassigned";

export type OperatingRoleKey = CanonicalRoleKey | typeof UNASSIGNED_ADMIN_ROLE;

const READ_ONLY_OPS: readonly string[] = [
  "service.view",
  "staffing.view",
  "attendance.view",
  "time_entries.view",
  "workers.view",
  "clients.view",
  "locations.view",
  "documents.view",
];

const ALL_PERMISSIONS: readonly string[] = PERMISSION_CATALOG.map((p) => p.permission);

/** Permisos concedidos por cada rol operativo. `company_owner` = todo. */
const ROLE_DEFAULTS: Record<string, readonly string[]> = (() => {
  const out: Record<string, readonly string[]> = {};
  for (const role of CANONICAL_ROLES) {
    out[role.key] = role.permissions === "*" ? ALL_PERMISSIONS : [...role.permissions];
  }
  out[UNASSIGNED_ADMIN_ROLE] = READ_ONLY_OPS;
  return out;
})();

const ROLE_SETS: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries(ROLE_DEFAULTS).map(([k, v]) => [k, new Set(v)]),
);

/**
 * Rol operativo efectivo de una persona en una compañía.
 *
 * `company_owner` NO es sobrescribible por `operating_role_key` (anti-lockout).
 * `admin` sin rol explícito cae en `admin_unassigned` (solo lectura), nunca en
 * acceso total.
 */
export function resolveOperatingRoleKey(
  membershipRole: string | null | undefined,
  explicitRoleKey: string | null | undefined,
): OperatingRoleKey | null {
  if (membershipRole === "company_owner") return "company_owner";

  const explicit = explicitRoleKey?.trim();
  if (explicit && explicit in ROLE_SETS && explicit !== "company_owner") {
    return explicit as OperatingRoleKey;
  }
  // Un `operating_role_key = 'company_owner'` sin membresía de dueño NO
  // concede acceso de dueño: se ignora (evita escalada por edición de rol).
  if (explicit === "company_owner") return UNASSIGNED_ADMIN_ROLE;

  switch (membershipRole) {
    case "admin":
      return UNASSIGNED_ADMIN_ROLE;
    case "manager":
    case "supervisor":
      return "service_supervisor";
    case "employee":
      return "worker";
    default:
      return null;
  }
}

/** ¿El rol operativo concede este permiso por defecto? */
export function roleDefaultGrants(
  roleKey: OperatingRoleKey | null,
  permission: string,
): boolean {
  if (!roleKey) return false;
  return ROLE_SETS[roleKey]?.has(permission) ?? false;
}

/** Permisos concedidos por defecto por un rol operativo (para la consola). */
export function roleDefaultPermissions(roleKey: OperatingRoleKey | null): readonly string[] {
  if (!roleKey) return [];
  return ROLE_DEFAULTS[roleKey] ?? [];
}

export const OPERATING_ROLE_KEYS: readonly string[] = Object.keys(ROLE_DEFAULTS);
