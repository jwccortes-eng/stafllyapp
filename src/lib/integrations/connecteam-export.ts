/**
 * Export Connecteam v1 — Stafly → Connecteam shift import template.
 *
 * Pure, frontend-only helpers. NO writes to payroll, time_entries, attendance,
 * scheduled_shifts, shift_assignments, RLS, schema, or edge functions.
 *
 * Implements the audit at docs/EXPORT_CONNECTEAM_V1_AUDIT.md.
 *
 * Legacy shift number policy (mem://business-logic/legacy-shift-number-policy):
 *   `shift_code` may ONLY travel in the Note column as `Ref: <code>`.
 *   Never as Shift title, never as primary key, never as Stafly's operational id.
 */
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";

/** Connecteam import template — column order is canonical and MUST NOT change. */
export const CONNECTEAM_HEADERS = [
  "Date",
  "Start",
  "End",
  "Timezone",
  "Unpaid break",
  "Paid break",
  "Shift title",
  "Job",
  "Sub item",
  "Address",
  "Users",
  "Shift tags",
  "Note",
  "Number of users",
  "Require Approval",
  "Tasks",
] as const;

export type ConnecteamHeader = (typeof CONNECTEAM_HEADERS)[number];
export type ConnecteamRow = Record<ConnecteamHeader, string>;

export type ExportStatus = "ready" | "needs_review" | "blocked";

export interface ExportWarning {
  code: string;
  message: string;
  severity: "info" | "warn" | "block";
}

export interface ValidateContext {
  /** Whether the calling user is admin for the shift's tenant. */
  isAdmin: boolean;
  /** Tenant the shift belongs to — used for scope safety check. */
  selectedCompanyId: string | null;
  /** Company id stored on the shift (if known) — must match selectedCompanyId. */
  shiftCompanyId?: string | null;
}

export interface BuildContext {
  clients: SelectOption[];
  locations: SelectOption[];
  employees: Employee[];
  assignments: Assignment[];
  /** Optional category lookup (id → name). */
  categories?: SelectOption[];
  /** Tenant-level timezone fallback. Defaults to America/New_York. */
  defaultTimezone?: string;
}

const DEFAULT_TZ = "America/New_York";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  // ISO yyyy-mm-dd → MM/DD/YYYY (Connecteam format).
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  // Strip seconds if present: "08:00:00" → "08:00".
  return t.slice(0, 5);
}

