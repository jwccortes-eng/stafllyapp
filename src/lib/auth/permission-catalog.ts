/**
 * CATÁLOGO CANÓNICO DE PERMISOS — P1 Permission System Consolidation.
 *
 * Fuente única de verdad del nombre de cada permiso administrativo.
 * NO es un sistema nuevo: cada permiso canónico se mapea al sistema que ya
 * existe (`action_permissions` con `company_id`, y `module_permissions`
 * ahora también con `company_id`).
 *
 * Este archivo DEBE mantenerse en espejo con la función SQL
 * `public.permission_catalog()`, que es la autoridad en backend/RLS.
 */

export type PermissionDomain =
  | "services"
  | "staffing"
  | "attendance"
  | "people"
  | "clients"
  | "documents"
  | "communication"
  | "payroll"
  | "admin";

export type ModuleLevel = "view" | "edit" | "delete";

export interface PermissionSpec {
  /** Nombre canónico, p. ej. `service.publish`. */
  permission: string;
  domain: PermissionDomain;
  label: string;
  /** Acción legacy equivalente en `action_permissions` (si existe). */
  legacyAction: string | null;
  /** Módulo legacy equivalente en `module_permissions` (si existe). */
  legacyModule: string | null;
  legacyLevel: ModuleLevel | null;
  /** true = permite escribir datos. Prioridad máxima para enforcement. */
  write: boolean;
}

export const DOMAIN_LABELS: Record<PermissionDomain, string> = {
  services: "Servicios",
  staffing: "Staffing",
  attendance: "Horas y cierre",
  people: "Equipo",
  clients: "Clientes y ubicaciones",
  documents: "Documentos",
  communication: "Comunicación",
  payroll: "Payroll",
  admin: "Administración",
};

const P = (
  permission: string,
  domain: PermissionDomain,
  label: string,
  legacyAction: string | null,
  legacyModule: string | null,
  legacyLevel: ModuleLevel | null,
  write: boolean,
): PermissionSpec => ({ permission, domain, label, legacyAction, legacyModule, legacyLevel, write });

