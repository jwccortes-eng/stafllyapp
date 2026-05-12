/**
 * Human-readable labels for the Import Review Center.
 * Display only — raw codes are still preserved in models, exports and tooltips.
 */
import type { ImportWarningCode } from "@/lib/import/import-warnings";
import type { DiffStatus } from "./types";

export const WARNING_HUMAN_LABEL: Record<ImportWarningCode, string> = {
  EMPLOYEE_INACTIVE: "Trabajador inactivo",
  INACTIVE_MATCH_REPLACED_WITH_ACTIVE: "Reemplazado por activo",
  MULTIPLE_ACTIVE_DUPLICATES_NEED_REVIEW: "Duplicados activos",
  EMPLOYEE_MATCHED_TO_CANONICAL_ACTIVE_DUPLICATE: "Match canónico",
  WORKER_OMITTED_OVERLAP_NEEDS_REVIEW: "Solapamiento detectado",
  ADDRESS_MAPPED_TO_LOCATION: "Ubicación detectada",
  NOTE_MEETING_POINT_PARSED: "Encuentro detectado",
  NOTE_PARSE_NEEDS_REVIEW: "Nota requiere revisión",
  IMPORTED_ACCEPT_NOT_STAFLY_RESPONSE: "Aceptación importada",
  SHIFT_RECONCILED_BY_FALLBACK_KEY: "Match por fallback",
  MULTIPLE_EXISTING_SHIFT_MATCHES_NEED_REVIEW: "Múltiples turnos posibles",
  PLACEHOLDER_SYSTEM_EXCLUDED: "Placeholder excluido",
  PAY_RIDE_DETECTED: "PAY RIDE detectado",
  CANONICAL_DUPLICATE_RESOLVED: "Duplicado resuelto",
};

export const WORKER_STATUS_HUMAN_LABEL: Record<string, string> = {
  matched: "Asignado",
  missing_in_stafly: "Falta en Stafly",
  extra_in_stafly: "Extra en Stafly",
  inactive_matched: "Inactivo detectado",
  placeholder: "Placeholder",
  imported_accept_only: "Importado/no confirmado",
  canonical_duplicate_resolved: "Duplicado resuelto",
  unmatched: "Sin match",
};

export const DIFF_STATUS_HUMAN_LABEL: Record<DiffStatus, string> = {
  matched_exact: "Match exacto",
  matched_fallback: "Match por fallback",
  would_create: "Crearía nuevo",
  possible_duplicate: "Posible duplicado",
  needs_review: "Requiere revisión",
};

/** Helper text shown under a worker row to explain its status in plain Spanish. */
export function workerStatusHelper(w: {
  status: string;
  displayName: string;
  employerId?: string | null;
  sourceMatchedEmployerId?: string | null;
  sourceMatchedReason?: "inactive" | "stub" | null;
  rawName?: string;
}): string | null {
  const src = w.sourceMatchedEmployerId ? `#${w.sourceMatchedEmployerId}` : (w.rawName ?? "ese registro");
  switch (w.status) {
    case "canonical_duplicate_resolved":
      if (w.sourceMatchedReason === "stub") {
        return `El archivo apuntaba al registro incompleto ${src}. Stafly ya tiene el trabajador correcto${w.employerId ? ` #${w.employerId}` : ""} asignado.`;
      }
      return `El archivo apuntaba a ${w.displayName} ${src} inactivo. Stafly ya tiene el trabajador activo${w.employerId ? ` #${w.employerId}` : ""} asignado.`;
    case "imported_accept_only":
      return "Connecteam marcó “accept”, pero el trabajador todavía no confirmó en Stafly.";
    case "inactive_matched":
      return "El trabajador en Stafly figura como inactivo. Reactívalo o crea un registro activo antes de importar.";
    case "missing_in_stafly":
      return "El archivo lo lista, pero no está asignado al turno en Stafly.";
    case "extra_in_stafly":
      return "Está asignado en Stafly pero no aparece en el archivo de Connecteam.";
    case "placeholder":
      return "Fila placeholder de Connecteam (System / generic). No se importa como trabajador real.";
    case "unmatched":
      return "No se pudo emparejar con ningún trabajador de Stafly.";
    default:
      return null;
  }
}