function resolveTimezone(shift: Shift, ctx: BuildContext): string {
  const s = shift as Shift & { timezone?: string | null };
  return s.timezone || ctx.defaultTimezone || DEFAULT_TZ;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Effective assignments for export — accepted/confirmed only. */
export function effectiveAssignmentsForExport(shiftId: string, assignments: Assignment[]): Assignment[] {
  return assignments.filter(a =>
    a.shift_id === shiftId &&
    (a.status === "accepted" || a.status === "confirmed"),
  );
}

// ── Row builder ────────────────────────────────────────────────────────────

export function buildConnecteamRow(shift: Shift, ctx: BuildContext): ConnecteamRow {
  const s = shift as Shift & {
    timezone?: string | null;
    job_site_address?: string | null;
    category_id?: string | null;
    special_instructions?: string | null;
    meeting_point?: string | null;
  };

  const client = ctx.clients.find(c => c.id === s.client_id) ?? null;
  const category = ctx.categories?.find(c => c.id === s.category_id) ?? null;
  const location = ctx.locations.find(l => l.id === s.location_id) ?? null;

  const eff = effectiveAssignmentsForExport(s.id, ctx.assignments);
  const userNames = eff
    .map(a => {
      const emp = ctx.employees.find(e => e.id === a.employee_id);
      if (!emp) return null;
      const full = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
      return full || null;
    })
    .filter((n): n is string => !!n);

  // Job: prefer client name, fall back to category name.
  const job = client?.name ?? category?.name ?? "";
  // Sub item: category name only if it's not already the Job.
  const subItem = client?.name && category?.name ? category.name : "";

  // Address: prefer structured location name; fall back to free-text job site.
  const address = location?.name ?? s.job_site_address ?? "";

  // Note: notes + special_instructions + `Ref: <shift_code>` + Stafly id.
  const noteParts: string[] = [];
  if (s.notes && s.notes.trim()) noteParts.push(s.notes.trim());
  if (s.special_instructions && s.special_instructions.trim()) {
    noteParts.push(s.special_instructions.trim());
  }
  if (s.shift_code && s.shift_code.trim()) {
    noteParts.push(`Ref: ${s.shift_code.trim()}`);
  }
  noteParts.push(`Stafly shift id: ${s.id}`);
  const note = noteParts.join(" · ");

  const row: ConnecteamRow = {
    "Date": fmtDate(s.date),
    "Start": fmtTime(s.start_time),
    "End": fmtTime(s.end_time),
    "Timezone": resolveTimezone(s, ctx),
    "Unpaid break": "",
    "Paid break": "",
    "Shift title": (s.title ?? "").trim(),
    "Job": job,
    "Sub item": subItem,
    "Address": address,
    "Users": userNames.join("; "),
    "Shift tags": "",
    "Note": note,
    "Number of users": String(s.slots ?? userNames.length ?? 0),
    "Require Approval": "",
    "Tasks": "",
  };

  return row;
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  status: ExportStatus;
  warnings: ExportWarning[];
}

export function validateShiftForExport(
  shift: Shift,
  buildCtx: BuildContext,
  validateCtx: ValidateContext,
): ValidationResult {
  const warnings: ExportWarning[] = [];

  // BLOCK — permissions / tenant scope.
  if (!validateCtx.isAdmin) {
    return {
      status: "blocked",
      warnings: [{ code: "no_admin", severity: "block", message: "Solo administradores pueden exportar." }],
    };
  }
  if (!validateCtx.selectedCompanyId) {
    return {
      status: "blocked",
      warnings: [{ code: "no_tenant", severity: "block", message: "Sin compañía seleccionada." }],
    };
  }
  if (validateCtx.shiftCompanyId && validateCtx.shiftCompanyId !== validateCtx.selectedCompanyId) {
    return {
      status: "blocked",
      warnings: [{ code: "tenant_mismatch", severity: "block", message: "El turno pertenece a otra compañía." }],
    };
  }

  // BLOCK — publication lifecycle.
  const pub = shift.publication_status;
  if (pub && pub !== "published") {
    return {
      status: "blocked",
      warnings: [{
        code: "not_published",
        severity: "block",
        message: `El turno está en estado "${pub}". Publica antes de exportar.`,
      }],
    };
  }

  // BLOCK — mandatory minimum fields.
  if (!shift.date) {
    warnings.push({ code: "missing_date", severity: "block", message: "Falta la fecha del turno." });
  }
  if (!shift.start_time) {
    warnings.push({ code: "missing_start", severity: "block", message: "Falta la hora de inicio." });
  }
  if (!shift.end_time) {
    warnings.push({ code: "missing_end", severity: "block", message: "Falta la hora de fin." });
  }

  const tz = resolveTimezone(shift, buildCtx);
  if (!tz) {
    warnings.push({ code: "missing_timezone", severity: "block", message: "Falta timezone." });
  }

  const s = shift as Shift & { category_id?: string | null };
  const hasClient = !!s.client_id;
  const hasCategory = !!s.category_id;
  if (!hasClient && !hasCategory) {
    warnings.push({
      code: "missing_job_context",
      severity: "block",
      message: "Sin cliente y sin categoría — Connecteam necesita un Job.",
    });
  }

  const eff = effectiveAssignmentsForExport(shift.id, buildCtx.assignments);
  if (eff.length === 0) {
    warnings.push({
      code: "no_accepted_assignments",
      severity: "block",
      message: "Ningún worker aceptó este turno todavía.",
    });
  }

  if (warnings.some(w => w.severity === "block")) {
    return { status: "blocked", warnings };
  }

  // NEEDS REVIEW — non-critical gaps.
  if (!hasClient && hasCategory) {
    warnings.push({
      code: "no_client",
      severity: "warn",
      message: "Sin cliente — se exportará la categoría como Job.",
    });
  }
  const s2 = shift as Shift & { job_site_address?: string | null };
  const location = buildCtx.locations.find(l => l.id === shift.location_id);
  if (!location && !s2.job_site_address) {
    warnings.push({
      code: "address_incomplete",
      severity: "warn",
      message: "Dirección incompleta o no estructurada.",
    });
  }

  if (!shift.notes || !shift.notes.trim()) {
    warnings.push({ code: "empty_notes", severity: "info", message: "Notas vacías (opcional)." });
  }

  // Always-informational: breaks/tags/tasks/require-approval are blank in v1.
  warnings.push({
    code: "v1_blank_columns",
    severity: "info",
    message: "Breaks, tags, tasks y require approval se exportan vacíos (v1).",
  });

  const hasWarn = warnings.some(w => w.severity === "warn");
  return { status: hasWarn ? "needs_review" : "ready", warnings };
}

// ── CSV serialization ──────────────────────────────────────────────────────

export function serializeConnecteamCsv(rows: ConnecteamRow[]): string {
  const header = CONNECTEAM_HEADERS.map(csvEscape).join(",");
  const body = rows
    .map(r => CONNECTEAM_HEADERS.map(h => csvEscape(r[h])).join(","))
    .join("\n");
  return body ? `${header}\n${body}` : header;
}

/** Filename: connecteam-shift-<YYYYMMDD>-<short-id>.csv */
export function exportFilename(shift: Shift): string {
  const ymd = (shift.date || "").replace(/-/g, "");
  const short = (shift.id || "shift").slice(0, 8);
  return `connecteam-shift-${ymd}-${short}.csv`;
}
