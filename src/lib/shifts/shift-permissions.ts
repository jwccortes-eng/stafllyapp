/**
 * lib/shifts/shift-permissions.ts
 *
 * Single source of truth for "can this user manage / validate
 * shifts and attendance for the selected company".
 *
 * Allowed:
 *   - cross-tenant: developer, owner, founder
 *   - per-company: admin, manager, supervisor (via canAccessAdminForCompany)
 *
 * Workers can NEVER set their own attendance_status — that is enforced
 * at the RLS layer (Managers can edit shift_assignments policy).
 */

type RoleSet = Set<string>;

const SHIFT_MANAGER_GLOBAL: RoleSet = new Set([
  "developer",
  "owner",
  "founder",
]);

export function canManageShifts(args: {
  allRoles: RoleSet | string[] | undefined;
  canAccessAdminForCompany: (companyId: string | null) => boolean;
  companyId: string | null;
}): boolean {
  const roles = args.allRoles instanceof Set
    ? args.allRoles
    : new Set(args.allRoles ?? []);
  for (const r of roles) {
    if (SHIFT_MANAGER_GLOBAL.has(r)) return true;
  }
  return args.canAccessAdminForCompany(args.companyId);
}

/**
 * P0 — Domain boundary: administrar SERVICIOS no concede autoridad sobre HORAS.
 * Toda mutación de asistencia/horas reales exige permisos del dominio de horas
 * (espejo de la RLS de `time_entries` y de `can_request_shift_correction`).
 */
export const TIME_DOMAIN_WRITE_PERMISSIONS: readonly string[] = [
  "time_entries.review",
  "time_entries.adjust",
  "time_entries.approve",
];

