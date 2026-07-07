/**
 * Sprint 19 — Review Navigation Copy Standardization.
 *
 * Central copy + label helpers for the Root-Cause Explorer deep-link
 * ecosystem (Time Clock, Attendance, Shifts, Payroll Review Queue).
 * Copy-only. Never change data, queries, or navigation from here.
 */

export const REVIEW_COPY = {
  bannerFromReview: "Abierto desde revisión",
  bannerRootCausePrefix: "Causa raíz",
  focusBadge: "foco",
  notFoundInRange: "No encontrado en el rango cargado",
  readOnlyNote: "Solo navegación: no modifica payroll",
  viewingHistoricalDay: "Día seleccionado",
  viewingToday: "Hoy",
  backToToday: "Volver a hoy",
  localFilterNoteAttendance: "Vista filtrada localmente · no modifica attendance ni payroll",
  localFilterNoteReviewQueue: "Vista filtrada localmente · los totales siguen mostrando el período completo · no modifica payroll",
  // Sprint 25 — Root-Cause review notes draft (local, non-persistent).
  reviewNoteTitle: "Nota de revisión",
  reviewNoteDraftBadge: "Borrador local · no se guarda todavía",
  reviewNoteHelp: "Notas y estado son locales a esta sesión. Se pierden al cerrar el explorer o recargar. Nada se guarda en base de datos.",
  reviewNotePlaceholder: "Escribe contexto de revisión para tu propio uso (no se guarda)…",
  reviewNoteSaveDisabled: "Guardar próximamente",
} as const;

export const REVIEW_NOTE_CHIPS = [
  { key: "verified", label: "Verificado" },
  { key: "needs_fix", label: "Requiere corrección" },
  { key: "pending_supervisor", label: "Pendiente supervisor" },
  { key: "check_clock", label: "Revisar fichaje" },
] as const;

export type ReviewNoteChipKey = typeof REVIEW_NOTE_CHIPS[number]["key"];

/** Human labels for reason keys emitted by the Root-Cause Explorer. */
export const REVIEW_REASON_LABELS: Record<string, string> = {
  open_entries: "Fichajes abiertos",
  no_shift_link: "Fichajes sin turno",
  overlap: "Entradas solapadas",
  abnormal_duration: "Duración anormal",
  midnight_cross: "Cruce de medianoche",
  missing_pbp: "Sin reconciliación PBP",
  no_native_entries: "Sin fichajes nativos",
  delta_critical_unexplained: "Diferencia crítica sin explicar",
};

export function reviewReasonLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return REVIEW_REASON_LABELS[key] ?? key.replace(/_/g, " ");
}

/** "Hoy" vs "Día seleccionado" — used by Time Clock / Attendance headers. */
export function dayContextLabel(isToday: boolean): string {
  return isToday ? REVIEW_COPY.viewingToday : REVIEW_COPY.viewingHistoricalDay;
}
