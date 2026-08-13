/**
 * P0 — SERVICE ROOT QK DISPLAY CONSOLIDATION
 * ==========================================
 *
 * Registro en memoria de `id → shift_ref` de los servicios raíz.
 *
 * Regla canónica (B1):
 *   - el turno raíz ES el servicio; su `shift_ref` es el QK visible;
 *   - los horarios hijos (`parent_shift_id`) conservan su propio `shift_ref`
 *     en base de datos (nunca se borra ni se renumera), pero NO se muestran
 *     como identificador principal;
 *   - toda superficie resuelve el QK visible con este registro.
 *
 * No escribe en base de datos, no toca FKs, no altera payroll ni asistencia:
 * es exclusivamente una capa de presentación.
 */

const refsById = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

export function subscribeServiceRefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export interface RememberableShift {
  id?: string | null;
  shift_ref?: string | null;
}

/** Registra las referencias de las filas ya cargadas (raíces incluidas). */
export function rememberShiftRefs(rows: RememberableShift[] | null | undefined): void {
  if (!rows?.length) return;
  let changed = false;
  for (const row of rows) {
    const id = (row?.id ?? "").trim();
    const ref = (row?.shift_ref ?? "").trim();
    if (!id || !ref) continue;
    if (refsById.get(id) !== ref) {
      refsById.set(id, ref);
      changed = true;
    }
  }
  if (changed) notify();
}

/** QK de un turno ya conocido. `null` cuando aún no se ha cargado. */
export function lookupShiftRef(id: string | null | undefined): string | null {
  const key = (id ?? "").trim();
  if (!key) return null;
  return refsById.get(key) ?? null;
}

/** IDs de raíz que todavía no tenemos en memoria. */
export function missingRootIds(parentIds: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of parentIds) {
    const id = (raw ?? "").trim();
    if (id && !refsById.has(id)) out.add(id);
  }
  return [...out];
}

/** Sólo para pruebas. */
export function __resetServiceRefRegistry(): void {
  refsById.clear();
  notify();
}
