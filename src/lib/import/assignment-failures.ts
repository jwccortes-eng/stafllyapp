/**
 * Assignment failure classification for the schedule importer.
 *
 * Pure helpers — no DB, no React. Used by ImportSchedule.tsx to keep
 * the two insert paths (new shift / reconcile existing shift) consistent
 * and to render the post-import "Blocked assignments" report.
 *
 * No schema changes. Read-only of error messages from PostgREST.
 */

export type AssignmentFailureType =
  | "employee_not_ready"
  | "unmatched_employee"
  | "ambiguous_employee"
  | "duplicate_assignment"
  | "overlap"
  | "db_error";

export interface AssignmentFailure {
  /** Numeric portion of the shift code from the source file (e.g. "45678"). */
  shift_code: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** HH:mm. */
  start_time: string;
  /** HH:mm. */
  end_time: string;
  /** Client / job name as it appears in the file. */
  client: string;
  /** Raw employee name from the file (Connecteam "Users" cell). */
  raw_employee_name: string;
  /** Resolved employee id, if matching succeeded. */
  employee_id: string | null;
  /** How the employee was matched (null when unmatched/ambiguous). */
  match_method: string | null;
  failure_type: AssignmentFailureType;
  /** Verbatim DB error or human reason. */
  error_message: string;
  /** Operator-facing next step. */
  suggested_action: string;
}

export const FAILURE_TYPE_LABELS: Record<AssignmentFailureType, string> = {
  employee_not_ready: "Profile incomplete",
  unmatched_employee: "Employee not found",
  ambiguous_employee: "Ambiguous match",
  duplicate_assignment: "Already assigned",
  overlap: "Schedule overlap",
  db_error: "Database error",
};

export const FAILURE_TYPE_HINTS: Record<AssignmentFailureType, string> = {
  employee_not_ready:
    "Open the worker profile and complete the missing fields/documents, then retry the import.",
  unmatched_employee:
    "No worker matched this name. Create the worker or upload a Connecteam Users export to bridge by phone/email/ID.",
  ambiguous_employee:
    "Multiple workers matched. Disambiguate manually from the worker list before retrying.",
  duplicate_assignment:
    "The worker is already assigned to this shift. Safe to ignore.",
  overlap:
    "The worker has another shift at the same time. Move or cancel the conflicting shift, then retry.",
  db_error: "Unexpected backend error. Share the message with support.",
};

/**
 * Classify a PostgREST error / message into a typed failure.
 * Order of checks matters — most specific first.
 */
export function classifySupabaseError(rawMessage: string | null | undefined): AssignmentFailureType {
  const msg = String(rawMessage ?? "").toLowerCase();
  if (!msg) return "db_error";

  // enforce_employee_ready_for_shift trigger
  if (msg.includes("employee_not_ready") || msg.includes("employee_profile_status")) {
    return "employee_not_ready";
  }

  // Unique constraint on (shift_id, employee_id) — already assigned
  if (
    msg.includes("23505") ||
    msg.includes("duplicate key") ||
    msg.includes("unique constraint") ||
    msg.includes("already assigned")
  ) {
    return "duplicate_assignment";
  }

  // Overlap trigger commonly raises with "overlap" in the message
  if (msg.includes("overlap") || msg.includes("conflict") || msg.includes("23p01")) {
    return "overlap";
  }

  return "db_error";
}

/** Build a failure record with the right suggested action prefilled. */
export function buildFailure(
  partial: Omit<AssignmentFailure, "suggested_action"> & { suggested_action?: string },
): AssignmentFailure {
  return {
    ...partial,
    suggested_action: partial.suggested_action ?? FAILURE_TYPE_HINTS[partial.failure_type],
  };
}

/** Group failures by shift (shift_code + date + start_time). Stable order: by date, then code. */
export function groupFailuresByShift(failures: AssignmentFailure[]): Array<{
  key: string;
  shift_code: string;
  date: string;
  start_time: string;
  end_time: string;
  client: string;
  items: AssignmentFailure[];
}> {
  const map = new Map<string, ReturnType<typeof groupFailuresByShift>[number]>();
  for (const f of failures) {
    const key = `${f.shift_code}|${f.date}|${f.start_time}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        key,
        shift_code: f.shift_code,
        date: f.date,
        start_time: f.start_time,
        end_time: f.end_time,
        client: f.client,
        items: [],
      };
      map.set(key, bucket);
    }
    bucket.items.push(f);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.shift_code !== b.shift_code) return a.shift_code.localeCompare(b.shift_code);
    return a.start_time.localeCompare(b.start_time);
  });
}

/** Plain-text report suitable for clipboard / support tickets. */
export function failuresToText(failures: AssignmentFailure[]): string {
  if (failures.length === 0) return "No blocked assignments.";
  const groups = groupFailuresByShift(failures);
  const lines: string[] = [];
  lines.push(`Blocked assignments report — ${failures.length} total`);
  lines.push("");
  for (const g of groups) {
    lines.push(`Shift #${g.shift_code} · ${g.date} ${g.start_time}-${g.end_time} · ${g.client || "—"}`);
    for (const f of g.items) {
      lines.push(
        `  - ${f.raw_employee_name} [${FAILURE_TYPE_LABELS[f.failure_type]}]` +
          (f.employee_id ? ` (employee_id=${f.employee_id})` : "") +
          (f.match_method ? ` (matched via ${f.match_method})` : ""),
      );
      lines.push(`      reason: ${f.error_message}`);
      lines.push(`      action: ${f.suggested_action}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** CSV report — one row per blocked assignment. */
export function failuresToCsv(failures: AssignmentFailure[]): string {
  const headers = [
    "shift_code",
    "date",
    "start_time",
    "end_time",
    "client",
    "raw_employee_name",
    "employee_id",
    "match_method",
    "failure_type",
    "error_message",
    "suggested_action",
  ];
  const escape = (v: string | null) => {
    const s = v ?? "";
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = failures.map(f =>
    [
      f.shift_code,
      f.date,
      f.start_time,
      f.end_time,
      f.client,
      f.raw_employee_name,
      f.employee_id,
      f.match_method,
      f.failure_type,
      f.error_message,
      f.suggested_action,
    ]
      .map(escape)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
