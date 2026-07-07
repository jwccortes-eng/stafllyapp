/**
 * payrollDryRunReviewRouter — READ-ONLY helpers for the Root-Cause Explorer.
 *
 * Purpose:
 *   - Build safe deep-link URLs into normal admin flows (Time Clock, Attendance,
 *     Shifts, Payroll Review Queue) using whatever context is available
 *     (date, employee, time_entry_id, shift_id, period_id).
 *   - Derive a "manual review checklist" from probable causes detected in
 *     the dry-run. Nothing here writes, mutates, or persists anything.
 *
 * HARD RULES:
 *   - Pure functions. No I/O. No side effects.
 *   - Unknown/unsupported params are omitted. Destinations that don't read
 *     a given query param should ignore it silently.
 *   - Never emit URLs that trigger a write action or auto-fix.
 */

export type Severity = "alta" | "media" | "baja";

export type CauseKey =
  | "open_entries"
  | "no_shift_link"
  | "overlap"
  | "abnormal_duration"
  | "midnight_cross"
  | "missing_pbp"
  | "no_native_entries"
  | "delta_critical_unexplained";

export type ReviewModule =
  | "timeclock"
  | "attendance"
  | "shifts"
  | "review_queue"
  | "timeclock+shifts";

export interface ChecklistItem {
  key: CauseKey;
  title: string;
  reason: string;
  severity: Severity;
  ctaLabel: string;
  ctaHref: string;
  module: ReviewModule;
}

export interface RouterCtx {
  employeeId?: string | null;
  periodId?: string | null;
  /** Fallback date (usually the period's start_date). */
  anchorDate?: string | null;
  /** More specific date when known (e.g. day with problematic entries). */
  problematicDate?: string | null;
  timeEntryId?: string | null;
  shiftId?: string | null;
}

export interface CauseCounts {
  open: number;
  noShift: number;
  overlap: number;
  abnormal: number;
  midnight: number;
  total: number;
}

export interface CauseInputs {
  counts: CauseCounts;
  referenceHours: number | null;
  nativeHours: number | null;
  deltaHours: number | null;
}

// ── URL builders ────────────────────────────────────────────────────────────

