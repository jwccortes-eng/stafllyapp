/**
 * MAPA CANÓNICO RUTA → PERMISO (P0 Legacy Bypass Retirement).
 *
 * Única fuente de verdad para decidir qué entradas de navegación ve una
 * persona dentro de una empresa. Sustituye a las decisiones por
 * `role === 'admin'` en el sidebar y el layout.
 *
 * Reglas:
 *  - Si una ruta tiene permisos: se muestra solo si la persona tiene AL MENOS
 *    uno (lectura). Sin permiso → oculto.
 *  - Si una ruta no está mapeada: se considera superficie neutra (Home,
 *    Command Center, notificaciones) y se muestra a cualquiera que ya esté
 *    dentro del shell administrativo.
 *  - Las rutas de plataforma se marcan `platformOnly`: solo staff global.
 */

/** Permisos requeridos por ruta (basta con uno). */
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Operación / servicios
  "/app/shifts": ["service.view"],
  "/app/shift-ops": ["service.view"],
  "/app/shift-requests": ["service.view"],
  "/app/backfill-shift": ["service.edit"],
  "/app/bulk-import-shifts": ["service.create"],
  "/app/ops": ["service.view"],
  "/app/ops-center": ["service.view"],
  "/app/daily-ops": ["service.view"],
  "/app/daily-close": ["closeout.close_day", "service.close"],
  "/app/command-center": ["service.view", "attendance.view", "time_entries.view"],
  "/app/needs-attention": ["service.view", "attendance.view", "time_entries.view"],
  "/app/today": ["service.view", "attendance.view", "time_entries.view"],
  "/app/staffing-center": ["staffing.view"],
  "/app/staffing-requests": ["staffing.view"],
  "/app/comparison": ["service.view"],
  "/app/import-schedule": ["service.create"],
  "/app/import": ["payroll.manage"],
  "/app/import-review": ["payroll.view"],
  "/app/service-requests": ["service.view"],
  "/app/service-categories": ["company.settings"],
  "/app/ai-workforce": ["staffing.view"],


  // Horas y cierre
  "/app/timeclock": ["time_entries.view", "attendance.view"],
  "/app/attendance": ["attendance.view"],
  "/app/live-map": ["attendance.view"],
  "/app/kiosk": ["attendance.view"],
  "/app/front-desk": ["attendance.view", "workers.view"],

  // Personas
  "/app/employees": ["workers.view"],
  "/app/people": ["workers.view"],
  "/app/workers": ["workers.view"],
  "/app/workforce": ["workers.view"],
  "/app/identity-quality": ["workers.edit"],
  "/app/directory": ["workers.view"],
  "/app/documents": ["documents.view"],
  "/app/document-intake": ["documents.manage"],
  "/app/compliance-center": ["documents.view"],
  "/app/applications": ["workers.view"],
  "/app/referrals": ["workers.view"],
  "/app/invite": ["workers.invite"],
  "/app/requests": ["workers.view"],
  "/app/w9": ["documents.view"],
  "/app/1099": ["documents.view"],

  // Clientes
  "/app/clients": ["clients.view"],
  "/app/locations": ["locations.view"],
  "/app/client-experience": ["clients.view"],
  "/app/invoicing": ["company.settings"],
  "/app/invoicing/clients": ["clients.view"],
  "/app/invoicing/service-blocks": ["clients.view"],
  "/app/invoicing/invoices": ["payroll.view"],
  "/app/invoices": ["payroll.view"],
  "/app/billing": ["company.settings"],

  // Payroll
  "/app/periods": ["payroll.view"],
  "/app/movements": ["payroll.view"],
  "/app/concepts": ["payroll.view"],
  "/app/summary": ["payroll.view", "reports.view"],
  "/app/reports": ["reports.view", "payroll.view"],
  "/app/advances-loans": ["payroll.view"],
  "/app/payroll-review-queue": ["payroll.view"],
  "/app/validation-center": ["payroll.view", "time_entries.review"],
  "/app/payroll-reconciliation": ["payroll.view"],
  "/app/weekly-payroll-reconciliation": ["payroll.view"],
  "/app/compensation-validation": ["payroll.view"],
  "/app/compensation-adoption": ["payroll.view"],
  "/app/payroll-pilot-close": ["payroll.approve"],
  "/app/payroll-settings": ["payroll.settings"],
  "/app/reconciliation-report": ["payroll.view"],
  "/app/staged-reconciliation": ["payroll.view"],
  "/app/discrepancies": ["reports.view", "payroll.view"],
  "/app/unpaid-shifts": ["reports.view", "payroll.view"],

  // Comunicación y empresa
  "/app/announcements": ["announcements.publish", "announcements.edit"],
  "/app/chat": ["workers.view"],
  "/app/quality": ["workers.view"],
  "/app/admin": ["company.settings"],
  "/app/company-config": ["company.settings"],
  "/app/onboarding": ["company.settings"],
  "/app/permissions": ["roles.manage"],
  "/app/users": ["users.manage"],
  "/app/activity": ["company.settings"],
  "/app/assignment-overrides": ["staffing.assign"],
};


/** Rutas exclusivas de staff de plataforma (developer/owner globales). */
const PLATFORM_ONLY_ROUTES = new Set<string>([
  "/app/migration",
  "/app/dev-command-center",
  "/app/companies",
  "/app/system-health",
]);

export function isPlatformOnlyRoute(to: string): boolean {
  return PLATFORM_ONLY_ROUTES.has(to);
}

/** Permisos requeridos por la ruta, o `null` si es superficie neutra. */
export function navPermissionsFor(to: string): string[] | null {
  return ROUTE_PERMISSIONS[to] ?? null;
}

/**
 * Permisos requeridos por una URL REAL (incluye subrutas y parámetros).
 * Se toma el prefijo mapeado más largo: `/app/employees/:id` hereda de
 * `/app/employees`. Sin coincidencia ⇒ superficie neutra.
 */
export function routePermissionsFor(pathname: string): string[] | null {
  const clean = pathname.replace(/\/+$/, "") || pathname;
  let best: { key: string; perms: string[] } | null = null;
  for (const [key, perms] of Object.entries(ROUTE_PERMISSIONS)) {
    if (clean === key || clean.startsWith(`${key}/`)) {
      if (!best || key.length > best.key.length) best = { key, perms };
    }
  }
  return best?.perms ?? null;
}

/** ¿La URL real pertenece a una superficie exclusiva de plataforma? */
export function isPlatformOnlyPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "") || pathname;
  for (const key of PLATFORM_ONLY_ROUTES) {
    if (clean === key || clean.startsWith(`${key}/`)) return true;
  }
  return false;
}


/**
 * ¿Se muestra esta entrada de navegación?
 * `canAny` viene de `usePermissions`; `isPlatformStaff` de los roles globales.
 */
export function isNavItemVisible(args: {
  to: string;
  canAny: (permissions: string[]) => boolean;
  isPlatformStaff: boolean;
}): boolean {
  if (isPlatformOnlyRoute(args.to)) return args.isPlatformStaff;
  const required = navPermissionsFor(args.to);
  if (!required) return true;
  return args.canAny(required);
}
