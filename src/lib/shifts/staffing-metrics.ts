/**
 * P0 — Fuente única de métricas de dotación de un turno.
 *
 * Antes cada pantalla derivaba sus propios números: el calendario mostraba
 * `aceptados / plazas` (1/23) mientras el detalle mostraba `asignados / plazas`
 * (13/23). Los dos números eran ciertos y ninguno era comparable.
 *
 * Contrato canónico:
 *   Cobertura     = assignedActive / required        → "13 de 23 cubiertos"
 *   Confirmación  = confirmed / assignedActive       → "1 de 13 confirmó"
 *
 * Nunca se muestra confirmación sobre `required`.
 *
 * Reglas:
 * - Una asignación retirada/cancelada no cuenta como cobertura.
 * - Una asignación rechazada no cuenta como cobertura.
 * - `needs_reacceptance` (el turno cambió después de que la persona aceptó)
 *   cuenta como cobertura pero NO como confirmada: debe volver a aceptar.
 * - Este módulo es puro: no consulta la base ni toca fichajes ni payroll.
 */

export interface StaffingAssignmentLike {
  status?: string | null;
  response_status?: string | null;
  attendance_status?: string | null;
  removed_at?: string | null;
  import_batch_id?: string | null;
}

export interface ShiftStaffingMetrics {
  required: number;
  assignedActive: number;
  confirmed: number;
  pendingResponse: number;
  rejected: number;
  removed: number;
  checkedIn: number;
  missing: number;
  coverageRatio: number;
  /** "13 de 23 cubiertos" */
  coverageLabel: string;
  /** "1 de 13 confirmó" — null cuando no hay nadie asignado. */
  confirmationLabel: string | null;
  isFullyCovered: boolean;
  isFullyConfirmed: boolean;
}

const REMOVED_STATUSES = new Set(["removed", "cancelled", "canceled", "unassigned", "replaced"]);
const REJECTED_STATUSES = new Set(["rejected", "declined"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "accepted"]);
const PRESENT_STATUSES = new Set(["present", "checked_in"]);

function isRemoved(a: StaffingAssignmentLike): boolean {
  if (a.removed_at) return true;
  return REMOVED_STATUSES.has(String(a.status ?? "").toLowerCase());
}

function isRejected(a: StaffingAssignmentLike): boolean {
  return (
    REJECTED_STATUSES.has(String(a.status ?? "").toLowerCase()) ||
    REJECTED_STATUSES.has(String(a.response_status ?? "").toLowerCase())
  );
}

function isConfirmed(a: StaffingAssignmentLike): boolean {
  const response = String(a.response_status ?? "").toLowerCase();
  // Un cambio material invalida la aceptación previa: vuelve a estar pendiente.
  if (response === "needs_reacceptance") return false;
  const status = String(a.status ?? "").toLowerCase();
  if (CONFIRMED_STATUSES.has(response)) return true;
  if (status === "confirmed") return true;
  // Aceptaciones importadas no son una confirmación real de la persona.
  if (status === "accepted") return !a.import_batch_id;
  return false;
}

export function getShiftStaffingMetrics(
  assignments: StaffingAssignmentLike[],
  required: number,
): ShiftStaffingMetrics {
  const req = Math.max(0, required ?? 0);
  let assignedActive = 0;
  let confirmed = 0;
  let pendingResponse = 0;
  let rejected = 0;
  let removed = 0;
  let checkedIn = 0;

  for (const a of assignments ?? []) {
    if (isRemoved(a)) {
      removed += 1;
      continue;
    }
    if (isRejected(a)) {
      rejected += 1;
      continue;
    }
    assignedActive += 1;
    if (PRESENT_STATUSES.has(String(a.attendance_status ?? "").toLowerCase())) checkedIn += 1;
    if (isConfirmed(a)) confirmed += 1;
    else pendingResponse += 1;
  }

  const missing = Math.max(0, req - assignedActive);
  const coverageRatio = req > 0 ? Math.min(1, assignedActive / req) : assignedActive > 0 ? 1 : 0;

  return {
    required: req,
    assignedActive,
    confirmed,
    pendingResponse,
    rejected,
    removed,
    checkedIn,
    missing,
    coverageRatio,
    coverageLabel: `${assignedActive} de ${req || "—"} cubiertos`,
    confirmationLabel:
      assignedActive > 0 ? `${confirmed} de ${assignedActive} confirmó` : null,
    isFullyCovered: req > 0 && assignedActive >= req,
    isFullyConfirmed: assignedActive > 0 && confirmed === assignedActive,
  };
}

/** Atajo para listas: agrupa asignaciones por turno y calcula métricas. */
export function getStaffingMetricsByShift<T extends StaffingAssignmentLike & { shift_id?: string | null }>(
  assignments: T[],
  shifts: { id: string; slots?: number | null }[],
): Record<string, ShiftStaffingMetrics> {
  const byShift = new Map<string, T[]>();
  for (const a of assignments ?? []) {
    const key = a.shift_id ?? "";
    if (!key) continue;
    const list = byShift.get(key);
    if (list) list.push(a);
    else byShift.set(key, [a]);
  }
  const out: Record<string, ShiftStaffingMetrics> = {};
  for (const s of shifts ?? []) {
    out[s.id] = getShiftStaffingMetrics(byShift.get(s.id) ?? [], s.slots ?? 0);
  }
  return out;
}
