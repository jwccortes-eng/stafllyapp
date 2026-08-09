/**
 * Export Connecteam v1.1 — Stafly → Connecteam shift import template.
 *
 * SCOPE (HARD BOUNDARY):
 *   Pure, frontend-only helpers that read scheduled shift data and produce a
 *   CSV row matching Connecteam's 16-column import template.
 *   NO writes — ever — to payroll, time_entries, attendance, clock_events,
 *   scheduled_shifts, shift_assignments, employees, RLS, schema, or edge
 *   functions. NO bidirectional sync. NO automated import. NO scheduled job.
 *
 * GATING:
 *   Callers MUST gate the entry point with admin-equivalent permission for the
 *   current tenant (`canAccessAdminForCompany(selectedCompanyId)`, or
 *   `canManageShifts({...})`). Workers must never see the export action.
 *
 * LEGACY SHIFT NUMBER (mem://business-logic/legacy-shift-number-policy):
 *   `shift_code` may ONLY travel in the Note column as `Ref: <code>`.
 *
 * v1.1 CHANGES (after first real Connecteam import):
 *   - Address priority now PHYSICAL ADDRESS first; `location.name` is only the
 *     last fallback (Connecteam was importing "Eminence Ballroom" as Address).
 *   - Users default to EMPTY in capacity-only mode — Connecteam needs exact
 *     user identifiers; matching by display name fails silently. Workers are
 *     assigned inside Connecteam. `Number of users` keeps slots/capacity.
 *   - Job tries best-known Connecteam-job hint fields first; warns when the
 *     value is a fallback that may not match an existing Connecteam Job.
 *
 * Audit: docs/EXPORT_CONNECTEAM_V1_AUDIT.md.
 */
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";
import { resolveConnecteamJobAndSubItem } from "./connecteam-compat";
import type { ConnecteamMappingConfig } from "./connecteam-mapping";
import { isPlaceholderName } from "@/lib/placeholder-name";


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
  isAdmin: boolean;
  selectedCompanyId: string | null;
  shiftCompanyId?: string | null;
}

export interface BuildContext {
  clients: SelectOption[];
  locations: SelectOption[];
  employees: Employee[];
  assignments: Assignment[];
  categories?: SelectOption[];
  defaultTimezone?: string;
  /**
   * Mapping Connecteam de la compañía (Job / Sub item). Fuente canónica del
   * destino; cuando existe, desactiva las reglas legacy hardcodeadas.
   */
  mapping?: ConnecteamMappingConfig | null;
}


/**
 * v1.1 export options. Defaults are SAFE-by-default to avoid silent matching
 * failures in Connecteam.
 */
export interface ExportOptions {
  /**
   * If false (default in v1.1), `Users` column is exported EMPTY. Connecteam
   * requires exact user identifiers and falls back to "Select Users" when it
   * cannot match a display name. Workers are assigned inside Connecteam.
   */
  includeUsers?: boolean;
}

const DEFAULT_OPTIONS: Required<ExportOptions> = {
  includeUsers: false,
};

const DEFAULT_TZ = "America/New_York";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
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

