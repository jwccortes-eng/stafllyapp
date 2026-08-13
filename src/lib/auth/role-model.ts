/**
 * MODELO CANÓNICO DE ROLES + SCOPE — P1.
 *
 * NO es un sistema de permisos nuevo. Es la capa que da nombre operativo a lo
 * que ya existe:
 *
 *   Auth User → Company Membership (`company_users.role`)
 *             → Role Template (`role_templates`, filas de sistema)
 *             → Permissions (`permission-catalog.ts`)
 *             → Scope (esta capa)
 *
 * Reglas:
 *  - Un permiso = un nombre. El alcance NO se duplica en permisos distintos
 *    (`attendance.view` es uno solo; cambia su SCOPE según el rol).
 *  - El nombre visible de un rol puede variar por empresa (Supervisor /
 *    Captain / Headwaiter) pero la clave técnica es única.
 */
import { PERMISSION_CATALOG, type PermissionDomain } from "./permission-catalog";

/* ------------------------------------------------------------------ scope */

export type PermissionScope = "SELF" | "ASSIGNED_SERVICE" | "COMPANY" | "PLATFORM";

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  SELF: "Solo su información",
  ASSIGNED_SERVICE: "Solo servicios asignados",
  COMPANY: "Toda la empresa",
  PLATFORM: "Toda la plataforma",
};

const SCOPE_RANK: Record<PermissionScope, number> = {
  SELF: 0,
  ASSIGNED_SERVICE: 1,
  COMPANY: 2,
  PLATFORM: 3,
};

/** ¿El alcance concedido alcanza para lo que se pretende hacer? */
export function scopeAllows(granted: PermissionScope, required: PermissionScope): boolean {
  return SCOPE_RANK[granted] >= SCOPE_RANK[required];
}

/* ------------------------------------------------------------------ roles */

export type CanonicalRoleKey =
  | "company_owner"
  | "shift_admin"
  | "time_closeout_admin"
  | "payroll_admin"
  | "payroll_approver"
  | "service_supervisor"
  | "worker";

export interface CanonicalRole {
  key: CanonicalRoleKey;
  /** Nombre por defecto (una empresa puede renombrarlo en su plantilla). */
  label: string;
  description: string;
  /** Nombre de la fila en `role_templates` que materializa este rol. */
  templateName: string | null;
  /** Rol de `company_users` con el que se emparejan estas plantillas. */
  membershipRole: "company_owner" | "admin" | "manager" | "employee";
  /** Permisos canónicos concedidos. `"*"` = acceso total de compañía. */
  permissions: readonly string[] | "*";
  /** Alcance por defecto de este rol. */
  scope: PermissionScope;
  /** Excepciones de alcance por dominio. */
  scopeByDomain?: Partial<Record<PermissionDomain, PermissionScope>>;
  /** Alias visibles conocidos (mismo rol técnico). */
  aliases?: readonly string[];
}

const SERVICE_OPS = [
  "service.view",
  "service.create",
  "service.edit",
  "service.publish",
  "service.cancel",
  "staffing.view",
  "staffing.assign",
  "staffing.replace",
  "staffing.remove",
  "workers.view",
  "clients.view",
  "locations.view",
] as const;

const TIME_OPS = [
  "service.view",
  "attendance.view",
  "time_entries.view",
  "time_entries.review",
  "time_entries.adjust",
  "time_entries.approve",
  "closeout.close_day",
  "closeout.reopen_day",
  "service.close",
  "service.reopen",
  "workers.view",
] as const;

