/**
 * WORKER VISIBLE SHIFTS — Fuente única de verdad
 * ==============================================
 *
 * Origen: `docs/qa/P0_WORKER_SHIFT_VISIBILITY_ROOT_CAUSE.md`.
 *
 * Cadena canónica, sin atajos:
 *
 *   Auth User → employee canónico → identity set → shift_assignments
 *   → frontera de company → resolveShiftPublicationTruth → turnos visibles
 *
 * - La identidad la resuelve `@/lib/identity/identity-set`.
 * - La publicación la resuelve `@/lib/shifts/publication-truth`. NO se duplica.
 * - Este módulo no escribe, no mueve asignaciones, no toca payroll ni
 *   time_entries. Sólo decide QUÉ puede ver una persona.
 */

import { resolveIdentityEmployeeIds } from "@/lib/identity/identity-set";
import {
  resolveShiftPublicationTruth,
  type ShiftPublicationTruth,
  type ShiftTruthAssignmentInput,
  type ShiftTruthShiftInput,
} from "@/lib/shifts/publication-truth";

/** Fila de asignación con su turno embebido, tal como la devuelve el join. */
export interface WorkerAssignmentRow {
  id?: string;
  employee_id?: string | null;
  company_id?: string | null;
  status?: string | null;
  response_status?: string | null;
  is_draft_reservation?: boolean | null;
  notified_at?: string | null;
  scheduled_shifts?: (ShiftTruthShiftInput & Record<string, unknown>) | null;
}

export interface WorkerVisibleShift<T extends WorkerAssignmentRow = WorkerAssignmentRow> {
  assignment: T;
  truth: ShiftPublicationTruth;
  /** true si la asignación cuelga de una ficha sombra fusionada. */
  from_shadow_identity: boolean;
}

/**
 * Ids de empleado que una consulta por persona debe usar en `.in("employee_id", …)`.
 * Incluye el canónico y sus fichas fusionadas del mismo tenant.
 */
export async function resolveWorkerAssignmentEmployeeIds(
  employeeId: string | null | undefined,
): Promise<string[]> {
  return resolveIdentityEmployeeIds(employeeId);
}

export interface FilterWorkerVisibleInput<T extends WorkerAssignmentRow> {
  rows: T[];
  /** Frontera de tenant. Si se indica, descarta cualquier fila de otra empresa. */
  companyId?: string | null;
  /** Ids de identidad válidos. Si se indica, descarta filas ajenas. */
  identityEmployeeIds?: string[];
}

/**
 * Filtro PURO. Aplica frontera de identidad + tenant y delega la decisión de
 * visibilidad en Publication Truth.
 */
export function filterWorkerVisibleShifts<T extends WorkerAssignmentRow>(
  input: FilterWorkerVisibleInput<T>,
): WorkerVisibleShift<T>[] {
  const { rows, companyId = null, identityEmployeeIds } = input;
  const allowed = identityEmployeeIds ? new Set(identityEmployeeIds) : null;
  const canonical = identityEmployeeIds?.[0] ?? null;

  const out: WorkerVisibleShift<T>[] = [];
  for (const row of rows) {
    const shift = row.scheduled_shifts;
    if (!shift) continue;
    if (allowed && row.employee_id && !allowed.has(row.employee_id)) continue;
    if (companyId) {
      const rowCompany = row.company_id ?? (shift.company_id as string | undefined) ?? null;
      if (rowCompany && rowCompany !== companyId) continue;
    }

    const assignment: ShiftTruthAssignmentInput = {
      id: row.id,
      employee_id: row.employee_id ?? null,
      status: row.status ?? null,
      response_status: row.response_status ?? null,
      is_draft_reservation: row.is_draft_reservation ?? null,
      notified_at: row.notified_at ?? null,
    };

    const truth = resolveShiftPublicationTruth({ shift, assignment });
    if (!truth.visible_to_worker) continue;

    out.push({
      assignment: row,
      truth,
      from_shadow_identity: Boolean(
        canonical && row.employee_id && row.employee_id !== canonical,
      ),
    });
  }
  return out;
}

/**
 * Resolver canónico completo para superficies que ya tienen las filas cargadas.
 * `employeeId` puede ser canónico o sombra: la identidad se normaliza aquí.
 */
export async function resolveWorkerVisibleShifts<T extends WorkerAssignmentRow>(
  employeeId: string | null | undefined,
  rows: T[],
  companyId?: string | null,
): Promise<WorkerVisibleShift<T>[]> {
  const identityEmployeeIds = await resolveWorkerAssignmentEmployeeIds(employeeId);
  return filterWorkerVisibleShifts({ rows, companyId, identityEmployeeIds });
}