function nonEmpty(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Effective assignments for export — accepted/confirmed only. */
export function effectiveAssignmentsForExport(shiftId: string, assignments: Assignment[]): Assignment[] {
  return assignments.filter(a =>
    a.shift_id === shiftId &&
    (a.status === "accepted" || a.status === "confirmed"),
  );
}

// ── Address & Job resolution (v1.1) ────────────────────────────────────────

export type AddressSource =
  | "location.full_address"
  | "location.formatted_address"
  | "location.address"
  | "shift.job_site_address"
  | "shift.manual_address"
  | "shift.address"
  | "location.name"
  | "none";

export interface AddressResolution {
  value: string;
  source: AddressSource;
}

/**
 * Address priority (v1.1) — physical address ALWAYS wins over venue name.
 * Connecteam was importing "Eminence Ballroom" (venue label) as Address;
 * that's why this order is strict.
 */
export function resolveAddress(shift: Shift, ctx: BuildContext): AddressResolution {
  const s = shift as Shift & {
    job_site_address?: string | null;
    manual_address?: string | null;
    address?: string | null;
  };
  const loc = ctx.locations.find(l => l.id === shift.location_id) as
    | (SelectOption & {
        full_address?: string | null;
        formatted_address?: string | null;
        address?: string | null;
      })
    | undefined;

  const tryList: Array<[string | null | undefined, AddressSource]> = [
    [loc?.full_address, "location.full_address"],
    [loc?.formatted_address, "location.formatted_address"],
    [loc?.address, "location.address"],
    [s.job_site_address, "shift.job_site_address"],
    [s.manual_address, "shift.manual_address"],
    [s.address, "shift.address"],
    [loc?.name, "location.name"], // last-resort fallback (venue label, NOT address)
  ];

  for (const [val, source] of tryList) {
    const v = nonEmpty(val);
    if (v) return { value: v, source };
  }
  return { value: "", source: "none" };
}

export type JobSource =
  | "shift.connecteam_job_name"
  | "location.connecteam_job_name"
  | "client.connecteam_job_name"
  | "location.name"
  | "client.name"
  | "category.name"
  | "none";

export interface JobResolution {
  value: string;
  source: JobSource;
  /** Sub item value (category) when it's distinct from Job. */
  subItem: string;
  /** True when the source is NOT a confirmed Connecteam-job hint. */
  isFallback: boolean;
}

/**
 * Job priority (v1.1) — prefer explicit Connecteam-job hint fields when they
 * exist (no schema change here; we read them opportunistically via optional
 * shape). Fall back to location.name (many tenants use venue as Connecteam Job),
 * then client.name, then category. UI surfaces a warning on fallback so the
 * operator knows Connecteam may show "Select" instead of auto-matching.
 */
export function resolveJob(shift: Shift, ctx: BuildContext): JobResolution {
  const s = shift as Shift & {
    connecteam_job_name?: string | null;
    category_id?: string | null;
  };
  const client = ctx.clients.find(c => c.id === s.client_id) as
    | (SelectOption & { connecteam_job_name?: string | null })
    | undefined;
  const location = ctx.locations.find(l => l.id === s.location_id) as
    | (SelectOption & { connecteam_job_name?: string | null })
    | undefined;
  const category = ctx.categories?.find(c => c.id === s.category_id);

  const hintList: Array<[string | null | undefined, JobSource, boolean]> = [
    [s.connecteam_job_name, "shift.connecteam_job_name", false],
    [location?.connecteam_job_name, "location.connecteam_job_name", false],
    [client?.connecteam_job_name, "client.connecteam_job_name", false],
    [location?.name, "location.name", true],
    [client?.name, "client.name", true],
    [category?.name, "category.name", true],
  ];

  for (const [val, source, isFallback] of hintList) {
    const v = nonEmpty(val);
    if (v) {
      const catName = nonEmpty(category?.name);
      const subItem = catName && catName !== v ? catName : "";
      return { value: v, source, subItem, isFallback };
    }
  }
  return { value: "", source: "none", subItem: "", isFallback: true };
}

// ── Row builder ────────────────────────────────────────────────────────────

export function buildConnecteamRow(
  shift: Shift,
  ctx: BuildContext,
  options: ExportOptions = {},
): ConnecteamRow {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const s = shift as Shift & {
    timezone?: string | null;
    special_instructions?: string | null;
  };

  const eff = effectiveAssignmentsForExport(s.id, ctx.assignments);
  const userNames = eff
    .map(a => {
      const emp = ctx.employees.find(e => e.id === a.employee_id);
      if (!emp) return null;
      const full = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
      if (!full) return null;
      // Never export placeholder identities (System X, Unknown, Temp, Placeholder…).
      if (isPlaceholderName({ first_name: emp.first_name, last_name: emp.last_name, full_name: full })) {
        return null;
      }
      return full;
    })
    .filter((n): n is string => !!n);

  const compat = resolveConnecteamJobAndSubItem(shift, ctx);
  const addr = resolveAddress(shift, ctx);


  // Number of users: prefer declared slots/capacity; fall back to assigned count.
  const numberOfUsers = String(s.slots ?? userNames.length ?? 0);

  // Users: empty by default in v1.1 (Connecteam needs exact identifiers).
  const usersValue = opts.includeUsers ? userNames.join("; ") : "";

  // Identificador humano del servicio: `shift_ref` (QK-001578) es la referencia
  // canónica visible; `shift_code` solo como fallback histórico. NUNCA el UUID.
  const humanRef = nonEmpty(s.shift_ref) || nonEmpty(s.shift_code) || "";

  // Note: notes + special_instructions + `Ref: <referencia>` (never Stafly UUID).
  const noteParts: string[] = [];
  if (s.notes && s.notes.trim()) noteParts.push(s.notes.trim());
  if (s.special_instructions && s.special_instructions.trim()) {
    noteParts.push(s.special_instructions.trim());
  }
  if (humanRef) {
    noteParts.push(`Ref: ${humanRef}`);
  }
  const note = noteParts.join(" · ");

  // Shift title: `QK-001578 · Luminance`. Hace cada fila única y trazable en
  // Connecteam (dos servicios del mismo día con el mismo nombre dejan de ser
  // indistinguibles). El código legado sigue viajando solo en Note.
  const rawTitle = (s.title ?? "").trim();
  const shiftTitle = nonEmpty(s.shift_ref)
    ? [nonEmpty(s.shift_ref), rawTitle].filter(Boolean).join(" · ")
    : rawTitle;

  const row: ConnecteamRow = {
    "Date": fmtDate(s.date),
    "Start": fmtTime(s.start_time),
    "End": fmtTime(s.end_time),
    "Timezone": resolveTimezone(s, ctx),
    "Unpaid break": "",
    "Paid break": "",
    "Shift title": shiftTitle,

    "Job": compat.job,
    "Sub item": compat.subItem,
    "Address": addr.value,
    "Users": usersValue,

    "Shift tags": "",
    "Note": note,
    "Number of users": numberOfUsers,
    "Require Approval": "",
    "Tasks": "",
  };

  return row;
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  status: ExportStatus;
  warnings: ExportWarning[];
  /** v1.2 diagnostic metadata — surface in preview UI. */
  meta: {
    addressSource: AddressSource;
    /** Legacy: kept for backwards compat. Use jobConfidence/jobRuleId instead. */
    jobSource: JobSource;
    jobIsFallback: boolean;
    /** v1.2: confidence of the Job/Sub item mapping. */
    jobConfidence: "exact" | "inferred" | "fallback" | "missing";
    /** v1.2: beta rule id when confidence === "inferred". */
    jobRuleId?: string;
    /** v1.2: resolved Connecteam Job string (post-compat). */
    job: string;
    /** v1.2: resolved Connecteam Sub item string (post-compat). */
    subItem: string;
    usersExported: boolean;
    assignedCount: number;
    capacity: number;
  };
}

export function validateShiftForExport(
  shift: Shift,
  buildCtx: BuildContext,
  validateCtx: ValidateContext,
  options: ExportOptions = {},
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: ExportWarning[] = [];

  const addr = resolveAddress(shift, buildCtx);
  const legacyJob = resolveJob(shift, buildCtx);
  const compat = resolveConnecteamJobAndSubItem(shift, buildCtx);
  const eff = effectiveAssignmentsForExport(shift.id, buildCtx.assignments);
  const capacity = Number(shift.slots ?? 0);
  const meta = {
    addressSource: addr.source,
    jobSource: legacyJob.source,
    jobIsFallback: legacyJob.isFallback,
    jobConfidence: compat.confidence,
    jobRuleId: compat.source.ruleId,
    job: compat.job,
    subItem: compat.subItem,
    usersExported: opts.includeUsers,
    assignedCount: eff.length,
    capacity,
  };


  // BLOCK — permissions / tenant scope.
  if (!validateCtx.isAdmin) {
    return {
      status: "blocked",
      meta,
      warnings: [{ code: "no_admin", severity: "block", message: "Solo administradores pueden exportar." }],
    };
  }
  if (!validateCtx.selectedCompanyId) {
    return {
      status: "blocked",
      meta,
      warnings: [{ code: "no_tenant", severity: "block", message: "Sin compañía seleccionada." }],
    };
  }
  if (validateCtx.shiftCompanyId && validateCtx.shiftCompanyId !== validateCtx.selectedCompanyId) {
    return {
      status: "blocked",
      meta,
      warnings: [{ code: "tenant_mismatch", severity: "block", message: "El turno pertenece a otra compañía." }],
    };
  }

  // CONTEXT — publication lifecycle.
  //
  // `publication_status` NO es un requisito del archivo Connecteam: un borrador
  // completo contiene exactamente la misma información que un publicado.
  // Exportar un borrador NO lo publica, no notifica y no cambia su estado.
  // Solo los estados terminales (cancelado/archivado) siguen bloqueando, porque
  // el turno ya no debe existir en el calendario de Connecteam.
  const pub = (shift.publication_status ?? "").trim();
  const TERMINAL = ["cancelled", "canceled", "archived"];
  if (pub && TERMINAL.includes(pub.toLowerCase())) {
    return {
      status: "blocked",
      meta,
      warnings: [{
        code: "terminal_status",
        severity: "block",
        message: `El turno está en estado "${pub}" — no debe importarse a Connecteam.`,
      }],
    };
  }
  if (pub && pub !== "published") {
    warnings.push({
      code: "draft_export_context",
      severity: "info",
      message: `Stafly: borrador (${pub}). Exportar no lo publica ni notifica a nadie.`,
    });
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
  // BLOQUEO — duración cero. Connecteam DESCARTA en silencio las filas cuyo
  // End es igual al Start (el turno no dura nada). Es la causa real de que un
  // CSV con 3 filas importe menos turnos de los seleccionados.
  if (
    shift.start_time && shift.end_time &&
    fmtTime(shift.start_time) === fmtTime(shift.end_time)
  ) {
    warnings.push({
      code: "zero_duration",
      severity: "block",
      message: `Inicio y fin son la misma hora (${fmtTime(shift.start_time)}). Connecteam descarta estas filas: corrige la hora de fin.`,
    });
  }

  if (!nonEmpty(shift.title)) {
    warnings.push({ code: "missing_title", severity: "block", message: "Falta el título del turno." });
  }
  const tz = resolveTimezone(shift, buildCtx);
  if (!tz) {
    warnings.push({ code: "missing_timezone", severity: "block", message: "Falta timezone." });
  }
  // Merge BLOCK-level warnings from the compat helper (missing_job_context).
  for (const w of compat.warnings) {
    if (w.severity === "block") warnings.push(w);
  }

  // v1.1: NO bloquear por 0 accepted assignments si el export es capacity-only
  // y hay capacidad declarada. Connecteam recibirá Number of users con slots.
  if (eff.length === 0 && !opts.includeUsers) {
    if (capacity <= 0) {
      warnings.push({
        code: "no_capacity_no_users",
        severity: "block",
        message: "Sin capacidad (slots) y sin workers aceptados — nada que importar.",
      });
    }
  } else if (eff.length === 0 && opts.includeUsers) {
    warnings.push({
      code: "no_accepted_assignments",
      severity: "block",
      message: "Modo Users activo pero ningún worker aceptó el turno todavía.",
    });
  }

  if (warnings.some(w => w.severity === "block")) {
    return { status: "blocked", meta, warnings };
  }

  // NEEDS REVIEW — v1.2 diagnostics.

  // Users not exported in safe mode.
  if (!opts.includeUsers) {
    warnings.push({
      code: "users_not_exported_v1_2",
      severity: "warn",
      message: "Users no exportados en v1.2 — asigna workers en Connecteam o configura identificadores. Number of users mantiene la capacidad.",
    });
  }

  // Merge info/warn from compat helper (compat_rule_applied / job_fallback).
  for (const w of compat.warnings) {
    if (w.severity !== "block") warnings.push(w);
  }


  // Address came from venue name only — not a physical address.
  if (addr.source === "location.name") {
    warnings.push({
      code: "address_from_venue_name",
      severity: "warn",
      message: "Address proviene del nombre del venue, no de una dirección física. Agrega una dirección al lugar o al turno.",
    });
  }
  if (addr.source === "none") {
    warnings.push({
      code: "address_missing",
      severity: "warn",
      message: "Sin dirección — Connecteam no podrá geolocalizar el turno.",
    });
  }

  if (!shift.notes || !shift.notes.trim()) {
    warnings.push({ code: "empty_notes", severity: "info", message: "Notas vacías (opcional)." });
  }

  warnings.push({
    code: "v1_blank_columns",
    severity: "info",
    message: "Breaks, tags, tasks y require approval se exportan vacíos (v1).",
  });

  const hasWarn = warnings.some(w => w.severity === "warn");
  return { status: hasWarn ? "needs_review" : "ready", meta, warnings };
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

/** UTF-8 BOM prefix — mejora la apertura del CSV en Excel/Numbers con acentos. */
export const CSV_UTF8_BOM = "\uFEFF";

/** Bulk export filename: stafly-connecteam-shifts-YYYY-MM-DD.csv (fecha local hoy). */
export function bulkExportFilename(today: Date = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `stafly-connecteam-shifts-${y}-${m}-${d}.csv`;
}

// ── Colisiones de filas (Connecteam fusiona duplicados) ────────────────────

/**
 * Firma de una fila tal y como Connecteam la interpreta: fecha + horas +
 * título + Job + Sub item. Dos filas con la misma firma se importan como un
 * único turno, aunque en Stafly sean dos servicios distintos.
 */
export function connecteamRowSignature(row: ConnecteamRow): string {
  return [
    row.Date, row.Start, row.End, row["Shift title"], row.Job, row["Sub item"],
  ].join("|").toLowerCase();
}

/** Firmas repetidas dentro de una exportación en bloque. Vacío = sin colisión. */
export function findDuplicateRowSignatures(rows: ConnecteamRow[]): string[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const sig = connecteamRowSignature(r);
    seen.set(sig, (seen.get(sig) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([sig]) => sig);
}

/** Nº de filas de datos de un CSV serializado (excluye el encabezado). */
export function countCsvDataRows(csv: string): number {
  const body = csv.replace(/^\uFEFF/, "").trim();
  if (!body) return 0;
  const lines = body.split(/\r?\n/);
  return Math.max(0, lines.length - 1);
}
