/**
 * P0 — SHIFT IDENTITY CONSISTENCY
 * ================================
 *
 * FUENTE ÚNICA DE PRESENTACIÓN de la identidad de un turno.
 *
 * Un turno tiene UNA sola referencia visible en todo Stafly: `shift_ref`
 * (ej. `QK-001573`). Todo lo demás es interno o histórico:
 *
 *   | campo                  | clase | uso                                        |
 *   |------------------------|-------|--------------------------------------------|
 *   | `shift_ref`            | A     | referencia operativa visible (canónica)     |
 *   | `id` (uuid)            | B     | identificador técnico, URLs, nunca en UI    |
 *   | `shift_number`         | B     | contador por empresa detrás de `shift_ref`  |
 *   | `shift_code`           | C     | código legado de imports; sólo en detalle   |
 *   | prefijo "01 - " en el título | E | número de bloque del import, no es el turno |
 *
 * Reglas:
 *   - la UI NUNCA concatena campos por su cuenta;
 *   - el código legado sólo aparece etiquetado ("Referencia anterior: 339");
 *   - si no hay `shift_ref` (turno histórico), el fallback va etiquetado;
 *   - este módulo es puro: sin React, sin red, sin escrituras.
 */

export interface ShiftIdentitySource {
  id?: string | null;
  shift_ref?: string | null;
  shift_number?: number | null;
  shift_code?: string | null;
  company_id?: string | null;
  /** P0 · SERVICE ROOT QK: horario interno de un servicio raíz. */
  parent_shift_id?: string | null;
  /** Nombre operativo del horario ("Setup", "Service"…). */
  segment_label?: string | null;
}

export type PrimaryRefKind =
  /** `shift_ref` real, emitido por la secuencia de la empresa. */
  | "canonical"
  /** QK heredado del servicio raíz (este turno es un horario del servicio). */
  | "service_root"
  /** Turno histórico sin `shift_ref`: se muestra el código legado, etiquetado. */
  | "legacy_fallback"
  /** Ni referencia ni código: no hay identidad visible. */
  | "none";

export interface ShiftDisplayIdentity {
  /** ÚNICA referencia que la UI debe mostrar en cabeceras y listas. */
  primaryRef: string;
  primaryRefKind: PrimaryRefKind;
  /** Etiqueta corta para acompañar el fallback ("Referencia histórica"). */
  primaryRefNote: string | null;
  /** Código legado, sólo para detalle expandido. `null` si no aporta nada nuevo. */
  legacyRef: string | null;
  /** Copy ya listo: "Referencia anterior: 339". */
  legacyLabel: string | null;
  /** Nombre de la empresa anfitriona, cuando el contexto lo requiere. */
  companyName: string | null;
  /** UUID interno. Nunca para UI común: soporte, debug y URLs. */
  internalId: string | null;
  /** `true` cuando existe `shift_ref`. */
  hasCanonicalRef: boolean;
  /** `true` cuando este turno es un horario dentro de un servicio raíz. */
  isServiceSegment: boolean;
  /** QK del servicio raíz cuando se conoce. */
  serviceRef: string | null;
  /** UUID del servicio raíz (él mismo cuando no es segmento). */
  serviceId: string | null;
  /** Nombre del horario ("Setup"); sólo para segmentos. */
  segmentLabel: string | null;
  /** `shift_ref` técnico propio del hijo. Nunca es el identificador principal. */
  segmentRef: string | null;
}


const EMPTY: ShiftDisplayIdentity = {
  primaryRef: "—",
  primaryRefKind: "none",
  primaryRefNote: null,
  legacyRef: null,
  legacyLabel: null,
  companyName: null,
  internalId: null,
  hasCanonicalRef: false,
};

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export function getShiftDisplayIdentity(
  shift: ShiftIdentitySource | null | undefined,
  opts?: { companyName?: string | null },
): ShiftDisplayIdentity {
  if (!shift) return { ...EMPTY, companyName: opts?.companyName?.trim() || null };

  const ref = clean(shift.shift_ref);
  const legacy = clean(shift.shift_code);
  const companyName = opts?.companyName?.trim() || null;
  const internalId = clean(shift.id) || null;

  if (ref) {
    return {
      primaryRef: ref,
      primaryRefKind: "canonical",
      primaryRefNote: null,
      // El código legado sólo se conserva si dice algo distinto a la referencia.
      legacyRef: legacy && !ref.endsWith(legacy.padStart(6, "0")) ? legacy : null,
      legacyLabel: legacy && !ref.endsWith(legacy.padStart(6, "0")) ? `Referencia anterior: ${legacy}` : null,
      companyName,
      internalId,
      hasCanonicalRef: true,
    };
  }

  if (legacy) {
    return {
      primaryRef: `#${legacy}`,
      primaryRefKind: "legacy_fallback",
      primaryRefNote: "Referencia histórica",
      legacyRef: null,
      legacyLabel: null,
      companyName,
      internalId,
      hasCanonicalRef: false,
    };
  }

  return { ...EMPTY, companyName, internalId };
}

/** Atajo para listas y cabeceras: sólo el texto de la referencia visible. */
export function shiftRefLabel(
  shift: ShiftIdentitySource | null | undefined,
): string {
  return getShiftDisplayIdentity(shift).primaryRef;
}

/** ¿Hay algo que mostrar? Evita pintar chips con "—". */
export function hasVisibleShiftRef(shift: ShiftIdentitySource | null | undefined): boolean {
  return getShiftDisplayIdentity(shift).primaryRefKind !== "none";
}
