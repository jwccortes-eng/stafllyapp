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
} as const;

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
