/**
 * RESOLVER ÚNICO DE AUTORIZACIÓN (puro, testeable).
 *
 * Espejo exacto de `public.has_permission(user, company, permission)`.
 * Frontend y backend deben responder lo mismo para la misma entrada.
 */
import { getPermissionSpec, type ModuleLevel } from "./permission-catalog";

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
  /** Rol por compañía de `company_users`. */
  companyRoles: Readonly<Record<string, string>>;
  modulePermissions: readonly ModulePermissionRow[];
  actionPermissions: readonly ActionPermissionRow[];
}

/** Roles que otorgan acceso total (espejo de is_global_owner + developer/owner). */
const GLOBAL_FULL_ACCESS = new Set(["developer", "owner"]);
/** Roles por compañía con acceso total dentro de ESA compañía. */
const COMPANY_FULL_ACCESS = new Set(["company_owner", "admin"]);

/**
 * Permisos NO removibles para un `company_owner`.
 * Quitarlos dejaría a la empresa sin dueño operativo ni forma de recuperarse
 * (lockout administrativo). Documentado en
 * docs/qa/P0_PERMISSION_CONSOLE_EDITABLE_STATE_FIX.md
 */
export const PROTECTED_OWNER_PERMISSIONS: ReadonlySet<string> = new Set([
  "users.manage",
  "roles.manage",
  "company.settings",
]);

export function hasGlobalFullAccess(input: AuthorizationInput): boolean {
  for (const r of input.globalRoles) if (GLOBAL_FULL_ACCESS.has(r)) return true;
  return false;
}

export function isFullAccess(input: AuthorizationInput, companyId: string | null): boolean {
  if (hasGlobalFullAccess(input)) return true;
  if (!companyId) return false;
  const cRole = input.companyRoles[companyId];
  return !!cRole && COMPANY_FULL_ACCESS.has(cRole);
}


function moduleAllows(
  input: AuthorizationInput,
  companyId: string | null,
  module: string,
  level: ModuleLevel,
): boolean {
  const pick = (row: ModulePermissionRow | undefined) =>
    row
      ? level === "view"
        ? row.can_view
        : level === "edit"
          ? row.can_edit
          : row.can_delete
      : undefined;

  // 1) fila explícita de la compañía activa
  const scoped = input.modulePermissions.find((r) => r.module === module && r.company_id === companyId);
  const scopedValue = pick(scoped);
  if (scopedValue !== undefined) return scopedValue;

  // 2) fallback heredado (company_id NULL) — preserva el comportamiento previo
  const legacy = input.modulePermissions.find((r) => r.module === module && r.company_id === null);
  return pick(legacy) ?? false;
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

  const full = isFullAccess(input, companyId);

  // users.manage / roles.manage / configuración pura: solo administración de compañía.
  if (!spec.legacyAction && !spec.legacyModule) return full;
  if (full) return true;

  if (spec.legacyAction) {
    const row = input.actionPermissions.find(
      (r) => r.action === spec.legacyAction && r.company_id === companyId,
    );
    if (row?.granted) return true;
  }

  if (spec.legacyModule && spec.legacyLevel) {
    if (moduleAllows(input, companyId, spec.legacyModule, spec.legacyLevel)) return true;
  }

  return false;
}
