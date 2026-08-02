/**
 * P0 — SINGLE SERVICE STATE.
 *
 * Un servicio (scheduled_shifts row) debe tener UNA sola versión observable
 * durante la sesión, identificada por (company_id, shift_id).
 *
 * Antes de este módulo cada superficie mantenía su propio snapshot:
 *  - `Shifts.tsx` guardaba `selectedShift` como copia congelada al hacer clic;
 *  - `MobileShiftsView.tsx` cargaba un `select()` PARCIAL (sin meeting_point,
 *    job site, transporte…) y alimentaba con él el detalle y el editor;
 *  - el detalle y las hojas móviles renderizaban esas props sin releer nunca.
 *
 * Resultado: guardabas, la DB quedaba correcta (updateShiftVerified lo probaba)
 * y la pantalla seguía mostrando el objeto anterior hasta recargar.
 *
 * Este módulo NO toca payroll, fichajes, RLS, shift_ref, multi-driver ni
 * `updateShiftVerified`. Solo gobierna cómo se lee y se reconcilia el estado.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ServiceRow = Record<string, any> & { id: string; updated_at?: string | null };

export const SERVICE_STATE_ROOT = "service-state" as const;

/** Clave canónica. Siempre namespaced por empresa: fail-closed multi-tenant. */
export function serviceStateKey(companyId: string | null | undefined, shiftId: string | null | undefined) {
  return [SERVICE_STATE_ROOT, companyId ?? "no-company", shiftId ?? "no-shift"] as const;
}

/**
 * Guardia de orden temporal. Un evento realtime atrasado o un refetch lento
 * NO puede reemplazar una versión más reciente ya reconciliada.
 * Sin `updated_at` comparable, se acepta el candidato (mejor que quedarse ciego).
 */
export function isNewerServiceRow(
  current: ServiceRow | null | undefined,
  candidate: ServiceRow | null | undefined,
): boolean {
  if (!candidate) return false;
  if (!current) return true;
  if (current.id !== candidate.id) return true;
  const a = current.updated_at ? Date.parse(current.updated_at) : NaN;
  const b = candidate.updated_at ? Date.parse(candidate.updated_at) : NaN;
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return b >= a;
}

/** Fusiona respetando el orden temporal: nunca degradamos a una versión vieja. */
export function mergeServiceRow(
  current: ServiceRow | null | undefined,
  candidate: ServiceRow | null | undefined,
): ServiceRow | null {
  if (!candidate) return current ?? null;
  if (!isNewerServiceRow(current, candidate)) return current ?? null;
  if (!current || current.id !== candidate.id) return candidate;
  return { ...current, ...candidate };
}

/** Lectura canónica: fila completa, siempre acotada al tenant. */
export async function fetchServiceRow(
  companyId: string | null | undefined,
  shiftId: string | null | undefined,
): Promise<ServiceRow | null> {
  if (!companyId || !shiftId) return null;
  const { data, error } = await supabase
    .from("scheduled_shifts")
    .select("*")
    .eq("id", shiftId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return (data as ServiceRow) ?? null;
}

/** Escribe en la cache canónica con guardia de versión. */
export function writeServiceRow(
  queryClient: QueryClient,
  companyId: string | null | undefined,
  row: ServiceRow | null | undefined,
): ServiceRow | null {
  if (!row?.id || !companyId) return null;
  const key = serviceStateKey(companyId, row.id);
  const next = mergeServiceRow(queryClient.getQueryData<ServiceRow>(key), row);
  queryClient.setQueryData(key, next);
  return next;
}

/**
 * Vistas derivadas que dependen de un servicio. Se invalidan por prefijo para
 * no repetir invalidaciones manuales distintas en cada componente.
 */
export const DERIVED_SERVICE_QUERY_ROOTS = [
  "shifts",
  "shift-coverage",
  "shift-role-slots",
  "today-operations",
  "today-hub",
  "team-hub",
  "validation-center",
  "prq",
  "timeclock",
  "staffing-metrics",
  "service-requests",
] as const;

/**
 * Puente para las superficies que aún cargan con `useState` + fetch manual
 * (lista desktop, lista móvil, Today Hub). Se suscriben y refrescan su slice
 * sin desmontar la vista ni perder scroll.
 */
type ServiceChangeListener = (payload: { companyId: string; shiftId: string }) => void;
const listeners = new Set<ServiceChangeListener>();

export function subscribeToServiceChanges(listener: ServiceChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitServiceChanged(companyId: string, shiftId: string) {
  listeners.forEach((l) => {
    try {
      l({ companyId, shiftId });
    } catch {
      /* un listener roto no puede romper la reconciliación */
    }
  });
}

/** Invalidación única y completa. No inventar variantes por pantalla. */
export async function invalidateServiceEverywhere(
  queryClient: QueryClient,
  companyId: string | null | undefined,
  shiftId: string | null | undefined,
) {
  if (!companyId || !shiftId) return;
  await queryClient.invalidateQueries({ queryKey: serviceStateKey(companyId, shiftId) });
  await Promise.all(
    DERIVED_SERVICE_QUERY_ROOTS.map((root) =>
      queryClient.invalidateQueries({ queryKey: [root], exact: false }),
    ),
  );
  emitServiceChanged(companyId, shiftId);
}

/**
 * Fase 4 — reconciliación después de un guardado ya verificado.
 * Releemos la fila real, la escribimos como fuente canónica e invalidamos
 * las derivadas. El editor solo debe cerrarse cuando esto resuelve.
 */
export async function reconcileServiceAfterSave(
  queryClient: QueryClient,
  companyId: string | null | undefined,
  shiftId: string,
  savedRow?: ServiceRow | null,
): Promise<ServiceRow | null> {
  if (savedRow) writeServiceRow(queryClient, companyId, savedRow);
  let fresh: ServiceRow | null = null;
  try {
    fresh = await fetchServiceRow(companyId, shiftId);
  } catch {
    fresh = null;
  }
  const canonical = writeServiceRow(queryClient, companyId, fresh ?? savedRow ?? null);
  await invalidateServiceEverywhere(queryClient, companyId, shiftId);
  return canonical ?? fresh ?? savedRow ?? null;
}

/** Lectura sincrónica de la versión canónica (para listas que ya tienen fila). */
export function readServiceRow(
  queryClient: QueryClient,
  companyId: string | null | undefined,
  shiftId: string | null | undefined,
): ServiceRow | null {
  if (!companyId || !shiftId) return null;
  return queryClient.getQueryData<ServiceRow>(serviceStateKey(companyId, shiftId)) ?? null;
}
