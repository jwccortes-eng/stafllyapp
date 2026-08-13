/**
 * P0 — CONFIANZA OPERATIVA EN TURNOS
 * ==================================
 *
 * Numeración operativa por empresa + confirmación de creación basada en lo
 * REALMENTE persistido (nunca en el contexto visual asumido).
 *
 * Modelo (post-migración):
 *   - `scheduled_shifts.id`          → UUID interno global. NO cambia. No se muestra.
 *   - `scheduled_shifts.shift_code`  → código legado, texto libre, NO único,
 *                                      contaminado por imports ("REVISAR", "0000"…).
 *                                      Se conserva sólo como referencia histórica.
 *   - `scheduled_shifts.shift_number`→ consecutivo por empresa (único por company_id).
 *   - `scheduled_shifts.shift_ref`   → número visible: `QK-001573`, `MSS-000089`.
 *
 * Este módulo es puro: sin React, sin red.
 */

import { getShiftDisplayIdentity } from "./shift-identity";

export interface ShiftRefSource {
  shift_ref?: string | null;
  shift_number?: number | null;
  shift_code?: string | null;
}

/**
 * Número operativo visible.
 * @deprecated P0 · SHIFT IDENTITY: usa `getShiftDisplayIdentity` directamente.
 * Se mantiene como atajo y delega en la fuente única de presentación.
 */
export function displayShiftRef(s: ShiftRefSource | null | undefined): string {
  return getShiftDisplayIdentity(s).primaryRef;
}

/** Referencia legada, sólo para trazabilidad/imports. Nunca es el número oficial. */
export function legacyShiftCode(s: ShiftRefSource | null | undefined): string | null {
  const legacy = (s?.shift_code ?? "").trim();
  return legacy || null;
}

const REF_PATTERN = /^#?[A-Za-z]{2,4}-\d{1,8}$/;
const NUM_PATTERN = /^#?\d{1,8}$/;

/**
 * ¿La búsqueda es un código EXACTO? Sólo en ese caso se permite el
 * descubrimiento cross-company (fail-closed: cualquier otra cosa, no).
 */
export function isExactShiftCodeQuery(raw: string | null | undefined): boolean {
  const q = (raw ?? "").trim();
  if (q.length < 2) return false;
  return REF_PATTERN.test(q) || NUM_PATTERN.test(q);
}

/** Normaliza para comparar contra shift_ref / shift_number / shift_code. */
export function normalizeShiftQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^#/, "").toUpperCase();
}

/**
 * Coincidencia local (dentro de la empresa activa) por referencia o código.
 *
 * P0 · SERVICE ROOT QK: buscar el QK del servicio raíz devuelve TODOS sus
 * horarios, aunque cada hijo conserve su propio `shift_ref` técnico.
 */
export function matchesShiftQuery(
  s: ShiftRefSource & { parent_shift_id?: string | null },
  raw: string,
): boolean {
  const q = normalizeShiftQuery(raw);
  if (!q) return false;
  if ((s.shift_ref ?? "").toUpperCase() === q) return true;
  if ((s.shift_code ?? "").trim().toUpperCase() === q) return true;
  const serviceRef = lookupShiftRef(s.parent_shift_id ?? null);
  if (serviceRef && serviceRef.toUpperCase() === q) return true;
  if (/^\d+$/.test(q) && s.shift_number != null && String(s.shift_number) === String(Number(q))) return true;
  return false;
}


// ── Confirmación de creación ────────────────────────────────────────────────

export interface PersistedShiftFacts {
  shiftId: string;
  /** company_id devuelto por la base de datos, no el del contexto visual. */
  companyId: string;
  shiftRef: string | null;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  slots: number;
}

export interface CreationConfirmation {
  kind: "confirmed" | "context_mismatch";
  title: string;
  /** Empresa donde el turno quedó REALMENTE persistido. */
  companyId: string;
  companyName: string;
  refLabel: string;
  scheduleLine: string;
  teamLine: string;
  /** Aviso explícito cuando la empresa persistida no es la esperada. */
  warning: string | null;
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h < 12 ? "a. m." : "p. m.";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

export function buildCreationConfirmation(args: {
  persisted: PersistedShiftFacts;
  expectedCompanyId: string | null;
  companyNameById: (id: string) => string | null;
  assignedCount: number;
  requestedCount: number;
}): CreationConfirmation {
  const { persisted, expectedCompanyId, companyNameById, assignedCount, requestedCount } = args;
  const companyName = companyNameById(persisted.companyId) ?? "Empresa sin nombre";
  const mismatch = !!expectedCompanyId && expectedCompanyId !== persisted.companyId;

  const teamLine = requestedCount === 0
    ? `${persisted.slots} ${persisted.slots === 1 ? "posición" : "posiciones"} · sin personas asignadas todavía`
    : `${persisted.slots} ${persisted.slots === 1 ? "posición" : "posiciones"} · ${assignedCount} de ${requestedCount} ${assignedCount === 1 ? "persona asignada" : "personas asignadas"}`;

  return {
    kind: mismatch ? "context_mismatch" : "confirmed",
    title: mismatch ? "No pudimos confirmar el contexto de empresa" : "Turno creado",
    companyId: persisted.companyId,
    companyName,
    refLabel: persisted.shiftRef ?? "—",
    scheduleLine: `${persisted.date} · ${fmtTime(persisted.startTime)}–${fmtTime(persisted.endTime)}`,
    teamLine,
    warning: mismatch ? `El turno fue creado en ${companyName}.` : null,
  };
}
