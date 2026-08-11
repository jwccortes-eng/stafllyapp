/**
 * Canonical "assignable worker" contract · P0
 * -------------------------------------------
 * ÚNICA definición operativa de qué trabajador puede aparecer para staffing.
 * Todas las superficies (Crear/Editar Servicio, Asignar equipo, Quick Create,
 * Reemplazo, Duplicar/copiar equipo, móvil y desktop) deben consumir estas
 * funciones. Está prohibido reintroducir filtros locales por pantalla.
 *
 * Regla (mapeada a campos reales de `employees`, sin inventar estados):
 *   assignable = is_active !== false
 *              + NO placeholder/system (worker_type / identity_status /
 *                payroll_safe / person_type_guess → isPlaceholderWorker)
 *              + employee_role !== 'historical'
 *              + NO "pendiente de aprobación real"
 *
 * P0 · Fase 2 (remediación de identidad): `added_via` describe ORIGEN /
 * HISTORIA DE ALTA y NO puede por sí solo decidir asignabilidad. Un canónico
 * activo, con portal real (`user_id`) y sin bloqueo operativo real debe
 * aparecer en staffing aunque su `added_via` histórico diga "Pending approval".
 * No se cambia el valor de `added_via`: se corrige su interpretación.
 *
 * No borra, no muta, no toca payroll/time_entries/historial. Solo decide
 * visibilidad en las superficies de asignación.
 */

import { isPlaceholderWorker } from "@/lib/employee-identity";

export type AssignabilityBucket =
  | "assignable"
  | "pending_approval"
  | "historical"
  | "placeholder"
  | "inactive";

export interface AssignableCandidate {
  id?: string;
  is_active?: boolean | null;
  employee_role?: string | null;
  added_via?: string | null;
  /** Portal real: presencia de cuenta vinculada. Evidencia de persona operativa. */
  user_id?: string | null;
  /** Fecha de aprobación explícita, si la superficie la conoce. */
  approved_at?: string | null;
  onboarding_status?: string | null;
  worker_type?: string | null;
  identity_status?: string | null;
  requires_identity_resolution?: boolean | null;
  payroll_approval_blocked?: boolean | null;
  payroll_safe?: boolean | null;
  person_type_guess?: string | null;
}


export interface AssignabilityVerdict {
  bucket: AssignabilityBucket;
  assignable: boolean;
  /** Texto operativo corto para UI. Null cuando es asignable. */
  reason: string | null;
}

const PLACEHOLDER_TYPES = new Set([
  "placeholder",
  "system",
  "external",
  "external_labor",
  "agency",
  "temp",
]);

export const NON_ASSIGNABLE_GROUP_LABELS: Record<
  Exclude<AssignabilityBucket, "assignable">,
  string
> = {
  pending_approval: "Pendientes de aprobación",
  historical: "Históricos",
  placeholder: "Placeholders / system",
  inactive: "Inactivos / archivados",
};

function isPlaceholderLike(e: AssignableCandidate): boolean {
  if (isPlaceholderWorker(e as never)) return true;
  if (e.payroll_safe === false) return true;
  const t = (e.person_type_guess ?? "").toLowerCase().trim();
  return !!t && PLACEHOLDER_TYPES.has(t);
}

function isHistorical(e: AssignableCandidate): boolean {
  return (e.employee_role ?? "").toLowerCase().trim() === "historical";
}

function isPendingApproval(e: AssignableCandidate): boolean {
  return (e.added_via ?? "").toLowerCase().trim() === "pending approval";
}

/** Veredicto canónico. Precedencia: inactivo → placeholder → histórico → pendiente. */
export function classifyWorkerAssignability(
  e: AssignableCandidate | null | undefined,
): AssignabilityVerdict {
  if (!e) return { bucket: "inactive", assignable: false, reason: "Trabajador no encontrado" };
  if (e.is_active === false)
    return { bucket: "inactive", assignable: false, reason: "Inactivo o archivado" };
  if (isPlaceholderLike(e))
    return {
      bucket: "placeholder",
      assignable: false,
      reason: "Placeholder / system sin identidad verificada",
    };
  if (isHistorical(e))
    return { bucket: "historical", assignable: false, reason: "Registro histórico" };
  if (isPendingApproval(e))
    return {
      bucket: "pending_approval",
      assignable: false,
      reason: "Pendiente de aprobación",
    };
  return { bucket: "assignable", assignable: true, reason: null };
}

export function isAssignableWorker(e: AssignableCandidate | null | undefined): boolean {
  return classifyWorkerAssignability(e).assignable;
}

/** Población canónica para cualquier selector de staffing. */
export function getAssignableWorkers<T extends AssignableCandidate>(list: T[]): T[] {
  return list.filter((e) => isAssignableWorker(e));
}

export function partitionWorkersByAssignability<T extends AssignableCandidate>(
  list: T[],
): Record<AssignabilityBucket, T[]> {
  const out: Record<AssignabilityBucket, T[]> = {
    assignable: [],
    pending_approval: [],
    historical: [],
    placeholder: [],
    inactive: [],
  };
  for (const e of list) out[classifyWorkerAssignability(e).bucket].push(e);
  return out;
}

/** Mensaje único para equipos copiados que ya no son asignables. */
export function notAssignableMessage(name: string): string {
  return `${name} ya no está disponible para asignación.`;
}