export const CANONICAL_ROLES: readonly CanonicalRole[] = [
  {
    key: "company_owner",
    label: "Company Owner",
    description: "Responsable total de la empresa. Conserva siempre accesos, permisos y configuración.",
    templateName: null,
    membershipRole: "company_owner",
    permissions: "*",
    scope: "COMPANY",
  },
  {
    key: "shift_admin",
    label: "Shift Administrator",
    description: "Operación diaria: crear, editar, publicar, duplicar, cancelar y asignar servicios.",
    templateName: "Shift Administrator",
    membershipRole: "admin",
    permissions: SERVICE_OPS,
    scope: "COMPANY",
    aliases: ["Supervisor de Turnos", "Coordinador de operación"],
  },
  {
    key: "time_closeout_admin",
    label: "Time & Closeout Administrator",
    description: "Cierre operativo: revisar, ajustar y aprobar horas, asistencia y cierre de servicios.",
    templateName: "Time & Closeout Administrator",
    membershipRole: "admin",
    permissions: TIME_OPS,
    scope: "COMPANY",
    aliases: ["Supervisor de Reloj"],
  },
  {
    key: "payroll_admin",
    label: "Payroll Administrator",
    description: "Prepara pagos, revisa novedades y genera periodos. No aprueba el lote.",
    templateName: "Payroll Administrator",
    membershipRole: "admin",
    permissions: ["payroll.view", "payroll.manage", "payroll.export", "reports.view", "workers.view"],
    scope: "COMPANY",
    aliases: ["Gestor de Nómina"],
  },
  {
    key: "payroll_approver",
    label: "Payroll Approver",
    description: "Revisa y aprueba o rechaza el lote de pago. No ajusta horas históricas.",
    templateName: "Payroll Approver",
    membershipRole: "admin",
    permissions: ["payroll.view", "payroll.approve", "reports.view"],
    scope: "COMPANY",
  },
  {
    key: "service_supervisor",
    label: "Service Supervisor",
    description:
      "Responsable en sitio de los servicios que tiene asignados. Un único rol técnico: el nombre visible cambia por empresa.",
    templateName: "Service Supervisor",
    membershipRole: "manager",
    permissions: [
      "service.view",
      "staffing.view",
      "attendance.view",
      "time_entries.view",
      "time_entries.review",
      "workers.view",
    ],
    scope: "ASSIGNED_SERVICE",
    aliases: ["Supervisor", "Captain", "Headwaiter"],
  },
  {
    key: "worker",
    label: "Worker",
    description: "Portal: sus turnos, su disponibilidad, su reloj, sus documentos y su perfil.",
    templateName: null,
    membershipRole: "employee",
    permissions: [],
    scope: "SELF",
  },
] as const;

const BY_KEY = new Map(CANONICAL_ROLES.map((r) => [r.key, r]));
const BY_TEMPLATE = new Map(
  CANONICAL_ROLES.filter((r) => r.templateName).map((r) => [r.templateName as string, r]),
);

export function getCanonicalRole(key: string): CanonicalRole | undefined {
  return BY_KEY.get(key as CanonicalRoleKey);
}

/** Resuelve el rol canónico a partir del nombre de una plantilla (o su alias). */
export function roleFromTemplateName(name: string): CanonicalRole | undefined {
  const direct = BY_TEMPLATE.get(name);
  if (direct) return direct;
  return CANONICAL_ROLES.find((r) => r.aliases?.some((a) => a.toLowerCase() === name.toLowerCase()));
}

/** Roles canónicos compatibles con un rol de membresía de `company_users`. */
export function rolesForMembership(membershipRole: string): CanonicalRole[] {
  return CANONICAL_ROLES.filter((r) => r.membershipRole === membershipRole);
}

/** ¿Este rol concede el permiso? (`"*"` = acceso total de compañía). */
export function roleGrants(role: CanonicalRole, permission: string): boolean {
  if (role.permissions === "*") return true;
  return role.permissions.includes(permission);
}

/** Alcance efectivo de un permiso para un rol canónico. */
export function resolveScope(role: CanonicalRole, permission: string): PermissionScope | null {
  if (!roleGrants(role, permission)) {
    // El worker no aparece en el catálogo administrativo: su acceso es SELF
    // y lo resuelven las superficies del portal, no la consola.
    return role.key === "worker" ? "SELF" : null;
  }
  const spec = PERMISSION_CATALOG.find((p) => p.permission === permission);
  const byDomain = spec ? role.scopeByDomain?.[spec.domain] : undefined;
  return byDomain ?? role.scope;
}

/** Acciones legacy que debe contener la plantilla de este rol. */
export function templateActionsFor(role: CanonicalRole): string[] {
  if (role.permissions === "*") return [...new Set(PERMISSION_CATALOG.map((p) => p.legacyAction).filter(Boolean) as string[])];
  const wanted = new Set(role.permissions);
  return [
    ...new Set(
      PERMISSION_CATALOG.filter((p) => wanted.has(p.permission) && p.legacyAction).map(
        (p) => p.legacyAction as string,
      ),
    ),
  ];
}
