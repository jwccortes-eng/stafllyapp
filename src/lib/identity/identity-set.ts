/**
 * CANONICAL IDENTITY SET — ¿Quién es esta persona?
 * ================================================
 *
 * Origen: `docs/qa/P0_WORKER_SHIFT_VISIBILITY_ROOT_CAUSE.md`.
 *
 * Problema demostrado: existen asignaciones históricas publicadas colgando de
 * fichas fusionadas (sombra) `employees.merged_into_employee_id = <canónico>`.
 * Administración las ve (consulta por turno) y el trabajador no (consulta por
 * `employee_id` canónico). La historia NO se mueve: se amplía la identidad.
 *
 * REGLAS DURAS
 * ------------
 * - Solo expande por vínculo canónico confirmado (`merged_into_employee_id`).
 *   NUNCA por nombre, email o teléfono parecidos.
 * - NUNCA cruza tenants: todas las fichas deben compartir `company_id`.
 * - Es de solo lectura. No escribe, no relinkea, no toca payroll ni time_entries.
 * - Las escrituras siguen apuntando SIEMPRE al canónico
 *   (ver `resolveWritableEmployeeId`).
 */

import { supabase } from "@/integrations/supabase/client";

export interface EmployeeIdentitySet {
  /** Ficha viva de la persona. Único destino válido para escrituras. */
  canonical_employee_id: string;
  company_id: string;
  /** Canónico + fichas sombra fusionadas. Para LECTURA histórica. */
  related_employee_ids: string[];
  /** Solo las sombra (subconjunto de `related_employee_ids`). */
  shadow_employee_ids: string[];
  /** true si alguna ficha candidata se descartó por tenant o vínculo débil. */
  had_discarded_candidates: boolean;
}

interface EmployeeRow {
  id: string;
  company_id: string | null;
  merged_into_employee_id: string | null;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: EmployeeIdentitySet | null }>();

/** Sólo para pruebas y para invalidar tras una fusión. */
export function clearIdentitySetCache(employeeId?: string): void {
  if (employeeId) cache.delete(employeeId);
  else cache.clear();
}

/**
 * Construcción PURA del identity set. Expuesta para pruebas y para superficies
 * que ya tienen las filas en memoria.
 *
 * @param seed        ficha de partida (canónica o sombra)
 * @param candidates  filas de `employees` candidatas a pertenecer a la persona
 */
export function buildEmployeeIdentitySet(
  seed: EmployeeRow,
  candidates: EmployeeRow[],
): EmployeeIdentitySet {
  // La semilla puede ser una sombra: subimos al canónico.
  const canonicalId = seed.merged_into_employee_id ?? seed.id;
  const canonicalRow =
    candidates.find((r) => r.id === canonicalId) ??
    (seed.id === canonicalId ? seed : null);

  const companyId = canonicalRow?.company_id ?? seed.company_id ?? null;

  const related = new Set<string>([canonicalId]);
  const shadows: string[] = [];
  let discarded = false;

  for (const row of candidates) {
    if (row.id === canonicalId) continue;
    // Vínculo canónico confirmado y nada más.
    if (row.merged_into_employee_id !== canonicalId) {
      discarded = true;
      continue;
    }
    // Frontera de tenant infranqueable.
    if (!companyId || row.company_id !== companyId) {
      discarded = true;
      continue;
    }
    related.add(row.id);
    shadows.push(row.id);
  }

  return {
    canonical_employee_id: canonicalId,
    company_id: companyId ?? "",
    related_employee_ids: [...related],
    shadow_employee_ids: shadows,
    had_discarded_candidates: discarded,
  };
}

/**
 * Resolver canónico de identidad. Devuelve el conjunto de fichas que
 * pertenecen inequívocamente a la misma persona dentro del mismo tenant.
 */
export async function resolveEmployeeIdentitySet(
  employeeId: string | null | undefined,
): Promise<EmployeeIdentitySet | null> {
  if (!employeeId) return null;

  const hit = cache.get(employeeId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const { data: seed, error } = await supabase
    .from("employees")
    .select("id, company_id, merged_into_employee_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (error || !seed) {
    cache.set(employeeId, { at: Date.now(), value: null });
    return null;
  }

  const seedRow = seed as EmployeeRow;
  const canonicalId = seedRow.merged_into_employee_id ?? seedRow.id;

  const { data: canonical } = await supabase
    .from("employees")
    .select("id, company_id, merged_into_employee_id")
    .eq("id", canonicalId)
    .maybeSingle();

  const { data: shadows } = await supabase
    .from("employees")
    .select("id, company_id, merged_into_employee_id")
    .eq("merged_into_employee_id", canonicalId);

  const candidates: EmployeeRow[] = [
    ...(canonical ? [canonical as EmployeeRow] : []),
    ...(((shadows ?? []) as EmployeeRow[]) ?? []),
  ];

  const value = buildEmployeeIdentitySet(
    (canonical as EmployeeRow) ?? seedRow,
    candidates,
  );
  cache.set(employeeId, { at: Date.now(), value });
  if (value.canonical_employee_id !== employeeId) {
    cache.set(value.canonical_employee_id, { at: Date.now(), value });
  }
  return value;
}

/**
 * Ids de empleado que una LECTURA por persona debe considerar.
 * Ante cualquier duda devuelve sólo el id recibido: nunca amplía de más.
 */
export async function resolveIdentityEmployeeIds(
  employeeId: string | null | undefined,
): Promise<string[]> {
  if (!employeeId) return [];
  const set = await resolveEmployeeIdentitySet(employeeId);
  if (!set) return [employeeId];
  return set.related_employee_ids.length > 0 ? set.related_employee_ids : [employeeId];
}

/**
 * Único id válido para ESCRIBIR (asignar, fichar, crear registros).
 * Una ficha sombra jamás debe recibir asignaciones nuevas.
 */
export async function resolveWritableEmployeeId(
  employeeId: string | null | undefined,
): Promise<string | null> {
  if (!employeeId) return null;
  const set = await resolveEmployeeIdentitySet(employeeId);
  return set?.canonical_employee_id ?? employeeId;
}
