/**
 * Role helpers — Sprint S3 (centralized)
 *
 * Single source of truth for "is this role admin-level?" checks across the
 * UI. Mirrors the `ADMIN_ROLES` set used internally by `useAuth.tsx`.
 *
 * Use ONLY for UI gating that is already tenant-scoped by the caller
 * (e.g. role resolved via `getRoleForCompany(selectedCompanyId)`).
 *
 * DO NOT use this with the deprecated global `canAccessAdmin` flag — that
 * leaks cross-tenant. For per-tenant gating, call
 * `canAccessAdminForCompany(companyId)` from `useAuth`.
 *
 * This helper does NOT change permissions, RLS, or auth behavior. It only
 * centralizes a duplicated string comparison.
 */

export type AdminLevelRole =
  | "developer"
  | "owner"
  | "company_owner"
  | "admin";

const ADMIN_LEVEL_ROLES: ReadonlySet<string> = new Set<string>([
  "developer",
  "owner",
  "company_owner",
  "admin",
]);

/** True for roles that have full admin-level UI access in the current scope. */
export function isAdminLevelRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_LEVEL_ROLES.has(role);
}

/** Manager / supervisor — gated UI access (module permissions apply). */
const GATED_ADMIN_ROLES: ReadonlySet<string> = new Set<string>([
  "manager",
  "supervisor",
]);

export function isGatedAdminRole(role: string | null | undefined): boolean {
  return !!role && GATED_ADMIN_ROLES.has(role);
}