export const PERMISSION_CATALOG: readonly PermissionSpec[] = [
  // Servicios
  P("service.view", "services", "Ver servicios", null, "shifts", "view", false),
  P("service.create", "services", "Crear servicios", "crear_turno", "shifts", "edit", true),
  P("service.edit", "services", "Editar servicios", "editar_turno", "shifts", "edit", true),
  P("service.publish", "services", "Publicar servicios", "editar_turno", "shifts", "edit", true),
  P("service.cancel", "services", "Cancelar / eliminar servicios", "eliminar_turno", "shifts", "delete", true),
  P("service.close", "services", "Cerrar servicios", "cerrar_turno", "shifts", "edit", true),
  P("service.reopen", "services", "Reabrir servicios", "reabrir_turno", "shifts", "edit", true),

  // Staffing
  P("staffing.view", "staffing", "Ver staffing", null, "shifts", "view", false),
  P("staffing.assign", "staffing", "Asignar personas", "asignar_turno", "shifts", "edit", true),
  P("staffing.replace", "staffing", "Reemplazar personas", "asignar_turno", "shifts", "edit", true),
  P("staffing.remove", "staffing", "Quitar personas", "asignar_turno", "shifts", "edit", true),

  // Horas y cierre
  P("attendance.view", "attendance", "Ver asistencia", null, "timeclock", "view", false),
  P("time_entries.view", "attendance", "Ver registros de horas", null, "timeclock", "view", false),
  P("time_entries.review", "attendance", "Revisar registros", "editar_clock", "timeclock", "edit", true),
  P("time_entries.adjust", "attendance", "Ajustar horas", "editar_clock", "timeclock", "edit", true),
  P("time_entries.approve", "attendance", "Aprobar horas", "aprobar_clock", "timeclock", "edit", true),
  P("closeout.close_day", "attendance", "Cerrar día", "cerrar_dia", "timeclock", "edit", true),
  P("closeout.reopen_day", "attendance", "Reabrir día", "reabrir_dia", "timeclock", "edit", true),

  // Equipo
  P("workers.view", "people", "Ver personas", null, "employees", "view", false),
  P("workers.edit", "people", "Editar personas", null, "employees", "edit", true),
  P("workers.documents", "people", "Gestionar documentos de personas", null, "employees", "edit", true),
  P("workers.invite", "people", "Invitar personas", null, "employees", "edit", true),

  // Clientes y ubicaciones
  P("clients.view", "clients", "Ver clientes", null, "clients", "view", false),
  P("clients.edit", "clients", "Editar clientes", null, "clients", "edit", true),
  P("locations.view", "clients", "Ver ubicaciones", null, "locations", "view", false),
  P("locations.edit", "clients", "Editar ubicaciones", null, "locations", "edit", true),

  // Documentos
  P("documents.view", "documents", "Ver documentos", null, "employees", "view", false),
  P("documents.manage", "documents", "Gestionar documentos", null, "employees", "edit", true),

  // Comunicación
  P("announcements.publish", "communication", "Publicar en el feed", "publicar_anuncio", "announcements", "edit", true),
  P("announcements.edit", "communication", "Editar publicaciones", "editar_anuncio", "announcements", "edit", true),
  P("announcements.delete", "communication", "Eliminar publicaciones", "eliminar_anuncio", "announcements", "delete", true),
  P("announcements.pin", "communication", "Fijar publicaciones", "fijar_anuncio", "announcements", "edit", true),

  // Payroll
  P("payroll.view", "payroll", "Ver payroll y salarios", "ver_salarios", "summary", "view", false),
  P("payroll.manage", "payroll", "Gestionar payroll", "editar_nomina", "periods", "edit", true),
  P("payroll.approve", "payroll", "Aprobar payroll", "aprobar_nomina", "periods", "edit", true),
  P("payroll.export", "payroll", "Exportar payroll", "exportar_nomina", "summary", "view", false),
  P("reports.view", "payroll", "Ver reportes", "ver_reportes", "reports", "view", false),

  // Administración
  P("users.manage", "admin", "Administrar usuarios", null, null, null, true),
  P("roles.manage", "admin", "Administrar roles y permisos", null, null, null, true),
  P("company.settings", "admin", "Configuración de empresa", "configurar_empresa", null, null, true),
  P("payroll.settings", "admin", "Configuración de nómina", "configurar_nomina", null, null, true),
] as const;

export type CanonicalPermission = (typeof PERMISSION_CATALOG)[number]["permission"];

const BY_KEY = new Map(PERMISSION_CATALOG.map((p) => [p.permission, p]));

export function getPermissionSpec(permission: string): PermissionSpec | undefined {
  return BY_KEY.get(permission);
}

export function permissionsByDomain(): Record<PermissionDomain, PermissionSpec[]> {
  const out = {} as Record<PermissionDomain, PermissionSpec[]>;
  for (const spec of PERMISSION_CATALOG) {
    (out[spec.domain] ??= []).push(spec);
  }
  return out;
}

/** Acciones legacy únicas que la consola puede escribir en `action_permissions`. */
export const CATALOG_ACTIONS: readonly string[] = [
  ...new Set(PERMISSION_CATALOG.map((p) => p.legacyAction).filter((a): a is string => !!a)),
];

/** Módulos legacy únicos que la consola puede escribir en `module_permissions`. */
export const CATALOG_MODULES: readonly string[] = [
  ...new Set(PERMISSION_CATALOG.map((p) => p.legacyModule).filter((m): m is string => !!m)),
];

/** Resumen humano del acceso efectivo (FASE 9). */
export function summarizeAccess(granted: Set<string>): string {
  const domains = new Set<PermissionDomain>();
  const missing = new Set<PermissionDomain>();
  for (const spec of PERMISSION_CATALOG) {
    if (granted.has(spec.permission)) domains.add(spec.domain);
  }
  for (const spec of PERMISSION_CATALOG) {
    if (!domains.has(spec.domain)) missing.add(spec.domain);
  }
  const has = [...domains].map((d) => DOMAIN_LABELS[d]);
  const no = [...missing].map((d) => DOMAIN_LABELS[d]);
  if (has.length === 0) return "Esta persona no tiene acceso administrativo en esta empresa.";
  const first = `Puede administrar ${has.join(", ")}`;
  return no.length ? `${first}; no tiene acceso a ${no.join(", ")}.` : `${first}.`;
}
