/**
 * P0 COMPANY_ADMIN BYPASS REMOVAL — autorización de notificaciones.
 *
 * Una notificación operativa (no-show, cobertura, cierre, nómina, documentos)
 * expone datos de personas y servicios. Recibirla exige el mismo permiso que
 * ver esa superficie. Las notificaciones personales del trabajador
 * (su turno, su chat, su documento) nunca se filtran.
 */

/** Categoría operativa → permiso mínimo para RECIBIRLA. */
const OPERATIONAL_NOTIFICATION_PERMISSIONS: Record<string, string[]> = {
  no_show_alert: ["attendance.view", "time_entries.view"],
  NO_SHOW_ALERT: ["attendance.view", "time_entries.view"],
  late_arrival: ["attendance.view", "time_entries.view"],
  missing_clock_out: ["attendance.view", "time_entries.view"],
  clock_alert: ["attendance.view", "time_entries.view"],
  coverage_gap: ["staffing.view"],
  shift_uncovered: ["staffing.view"],
  staffing_request: ["staffing.view"],
  shift_assignment_pending: ["staffing.view"],
  shift_published: ["service.view"],
  shift_cancelled_admin: ["service.view"],
  service_closed: ["service.close", "service.view"],
  closeout_pending: ["closeout.close_day"],
  payroll_period_ready: ["payroll.view"],
  payroll_review: ["payroll.view"],
  invoice_created: ["payroll.view"],
  document_expiring: ["documents.view"],
  document_review: ["documents.view"],
  worker_application: ["workers.view"],
  worker_invitation: ["workers.invite"],
};

/** ¿La categoría es operativa (de empresa) y por tanto exige permiso? */
export function isOperationalNotification(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPERATIONAL_NOTIFICATION_PERMISSIONS, type);
}

/** Permisos que habilitan recibir esa categoría (vacío = personal). */
export function notificationPermissionsFor(type: string): string[] {
  return OPERATIONAL_NOTIFICATION_PERMISSIONS[type] ?? [];
}

/**
 * ¿Esta persona puede recibir esta notificación en esta empresa?
 * `canAny` viene de `usePermissions`.
 */
export function canReceiveNotification(
  type: string,
  canAny: (permissions: string[]) => boolean,
): boolean {
  const required = notificationPermissionsFor(type);
  if (required.length === 0) return true;
  return canAny(required);
}
