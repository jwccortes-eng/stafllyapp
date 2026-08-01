/**
 * P0.2 — MULTI-DRIVER
 * ===================
 *
 * MODELO REAL (verificado contra la base de datos, no supuesto):
 *
 *   scheduled_shifts.transportation_required : boolean  → la operación mueve gente
 *   scheduled_shifts.car_capacity            : integer  → asientos por vehículo
 *   scheduled_shifts.driver_employee_id      : uuid     → LEGADO: un solo "driver principal"
 *   shift_assignments.assignment_role        : text     → 'staff' | 'worker' | 'driver' |
 *                                                          'shift_admin' | 'check_in_admin'
 *
 * Conclusión: el backend YA soporta VARIOS drivers por turno, porque un driver
 * es una FILA de `shift_assignments` con `assignment_role = 'driver'`, y la RPC
 * `assign_worker_to_shift(p_shift_id, p_employee_id, p_assignment_role, …)`
 * acepta el rol por parámetro e inserta una fila por persona (nunca sobrescribe;
 * si la persona ya está asignada lanza `already_assigned:<id>`).
 *
 * `driver_employee_id` NO es el modelo de drivers: es sólo el driver principal
 * (compatibilidad con vistas legadas). Se conserva y se sincroniza con el
 * primer driver seleccionado.
 *
 * Reglas de negocio que NO se asumen:
 *   - "cantidad de vehículos" ≠ "cantidad de drivers": el operador declara
 *     cuántos drivers necesita; el sistema no lo deriva de la capacidad.
 *   - un driver puede cubrir varios vehículos (no hay relación vehículo↔driver
 *     en la base de datos: no existe tabla de vehículos).
 *
 * Módulo puro: sin React, sin red, sin payroll.
 */

export interface DriverPlan {
  /** La operación requiere transporte. */
  transportRequired: boolean;
  /** Cuántos drivers declara el operador que necesita. */
  driversRequired: number;
  /** Personas del equipo marcadas como driver (subconjunto del equipo). */
  driverIds: string[];
}

export const EMPTY_DRIVER_PLAN: DriverPlan = {
  transportRequired: false,
  driversRequired: 0,
  driverIds: [],
};

export type DriverPlanTone = "neutral" | "warning" | "success";

export interface DriverPlanStatus {
  /** "3 de 5 drivers seleccionados" */
  counterLabel: string;
  /** Explicación humana de la consecuencia. */
  hint: string;
  tone: DriverPlanTone;
  selected: number;
  required: number;
  /** Faltan drivers: nunca bloquea, sólo advierte. */
  incomplete: boolean;
}

/** Mantiene el plan coherente con el equipo realmente seleccionado. */
export function reconcileDriverPlan(plan: DriverPlan, teamIds: string[]): DriverPlan {
  const team = new Set(teamIds);
  const driverIds = plan.driverIds.filter(id => team.has(id));
  if (driverIds.length === plan.driverIds.length) return plan;
  return { ...plan, driverIds };
}

/** Marca / desmarca una persona como driver. Sólo si está en el equipo. */
export function toggleDriver(plan: DriverPlan, employeeId: string, teamIds: string[]): DriverPlan {
  if (!teamIds.includes(employeeId)) return plan;
  const isDriver = plan.driverIds.includes(employeeId);
  const driverIds = isDriver
    ? plan.driverIds.filter(id => id !== employeeId)
    : [...plan.driverIds, employeeId];
  const driversRequired = Math.max(plan.driversRequired, driverIds.length);
  return { ...plan, driverIds, driversRequired, transportRequired: plan.transportRequired || driverIds.length > 0 };
}

export function describeDriverPlan(plan: DriverPlan): DriverPlanStatus {
  const selected = plan.driverIds.length;
  const required = Math.max(plan.driversRequired, 0);
  const counterLabel = `${selected} de ${required} ${required === 1 ? "driver seleccionado" : "drivers seleccionados"}`;
  if (required === 0) {
    return {
      counterLabel: selected === 0 ? "Sin drivers" : `${selected} ${selected === 1 ? "driver" : "drivers"}`,
      hint: "Esta operación no declara transporte.",
      tone: "neutral",
      selected,
      required,
      incomplete: false,
    };
  }
  if (selected >= required) {
    return {
      counterLabel,
      hint: "El transporte queda cubierto.",
      tone: "success",
      selected,
      required,
      incomplete: false,
    };
  }
  const missing = required - selected;
  return {
    counterLabel,
    hint: `Faltan ${missing} ${missing === 1 ? "driver" : "drivers"}. El turno se puede crear igual y completarse después.`,
    tone: "warning",
    selected,
    required,
    incomplete: true,
  };
}

/** Rol con el que se debe llamar a `assign_worker_to_shift`. */
export function assignmentRoleFor(plan: DriverPlan, employeeId: string): "driver" | "worker" {
  return plan.driverIds.includes(employeeId) ? "driver" : "worker";
}

/** Driver principal (compatibilidad con `scheduled_shifts.driver_employee_id`). */
export function primaryDriverId(plan: DriverPlan): string | null {
  return plan.driverIds[0] ?? null;
}

/** Etiqueta operativa para el resumen y la confirmación. */
export function driverSummaryLine(plan: DriverPlan): string {
  if (!plan.transportRequired && plan.driverIds.length === 0) return "Sin transporte";
  return describeDriverPlan(plan).counterLabel;
}
