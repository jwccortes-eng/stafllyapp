/**
 * Structured warnings emitted by the Connecteam schedule importer.
 *
 * Stored verbatim into `import_batches.warnings` (jsonb). Pure helpers — no DB.
 * Reason codes are stable strings consumed by the admin UI to render
 * "Importación: N omitidos" chips on a shift card.
 */

export type ImportWarningCode =
  | "EMPLOYEE_INACTIVE"
  | "INACTIVE_MATCH_REPLACED_WITH_ACTIVE"
  | "MULTIPLE_ACTIVE_DUPLICATES_NEED_REVIEW"
  | "WORKER_OMITTED_OVERLAP_NEEDS_REVIEW"
  | "ADDRESS_MAPPED_TO_LOCATION"
  | "NOTE_MEETING_POINT_PARSED"
  | "NOTE_PARSE_NEEDS_REVIEW"
  | "IMPORTED_ACCEPT_NOT_STAFLY_RESPONSE";

export type ImportWarningSeverity = "info" | "warn" | "error";

export interface ImportWarning {
  code: ImportWarningCode;
  severity: ImportWarningSeverity;
  /** Numeric shift code (e.g. "0239") when scoped to a shift. */
  shift_code?: string | null;
  /** ISO date when scoped to a shift. */
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  /** Job/client name as it appears in the source row. */
  job?: string | null;
  /** Worker name as it appears in the Connecteam Users column. */
  raw_employee_name?: string | null;
  /** Resolved Stafly employee id, when available. */
  matched_employee_id?: string | null;
  /** Operator-facing recommended next step. */
  recommended_action?: string;
  /** Free-form structured payload (e.g. extracted note candidates). */
  details?: Record<string, unknown>;
}

const DEFAULT_SEVERITY: Record<ImportWarningCode, ImportWarningSeverity> = {
  EMPLOYEE_INACTIVE: "warn",
  INACTIVE_MATCH_REPLACED_WITH_ACTIVE: "info",
  MULTIPLE_ACTIVE_DUPLICATES_NEED_REVIEW: "warn",
  WORKER_OMITTED_OVERLAP_NEEDS_REVIEW: "warn",
  ADDRESS_MAPPED_TO_LOCATION: "info",
  NOTE_MEETING_POINT_PARSED: "info",
  NOTE_PARSE_NEEDS_REVIEW: "info",
  IMPORTED_ACCEPT_NOT_STAFLY_RESPONSE: "info",
};

const DEFAULT_ACTION: Record<ImportWarningCode, string> = {
  EMPLOYEE_INACTIVE:
    "Reactivate the worker or create an active record before retrying the import.",
  INACTIVE_MATCH_REPLACED_WITH_ACTIVE:
    "Confirm the active worker is the correct match.",
  MULTIPLE_ACTIVE_DUPLICATES_NEED_REVIEW:
    "Resolve duplicate workers in People before retrying the import.",
  WORKER_OMITTED_OVERLAP_NEEDS_REVIEW:
    "Review the overlapping shift; if it is a generic/legacy stub, cancel it and re-add the worker.",
  ADDRESS_MAPPED_TO_LOCATION:
    "Verify the auto-created job-site location is correct (geofence, name).",
  NOTE_MEETING_POINT_PARSED:
    "Verify the parsed meeting point and time on the shift detail.",
  NOTE_PARSE_NEEDS_REVIEW:
    "Original note preserved. Open the shift to add meeting point/time manually if needed.",
  IMPORTED_ACCEPT_NOT_STAFLY_RESPONSE:
    "Worker has not yet accepted the shift in Stafly; UI must not display 'Aceptado'.",
};

export function buildImportWarning(
  code: ImportWarningCode,
  partial: Omit<ImportWarning, "code" | "severity" | "recommended_action"> & {
    severity?: ImportWarningSeverity;
    recommended_action?: string;
  } = {},
): ImportWarning {
  return {
    code,
    severity: partial.severity ?? DEFAULT_SEVERITY[code],
    recommended_action: partial.recommended_action ?? DEFAULT_ACTION[code],
    shift_code: partial.shift_code ?? null,
    date: partial.date ?? null,
    start_time: partial.start_time ?? null,
    end_time: partial.end_time ?? null,
    job: partial.job ?? null,
    raw_employee_name: partial.raw_employee_name ?? null,
    matched_employee_id: partial.matched_employee_id ?? null,
    details: partial.details,
  };
}