function qs(params: Record<string, string | null | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export function buildTimeClockUrl(ctx: {
  date?: string | null;
  timeEntryId?: string | null;
}): string {
  if (ctx.date) {
    return `/app/timeclock${qs({
      date: ctx.date,
      filter: "needs-review",
      time_entry: ctx.timeEntryId ?? undefined,
    })}`;
  }
  return `/app/timeclock${qs({
    when: "today",
    filter: "needs-review",
    time_entry: ctx.timeEntryId ?? undefined,
  })}`;
}

export function buildAttendanceUrl(ctx: {
  date?: string | null;
  employeeId?: string | null;
}): string {
  if (ctx.date) {
    return `/app/attendance${qs({
      date: ctx.date,
      employee: ctx.employeeId ?? undefined,
    })}`;
  }
  return `/app/attendance${qs({
    when: "today",
    employee: ctx.employeeId ?? undefined,
  })}`;
}

export function buildShiftsUrl(ctx: {
  shiftId?: string | null;
  date?: string | null;
}): string {
  if (ctx.shiftId) return `/app/shifts${qs({ shift: ctx.shiftId })}`;
  if (ctx.date) return `/app/shifts${qs({ date: ctx.date })}`;
  return `/app/shifts${qs({ when: "today" })}`;
}

export function buildReviewQueueUrl(ctx: {
  periodId?: string | null;
  employeeId?: string | null;
}): string {
  return `/app/payroll-review-queue${qs({
    period: ctx.periodId ?? undefined,
    employee: ctx.employeeId ?? undefined,
  })}`;
}

// ── Cause detection ─────────────────────────────────────────────────────────

const ABNORMAL_MAX_HOURS = 16;

export function detectCauses(inp: CauseInputs): CauseKey[] {
  const out: CauseKey[] = [];
  const { counts, referenceHours, nativeHours, deltaHours } = inp;

  if (counts.open > 0) out.push("open_entries");
  if (counts.noShift > 0) out.push("no_shift_link");
  if (counts.overlap > 0) out.push("overlap");
  if (counts.abnormal > 0) out.push("abnormal_duration");
  if (counts.midnight > 0) out.push("midnight_cross");

  if (referenceHours == null && (nativeHours ?? 0) > 0) out.push("missing_pbp");
  if ((nativeHours == null || counts.total === 0) && (referenceHours ?? 0) > 0) {
    out.push("no_native_entries");
  }

  const alreadyExplained = out.some((k) =>
    k === "open_entries" ||
    k === "overlap" ||
    k === "abnormal_duration" ||
    k === "midnight_cross" ||
    k === "no_shift_link" ||
    k === "no_native_entries",
  );
  if (!alreadyExplained && deltaHours != null && Math.abs(deltaHours) >= 2) {
    out.push("delta_critical_unexplained");
  }
  return out;
}

// ── Severity ────────────────────────────────────────────────────────────────

function severityFor(key: CauseKey, inp: CauseInputs): Severity {
  const { counts, deltaHours } = inp;
  const bigDelta = deltaHours != null && Math.abs(deltaHours) >= 2;
  switch (key) {
    case "open_entries":
      return counts.open >= 2 || bigDelta ? "alta" : "media";
    case "overlap":
      return "alta";
    case "abnormal_duration":
      return counts.abnormal >= 1 ? "alta" : "media";
    case "midnight_cross":
      return "media";
    case "no_shift_link":
      if (counts.total > 0 && counts.noShift >= Math.max(1, Math.floor(counts.total / 2))) return "media";
      return "baja";
    case "missing_pbp":
      return "alta";
    case "no_native_entries":
      return "alta";
    case "delta_critical_unexplained":
      return "alta";
    default:
      return "baja";
  }
}

// ── Checklist ───────────────────────────────────────────────────────────────

const _MAX_ABNORMAL = ABNORMAL_MAX_HOURS; // exposed as constant reference for reason copy

export function buildChecklist(inp: CauseInputs, ctx: RouterCtx): ChecklistItem[] {
  const causes = detectCauses(inp);
  const dateForFlow = ctx.problematicDate ?? ctx.anchorDate ?? null;

  const items: ChecklistItem[] = [];

  for (const key of causes) {
    const severity = severityFor(key, inp);
    switch (key) {
      case "open_entries":
        items.push({
          key,
          title: "Revisar fichajes abiertos en Time Clock",
          reason: `Se detectaron ${inp.counts.open} fichaje${inp.counts.open === 1 ? "" : "s"} sin clock-out; quedan fuera de las horas nativas.`,
          severity,
          module: "timeclock",
          ctaLabel: "Abrir Time Clock",
          ctaHref: buildTimeClockUrl({ date: dateForFlow, timeEntryId: ctx.timeEntryId ?? undefined }),
        });
        break;
      case "no_shift_link":
        items.push({
          key,
          title: "Revisar entries sin shift link",
          reason: `${inp.counts.noShift} entrada${inp.counts.noShift === 1 ? "" : "s"} sin turno asociado; confirmar si pertenecen a un turno real.`,
          severity,
          module: "timeclock+shifts",
          ctaLabel: "Abrir Time Clock",
          ctaHref: buildTimeClockUrl({ date: dateForFlow }),
        });
        break;
      case "overlap":
        items.push({
          key,
          title: "Revisar entradas solapadas",
          reason: `${inp.counts.overlap} solapamiento${inp.counts.overlap === 1 ? "" : "s"} detectado${inp.counts.overlap === 1 ? "" : "s"}; pueden inflar las horas nativas.`,
          severity,
          module: "attendance",
          ctaLabel: "Abrir Attendance",
          ctaHref: buildAttendanceUrl({ date: dateForFlow, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
      case "abnormal_duration":
        items.push({
          key,
          title: "Revisar duración anormal",
          reason: `${inp.counts.abnormal} entrada${inp.counts.abnormal === 1 ? "" : "s"} con duración ≤ 0h o > ${_MAX_ABNORMAL}h; revisar clock-in/out.`,
          severity,
          module: "timeclock",
          ctaLabel: "Abrir Time Clock",
          ctaHref: buildTimeClockUrl({ date: dateForFlow }),
        });
        break;
      case "midnight_cross":
        items.push({
          key,
          title: "Revisar turnos que cruzan medianoche",
          reason: `${inp.counts.midnight} entrada${inp.counts.midnight === 1 ? "" : "s"} cruza${inp.counts.midnight === 1 ? "" : "n"} medianoche; revisar corte diario/período.`,
          severity,
          module: "attendance",
          ctaLabel: "Abrir Attendance",
          ctaHref: buildAttendanceUrl({ date: dateForFlow, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
      case "missing_pbp":
        items.push({
          key,
          title: "Confirmar reconciliación del período",
          reason: "El worker tiene horas nativas pero no aparece en la reconciliación consolidada del período.",
          severity,
          module: "review_queue",
          ctaLabel: "Abrir Payroll Review Queue",
          ctaHref: buildReviewQueueUrl({ periodId: ctx.periodId ?? undefined, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
      case "no_native_entries":
        items.push({
          key,
          title: "Confirmar registro nativo del worker",
          reason: "El worker aparece en la reconciliación pero no tiene fichajes nativos cerrados; confirmar si trabajó fuera del time clock nativo.",
          severity,
          module: "attendance",
          ctaLabel: "Abrir Attendance",
          ctaHref: buildAttendanceUrl({ date: dateForFlow, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
      case "delta_critical_unexplained":
        items.push({
          key,
          title: "Revisar ajustes externos o de reconciliación",
          reason: "Delta crítico sin causa evidente en los fichajes nativos; revisar ajustes o diferencias externas.",
          severity,
          module: "review_queue",
          ctaLabel: "Abrir Payroll Review Queue",
          ctaHref: buildReviewQueueUrl({ periodId: ctx.periodId ?? undefined, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
    }
  }

  // Sort by severity: alta → media → baja
  const rank: Record<Severity, number> = { alta: 0, media: 1, baja: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return items;
}

// ── Best review point ───────────────────────────────────────────────────────

export interface BestReviewPoint {
  module: ReviewModule;
  label: string;
  hint: string;
}

export function bestReviewPoint(causes: CauseKey[]): BestReviewPoint | null {
  if (causes.length === 0) return null;
  // Precedence order for dominant cause.
  const order: CauseKey[] = [
    "open_entries",
    "abnormal_duration",
    "overlap",
    "no_shift_link",
    "midnight_cross",
    "missing_pbp",
    "no_native_entries",
    "delta_critical_unexplained",
  ];
  const dominant = order.find((k) => causes.includes(k));
  if (!dominant) return null;
  switch (dominant) {
    case "open_entries":
    case "abnormal_duration":
    case "overlap":
      return { module: "timeclock", label: "Time Clock", hint: "Fichajes abiertos, anormales o solapados se resuelven aquí." };
    case "no_shift_link":
      return { module: "timeclock+shifts", label: "Time Clock + Shifts", hint: "Alinear entries con turnos reales." };
    case "midnight_cross":
      return { module: "attendance", label: "Attendance", hint: "Revisar corte diario / período." };
    case "missing_pbp":
    case "delta_critical_unexplained":
      return { module: "review_queue", label: "Payroll Review Queue", hint: "Diferencias de reconciliación externa." };
    case "no_native_entries":
      return { module: "attendance", label: "Attendance / Time Clock", hint: "Confirmar si el worker trabajó fuera del time clock nativo." };
    default:
      return null;
  }
}

/** Whitelist of reason keys the Explorer may highlight when deep-linked. */
export const HIGHLIGHTABLE_REASONS: ReadonlySet<CauseKey> = new Set<CauseKey>([
  "open_entries",
  "no_shift_link",
  "overlap",
  "abnormal_duration",
  "midnight_cross",
  "missing_pbp",
  "no_native_entries",
  "delta_critical_unexplained",
]);
