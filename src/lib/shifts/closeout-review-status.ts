/**
 * Sprint 42 — Pure, shared helper for deriving the closeout / review
 * lifecycle status of a single shift from `shift_closeout_reports`.
 *
 * Read-only. No DB access. No side effects. UI-only.
 *
 * The 6 statuses returned here map 1:1 to the lifecycle buckets that
 * `PayrollReviewQueue.tsx` builds today, so Shift Ops can render a badge
 * without drifting from PRQ (source of truth for validation).
 */

export type CloseoutReviewStatus =
  | "no_data"           // shift is future / not yet evaluable
  | "no_closeout"       // past shift with no closeout row
  | "in_review"         // status=submitted, waiting for María
  | "needs_correction"  // rejected or needs_followup
  | "pending_final"     // reviewed + approved, waiting for final approval
  | "ready_for_payroll";// final_approval_status=approved

export interface CloseoutReportRow {
  status: string | null;
  review_status: string | null;
  final_approval_status: string | null;
}

/** Compare a shift date (YYYY-MM-DD) against "today" without TZ surprises. */
function isPastOrToday(shiftDate: string, now: Date = new Date()): boolean {
  if (!shiftDate) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${shiftDate}T00:00:00`);
  return d.getTime() <= today.getTime();
}

/**
 * Derive lifecycle status for a shift given its closeout row (may be null)
 * and the shift's date. Priority follows PRQ's own filter precedence:
 *   ready_for_payroll > needs_correction > pending_final > in_review > no_closeout > no_data
 */
export function deriveCloseoutReviewStatus(
  row: CloseoutReportRow | null | undefined,
  shiftDate: string,
  now: Date = new Date(),
): CloseoutReviewStatus {
  if (row) {
    if (row.final_approval_status === "approved") return "ready_for_payroll";
    const rs = row.review_status ?? "";
    if (row.status === "rejected" || rs === "rejected" || rs === "needs_followup") {
      return "needs_correction";
    }
    if (row.status === "reviewed" && rs === "approved") return "pending_final";
    if (row.status === "submitted") return "in_review";
    // Fallback for unknown combinations — treat as in_review (row exists).
    return "in_review";
  }
  return isPastOrToday(shiftDate, now) ? "no_closeout" : "no_data";
}

export type CloseoutReviewTone = "muted" | "info" | "warning" | "danger" | "success";

export interface CloseoutReviewPresentation {
  label: string;
  tone: CloseoutReviewTone;
  description: string;
}

export function presentCloseoutReviewStatus(
  status: CloseoutReviewStatus,
): CloseoutReviewPresentation {
  switch (status) {
    case "ready_for_payroll":
      return {
        label: "Aprobado · pasa a payroll",
        tone: "success",
        description: "Aprobación final completada. El turno pasa al flujo de payroll.",
      };
    case "pending_final":
      return {
        label: "Aprobado por María · pendiente final",
        tone: "info",
        description: "Cierre aprobado operativamente; falta aprobación final.",
      };
    case "needs_correction":
      return {
        label: "Requiere corrección",
        tone: "danger",
        description: "El cierre fue rechazado o necesita seguimiento antes de continuar.",
      };
    case "in_review":
      return {
        label: "Cierre enviado · en revisión",
        tone: "warning",
        description: "Capitán envió el cierre. Esperando revisión operativa.",
      };
    case "no_closeout":
      return {
        label: "Sin cierre enviado",
        tone: "warning",
        description: "Turno pasado sin cierre registrado por el capitán.",
      };
    case "no_data":
    default:
      return {
        label: "Sin estado de cierre",
        tone: "muted",
        description: "Turno futuro o sin evidencia suficiente para evaluar.",
      };
  }
}

export function closeoutBadgeClasses(tone: CloseoutReviewTone): string {
  switch (tone) {
    case "success": return "bg-earning/10 text-earning border-earning/20";
    case "info":    return "bg-info/10 text-info border-info/20";
    case "warning": return "bg-warning/10 text-warning border-warning/20";
    case "danger":  return "bg-destructive/10 text-destructive border-destructive/20";
    case "muted":
    default:        return "bg-muted text-muted-foreground border-border/40";
  }
}
