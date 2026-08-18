/**
 * ASSIGNMENT STATUS TRUTH — Fuente única de verdad del vocabulario de estados
 * ===========================================================================
 *
 * Origen: `docs/qa/P0_CARLOS_SCHEDULING_VS_PORTAL_DIVERGENCE_AUDIT.md`.
 *
 * Problema resuelto: Scheduling contaba `accepted` como asignación real y
 * Passport/Experiencia sólo contaba `confirmed`. 3.845 filas `accepted`
 * quedaban invisibles. La solución NO es hacer backfill de datos: es que
 * todas las superficies interpreten el mismo vocabulario.
 *
 * Semántica canónica de `shift_assignments.status`:
 *
 *   pending    → la persona está asignada; el compromiso aún no se cerró.
 *   accepted   → asignación operativa firme (la mayoría del histórico real).
 *   confirmed  → asignación operativa firme (vocabulario del importador/admin).
 *   scheduled  → alias legacy de asignación firme.
 *   rejected   → la persona rechazó. No es operativa.
 *   declined   → alias de rejected.
 *   removed    → la administración la sacó del turno. No es operativa.
 *   cancelled / canceled / unassigned / replaced → alias de removed.
 *
 * Reglas:
 *  - OPERATIVA (cuenta como asignación viva) = todo lo que no está excluido.
 *  - FIRME (compromiso cerrado) = accepted | confirmed | scheduled.
 *  - `response_status` es la verdad del trabajador y NO se mezcla aquí:
 *    describe si la persona respondió, no si la asignación existe.
 *
 * Este módulo es puro: no consulta, no escribe, no muta estados almacenados.
 */

/** Estados que sacan a la persona del turno. Nunca operativos. */
export const EXCLUDED_ASSIGNMENT_STATUSES = [
  "removed",
  "rejected",
  "declined",
  "cancelled",
  "canceled",
  "unassigned",
  "replaced",
] as const;

/** Estados en los que el compromiso está cerrado. */
export const COMMITTED_ASSIGNMENT_STATUSES = [
  "accepted",
  "confirmed",
  "scheduled",
] as const;

/** Estados operativos conocidos (firmes + pendientes de respuesta). */
export const OPERATIONAL_ASSIGNMENT_STATUSES = [
  ...COMMITTED_ASSIGNMENT_STATUSES,
  "pending",
] as const;

const EXCLUDED = new Set<string>(EXCLUDED_ASSIGNMENT_STATUSES);
const COMMITTED = new Set<string>(COMMITTED_ASSIGNMENT_STATUSES);

const norm = (status: string | null | undefined): string =>
  (status ?? "").trim().toLowerCase();

/**
 * ¿La asignación sigue viva en el turno?
 * Un estado desconocido se considera operativo: preferimos mostrar de más en
 * la vista de la persona antes que ocultarle un turno real.
 */
export function isOperationalAssignmentStatus(status: string | null | undefined): boolean {
  return !EXCLUDED.has(norm(status));
}

/** ¿El compromiso está cerrado? (`accepted` cuenta igual que `confirmed`). */
export function isCommittedAssignmentStatus(status: string | null | undefined): boolean {
  return COMMITTED.has(norm(status));
}

/** ¿Fue retirada/rechazada? */
export function isExcludedAssignmentStatus(status: string | null | undefined): boolean {
  return EXCLUDED.has(norm(status));
}

/**
 * Filtro PostgREST para `.not("status", "in", …)`.
 * Única forma permitida de excluir asignaciones en una consulta.
 */
export const EXCLUDED_ASSIGNMENT_STATUS_FILTER = `(${EXCLUDED_ASSIGNMENT_STATUSES.join(",")})`;

/**
 * Lista para `.in("status", …)` cuando una superficie sólo quiere historia
 * con compromiso cerrado (Passport / Experiencia / horas trabajadas).
 */
export const COMMITTED_ASSIGNMENT_STATUS_LIST: string[] = [...COMMITTED_ASSIGNMENT_STATUSES];
