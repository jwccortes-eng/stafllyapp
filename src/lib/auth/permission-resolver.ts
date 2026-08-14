/**
 * RESOLVER ÚNICO DE AUTORIZACIÓN (puro, testeable).
 *
 * Espejo exacto de `public.has_permission(user, company, permission)`.
 * Frontend y backend deben responder lo mismo para la misma entrada.
 *
 * P0 AUTHORIZATION MODEL HARDENING — modelo vigente:
 *
 *   efectivo = override explícito (user + company real)
 *              ?? default del rol operativo (allowlist)
 *
 *   - `company_users.role = 'admin'` NO concede acceso total.
 *   - Solo `company_owner` (en su compañía) y el staff de plataforma
 *     (`user_roles` developer/owner) tienen acceso total.
 *   - Lo no concedido, se deniega. No hay fallback a "full" ni a filas
 *     legacy con `company_id IS NULL`.
 */
import { getPermissionSpec } from "./permission-catalog";
import {
  resolveOperatingRoleKey,
  roleDefaultGrants,
  type OperatingRoleKey,
} from "./role-defaults";

export type AuthorizationStatus = "loading" | "ready" | "error";

export interface ModulePermissionRow {
  module: string;
  company_id: string | null;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface ActionPermissionRow {
  action: string;
  company_id: string | null;
  granted: boolean;
}

export interface AuthorizationInput {
  /** Roles globales de `user_roles`. */
  globalRoles: ReadonlySet<string>;
  /** Rol de membresía por compañía de `company_users.role`. */
  companyRoles: Readonly<Record<string, string>>;
  /** Rol operativo explícito por compañía (`company_users.operating_role_key`). */
  operatingRoles?: Readonly<Record<string, string | null>>;
  modulePermissions: readonly ModulePermissionRow[];
  actionPermissions: readonly ActionPermissionRow[];
}

/** Roles que otorgan acceso total (espejo de is_global_owner + developer/owner). */
const GLOBAL_FULL_ACCESS = new Set(["developer", "owner"]);

/**
 * Permisos NO removibles para un `company_owner`.
 * Quitarlos dejaría a la empresa sin dueño operativo ni forma de recuperarse
 * (lockout administrativo).
 */
export const PROTECTED_OWNER_PERMISSIONS: ReadonlySet<string> = new Set([
  "users.manage",
  "roles.manage",
  "company.settings",
]);

/**
 * Permisos que SOLO el dueño de la compañía o el staff de plataforma pueden
 * ejercer. Ningún rol operativo ni override puede concederlos.
 */
export const OWNER_ONLY_PERMISSIONS: ReadonlySet<string> = new Set([
  "users.manage",
  "roles.manage",
  "company.settings",
]);

export function hasGlobalFullAccess(input: AuthorizationInput): boolean {
  for (const r of input.globalRoles) if (GLOBAL_FULL_ACCESS.has(r)) return true;
  return false;
}

/** Dueño de ESA compañía (membresía, nunca rol global). */
export function isCompanyOwner(input: AuthorizationInput, companyId: string | null): boolean {
  if (!companyId) return false;
  return input.companyRoles[companyId] === "company_owner";
}

/** Acceso total: staff de plataforma o dueño de la compañía. */
export function isFullAccess(input: AuthorizationInput, companyId: string | null): boolean {
  return hasGlobalFullAccess(input) || isCompanyOwner(input, companyId);
}

/** Rol operativo efectivo de la persona en la compañía indicada. */
export function operatingRoleFor(
  input: AuthorizationInput,
  companyId: string | null,
): OperatingRoleKey | null {
  if (!companyId) return null;
  return resolveOperatingRoleKey(
    input.companyRoles[companyId] ?? null,
    input.operatingRoles?.[companyId] ?? null,
  );
}

/**
 * Override explícito para la compañía activa.
 * `undefined` = no hay fila explícita (se hereda del rol operativo).
 *
 * Solo se consideran filas con el `company_id` REAL de la compañía activa.
 * Las filas legacy (`company_id IS NULL`) y las escritas contra compañías
 * placeholder no autorizan ni deniegan nada.
 */
export function explicitOverride(
  input: AuthorizationInput,
  permission: string,
  companyId: string | null,
): boolean | undefined {
  const spec = getPermissionSpec(permission);
  if (!spec || companyId === null) return undefined;

  let saw = false;
  let anyTrue = false;

  if (spec.legacyAction) {
    const row = input.actionPermissions.find(
      (r) => r.action === spec.legacyAction && r.company_id === companyId,
    );
    if (row) {
      saw = true;
      if (row.granted) anyTrue = true;
    }
  }

  if (spec.legacyModule && spec.legacyLevel) {
    const row = input.modulePermissions.find(
      (r) => r.module === spec.legacyModule && r.company_id === companyId,
    );
    if (row) {
      saw = true;
      const v =
        spec.legacyLevel === "view" ? row.can_view : spec.legacyLevel === "edit" ? row.can_edit : row.can_delete;
      if (v) anyTrue = true;
    }
  }

  return saw ? anyTrue : undefined;
}

/**
 * `can(permission, companyId)` — única autoridad de autorización en frontend.
 */
export function evaluatePermission(
  input: AuthorizationInput,
  permission: string,
  companyId: string | null,
): boolean {
  const spec = getPermissionSpec(permission);
  if (!spec) return false;

  // 1) Staff de plataforma: acceso total, nunca restringible por compañía.
  if (hasGlobalFullAccess(input)) return true;

  if (!companyId) return false;

  const override = explicitOverride(input, permission, companyId);

  // 2) Dueño de la compañía: acceso total dentro de SU compañía.
  //    Sus permisos críticos son irrevocables (anti-lockout); el resto puede
  //    restringirse con un override explícito de esa misma compañía.
  if (isCompanyOwner(input, companyId)) {
    if (PROTECTED_OWNER_PERMISSIONS.has(permission)) return true;
    return override ?? true;
  }

  // 3) Permisos reservados al dueño: ningún rol operativo ni override los
  //    concede a una membresía que no sea dueña de la compañía.
  if (OWNER_ONLY_PERMISSIONS.has(permission)) return false;

  // 4) Override explícito de esta compañía (concede o deniega).
  if (override !== undefined) return override;

  // 5) Default del rol operativo (allowlist). Deny by default.
  return roleDefaultGrants(operatingRoleFor(input, companyId), permission);
}
