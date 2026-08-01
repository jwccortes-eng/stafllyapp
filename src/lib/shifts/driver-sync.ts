/**
 * P0.3 — Persistencia de varios drivers por turno.
 *
 * MODELO (verificado, no supuesto):
 *   - `shift_assignments.assignment_role = 'driver'` es la fuente de verdad
 *     multi-driver: una fila por persona.
 *   - `scheduled_shifts.driver_employee_id` es LEGADO (un solo driver principal)
 *     y se mantiene sincronizado con el primer driver para no romper vistas
 *     antiguas.
 *
 * Este módulo SÓLO toca `shift_assignments.assignment_role` y el campo legado.
 * Nunca escribe en time_entries, payroll, horas ni estados de asistencia,
 * y nunca borra asignaciones.
 */

import { supabase } from "@/integrations/supabase/client";

const ACTIVE_STATUSES = ["pending", "confirmed", "accepted", "review", "needs_reacceptance"];

export interface DriverRoleSyncResult {
  promoted: string[];
  demoted: string[];
  primaryDriverId: string | null;
}

/**
 * Alinea los roles de driver del turno con la selección del operador.
 * Idempotente: repetir la llamada con la misma selección no cambia nada.
 */
export async function syncShiftDriverRoles(
  shiftId: string,
  driverIds: string[],
): Promise<DriverRoleSyncResult> {
  const wanted = [...new Set(driverIds.filter(Boolean))];

  const { data, error } = await supabase
    .from("shift_assignments")
    .select("id, employee_id, assignment_role, status")
    .eq("shift_id", shiftId)
    .in("status", ACTIVE_STATUSES);
  if (error) throw error;

  const rows = data ?? [];
  const promoted: string[] = [];
  const demoted: string[] = [];

  for (const row of rows) {
    const isDriver = row.assignment_role === "driver";
    const shouldBeDriver = wanted.includes(row.employee_id);
    if (shouldBeDriver && !isDriver) promoted.push(row.id);
    if (!shouldBeDriver && isDriver) demoted.push(row.id);
  }

  if (promoted.length > 0) {
    const { error: upErr } = await supabase
      .from("shift_assignments")
      .update({ assignment_role: "driver" })
      .in("id", promoted);
    if (upErr) throw upErr;
  }
  if (demoted.length > 0) {
    const { error: downErr } = await supabase
      .from("shift_assignments")
      .update({ assignment_role: "worker" })
      .in("id", demoted);
    if (downErr) throw downErr;
  }

  const primaryDriverId = wanted[0] ?? null;
  const { error: shiftErr } = await supabase
    .from("scheduled_shifts")
    .update({ driver_employee_id: primaryDriverId })
    .eq("id", shiftId);
  if (shiftErr) throw shiftErr;

  return { promoted, demoted, primaryDriverId };
}

/** Drivers actuales de un turno, leyendo el modelo real + el campo legado. */
export function driverIdsFromAssignments(
  assignments: Array<{ shift_id?: string; employee_id: string; assignment_role?: string | null; status?: string | null }>,
  shiftId: string,
  legacyDriverEmployeeId?: string | null,
): string[] {
  const ids = assignments
    .filter(
      a =>
        (a.shift_id ?? shiftId) === shiftId &&
        a.assignment_role === "driver" &&
        a.status !== "rejected" &&
        a.status !== "removed",
    )
    .map(a => a.employee_id);
  if (legacyDriverEmployeeId && !ids.includes(legacyDriverEmployeeId)) {
    ids.unshift(legacyDriverEmployeeId);
  }
  return [...new Set(ids)];
}
