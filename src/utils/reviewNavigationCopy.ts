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
  // Sprint 25 → Sprint 27 — Root-Cause review notes.
  reviewNoteTitle: "Nota de revisión",
  // Sprint 27 — persistence enabled.
  reviewNotePersistBadge: "Nota operacional · no modifica payroll",
  reviewNoteHelp: "Se guarda como contexto operativo para tu equipo. No aprueba, no modifica ni recalcula payroll. No incluyas SSN, datos bancarios, documentos sensibles ni información médica.",
  reviewNotePlaceholder: "Escribe contexto de revisión (visible sólo para tu equipo)…",
  reviewNoteSaveLabel: "Guardar nota",
  reviewNoteSaving: "Guardando…",
  reviewNoteSaveSuccess: "Nota guardada",
  reviewNoteSaveError: "No se pudo guardar la nota. Verifica permisos o intenta de nuevo.",
  reviewNoteListTitle: "Notas de revisión",
  reviewNoteListEmpty: "Aún no hay notas guardadas para esta causa.",
  reviewNoteListLoadError: "No se pudieron cargar las notas guardadas.",
  reviewNoteAuthorFallback: "Usuario del equipo",
  // Sprint 29 — archive MVP.
  reviewNoteArchiveLabel: "Archivar",
  reviewNoteArchiving: "Archivando…",
  reviewNoteArchiveConfirm: "Archivar esta nota la ocultará de esta revisión, pero no la borrará.",
  reviewNoteArchiveConfirmCta: "Archivar",
  reviewNoteArchiveCancel: "Cancelar",
  reviewNoteArchiveSuccess: "Nota archivada",
  reviewNoteArchiveError: "No se pudo archivar la nota. Verifica permisos o intenta de nuevo.",
} as const;

/**
 * Keys align 1:1 with the `status` CHECK constraint of
 * `public.payroll_review_notes` — do not diverge.
 */
export const REVIEW_NOTE_CHIPS = [
  { key: "verified", label: "Verificado" },
  { key: "needs_correction", label: "Requiere corrección" },
  { key: "pending_supervisor", label: "Pendiente supervisor" },
  { key: "review_time_entry", label: "Revisar fichaje" },
] as const;

export type ReviewNoteChipKey = typeof REVIEW_NOTE_CHIPS[number]["key"];

export function reviewNoteStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return REVIEW_NOTE_CHIPS.find((c) => c.key === status)?.label ?? status;
}

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
