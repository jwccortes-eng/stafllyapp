/**
 * Employee identity helpers · Phase 2A (read-only).
 *
 * Pure functions on top of the new `employees` identity columns introduced in
 * Phase 1 (worker_type / identity_status / requires_identity_resolution /
 * payroll_approval_blocked / original_placeholder_name / identity_source /
 * identity_notes / resolution audit).
 *
 * Rules:
 *  - No DB writes. No payroll math. No portal changes.
 *  - Everything here consumes an employee row already scoped by company_id.
 *  - Defaults are conservative: unknown/verified rows behave exactly as before.
 */

export type WorkerType =
  | "real_employee"
  | "emergency_worker"
  | "legacy_placeholder"
  | "imported_placeholder";

export type IdentityStatus =
  | "verified"
  | "pending_identity"
  | "unresolved"
  | "rejected"
  | "merged"
  | "legacy_placeholder";

export interface IdentityFields {
  worker_type?: WorkerType | string | null;
  identity_status?: IdentityStatus | string | null;
  requires_identity_resolution?: boolean | null;
  payroll_approval_blocked?: boolean | null;
  original_placeholder_name?: string | null;
  identity_source?: string | null;
  identity_notes?: string | null;
}

const NON_REAL_TYPES = new Set<WorkerType>([
  "emergency_worker",
  "legacy_placeholder",
  "imported_placeholder",
]);

const UNRESOLVED_STATUSES = new Set<IdentityStatus>([
  "pending_identity",
  "unresolved",
  "legacy_placeholder",
]);

/** True when the worker is *not* a normal verified employee. */
export function isPlaceholderWorker(e: IdentityFields | null | undefined): boolean {
  if (!e) return false;
  const t = (e.worker_type ?? "") as WorkerType;
  if (NON_REAL_TYPES.has(t)) return true;
  const s = (e.identity_status ?? "") as IdentityStatus;
  if (s && s !== "verified" && s !== "merged" && s !== "rejected") return true;
  return false;
}

/** True when identity requires operator resolution. */
export function isPendingIdentity(e: IdentityFields | null | undefined): boolean {
  if (!e) return false;
  if (e.requires_identity_resolution === true) return true;
  const s = (e.identity_status ?? "") as IdentityStatus;
  return UNRESOLVED_STATUSES.has(s);
}

/** True when payroll approval is explicitly blocked for this row. */
export function isPayrollApprovalBlocked(e: IdentityFields | null | undefined): boolean {
  return e?.payroll_approval_blocked === true;
}

export interface IdentityBadgeSpec {
  key:
    | "pending_identity"
    | "legacy_placeholder"
    | "imported_placeholder"
    | "emergency_worker"
    | "payroll_blocked";
  label: string;
  tone: "warning" | "destructive" | "muted";
  title: string;
}

/**
 * Ordered list of badges to render for a worker. Most severe first.
 * Empty array ⇒ verified real worker, nothing to show.
 */
export function describeIdentityBadges(
  e: IdentityFields | null | undefined,
): IdentityBadgeSpec[] {
  if (!e) return [];
  const out: IdentityBadgeSpec[] = [];

  if (isPayrollApprovalBlocked(e)) {
    out.push({
      key: "payroll_blocked",
      label: "Payroll bloqueado",
      tone: "destructive",
      title: "Aprobación de payroll bloqueada hasta resolver la identidad.",
    });
  }

  const t = (e.worker_type ?? "") as WorkerType;
  if (t === "emergency_worker") {
    out.push({
      key: "emergency_worker",
      label: "Emergency",
      tone: "warning",
      title:
        "Trabajador de emergencia. Identidad pendiente — resolver antes de payroll.",
    });
  } else if (t === "legacy_placeholder") {
    out.push({
      key: "legacy_placeholder",
      label: "Legacy placeholder",
      tone: "warning",
      title:
        "Placeholder histórico (nombre genérico). No es un trabajador verificado.",
    });
  } else if (t === "imported_placeholder") {
    out.push({
      key: "imported_placeholder",
      label: "Imported placeholder",
      tone: "warning",
      title:
        "Placeholder importado desde Connecteam u otro sistema. Sin identidad verificada.",
    });
  }

  // Only add the generic Pending Identity chip when no specific type chip
  // above already communicates the same idea.
  if (out.every((b) => b.key === "payroll_blocked") && isPendingIdentity(e)) {
    out.push({
      key: "pending_identity",
      label: "Pending identity",
      tone: "warning",
      title:
        "Identidad pendiente de revisión. No asignar ni pagar hasta resolver.",
    });
  }

  return out;
}

export const IDENTITY_UNRESOLVED_WARNING =
  "Identidad no resuelta. Revisar antes de asignar, dar acceso al portal o aprobar payroll.";
