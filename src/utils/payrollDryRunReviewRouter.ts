/**
 * payrollDryRunReviewRouter — READ-ONLY helpers for the Root-Cause Explorer.
 *
 * Purpose:
 *   - Build safe deep-link URLs into normal admin flows (Time Clock, Attendance,
 *     Shifts, Payroll Review Queue) using whatever context is available
 *     (date, employee, time_entry_id, shift_id, period_id).
 *   - Derive a "manual review checklist" from probable causes detected in
 *     the dry-run, with per-cause anchors (day, entry, shift) and human
 *     evidence lines when the data supports it.
 *   - Nothing here writes, mutates, or persists anything.
 *
 * HARD RULES:
 *   - Pure functions. No I/O. No side effects.
 *   - Unknown/unsupported params are omitted. Destinations that don't read
 *     a given query param should ignore it silently.
 *   - Never emit URLs that trigger a write / auto-fix / auto-link action.
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
  /** Per-item evidence line ("Primer fichaje abierto: 3 jul, 08:14"). */
  evidence: string | null;
  /** Anchor day (YYYY-MM-DD) if the item has one; otherwise null. */
  anchorDate: string | null;
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
  shiftId?: string | null;
}): string {
  if (ctx.date) {
    return `/app/timeclock${qs({
      date: ctx.date,
      filter: "needs-review",
      time_entry: ctx.timeEntryId ?? undefined,
      shift: ctx.shiftId ?? undefined,
    })}`;
  }
  return `/app/timeclock${qs({
    when: "today",
    filter: "needs-review",
    time_entry: ctx.timeEntryId ?? undefined,
    shift: ctx.shiftId ?? undefined,
  })}`;
}

export function buildAttendanceUrl(ctx: {
  date?: string | null;
  employeeId?: string | null;
  timeEntryId?: string | null;
}): string {
  if (ctx.date) {
    return `/app/attendance${qs({
      date: ctx.date,
      employee: ctx.employeeId ?? undefined,
      time_entry: ctx.timeEntryId ?? undefined,
    })}`;
  }
  return `/app/attendance${qs({
    when: "today",
    employee: ctx.employeeId ?? undefined,
    time_entry: ctx.timeEntryId ?? undefined,
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

// ── Anchors ─────────────────────────────────────────────────────────────────

export interface AnchorEntryFlags {
  open: boolean;
  noShift: boolean;
  overlap: boolean;
  abnormal: boolean;
  midnight: boolean;
}

export interface EnrichedEntryForAnchor {
  id: string;
  clock_in: string; // ISO
  clock_out: string | null;
  shift_id: string | null;
  /** Local YYYY-MM-DD of clock_in. */
  day: string;
  durationHours: number | null;
  flags: AnchorEntryFlags;
}

export interface CauseAnchor {
  date: string | null;         // YYYY-MM-DD
  timeEntryId: string | null;
  shiftId: string | null;
  /** Optional extra count (e.g. n overlaps that day). */
  extraCount?: number;
  /** Human-readable, localized evidence line. */
  evidence: string | null;
}

export type AnchorsByCause = Partial<Record<CauseKey, CauseAnchor>>;

const ES_MONTH = new Intl.DateTimeFormat("es", { month: "short", day: "numeric" });

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return ES_MONTH.format(d).replace(".", "");
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDayOnly(day: string): string {
  // day is already YYYY-MM-DD local — reuse fmtDate with a noon ISO to avoid TZ shift.
  return fmtDate(`${day}T12:00:00`);
}

export function deriveRootCauseAnchors(
  entries: EnrichedEntryForAnchor[],
): AnchorsByCause {
  const out: AnchorsByCause = {};

  // open_entries → first open entry
  const firstOpen = entries.find((e) => e.flags.open);
  if (firstOpen) {
    out.open_entries = {
      date: firstOpen.day,
      timeEntryId: firstOpen.id,
      shiftId: firstOpen.shift_id ?? null,
      evidence: `Primer fichaje abierto: ${fmtDayOnly(firstOpen.day)}, ${fmtTime(firstOpen.clock_in)}`,
    };
  }

  // no_shift_link → first entry without shift
  const firstNoShift = entries.find((e) => e.flags.noShift);
  if (firstNoShift) {
    const dur = firstNoShift.durationHours;
    const durTxt = dur != null && dur > 0 ? `, ${dur.toFixed(1)}h` : "";
    out.no_shift_link = {
      date: firstNoShift.day,
      timeEntryId: firstNoShift.id,
      shiftId: null,
      evidence: `Entry sin shift: ${fmtDayOnly(firstNoShift.day)}${durTxt}`,
    };
  }

  // overlap → first entry flagged as overlap; count overlaps in same day
  const firstOverlap = entries.find((e) => e.flags.overlap);
  if (firstOverlap) {
    const sameDayOverlaps = entries.filter(
      (e) => e.day === firstOverlap.day && e.flags.overlap,
    ).length;
    out.overlap = {
      date: firstOverlap.day,
      timeEntryId: firstOverlap.id,
      shiftId: firstOverlap.shift_id ?? null,
      extraCount: sameDayOverlaps,
      evidence: `Overlap detectado: ${fmtDayOnly(firstOverlap.day)}, ${sameDayOverlaps} entrada${sameDayOverlaps === 1 ? "" : "s"} solapada${sameDayOverlaps === 1 ? "" : "s"}`,
    };
  }

  // abnormal_duration → first abnormal entry
  const firstAbnormal = entries.find((e) => e.flags.abnormal);
  if (firstAbnormal) {
    const dur = firstAbnormal.durationHours;
    const durTxt = dur != null ? `${dur.toFixed(1)}h` : "duración desconocida";
    out.abnormal_duration = {
      date: firstAbnormal.day,
      timeEntryId: firstAbnormal.id,
      shiftId: firstAbnormal.shift_id ?? null,
      evidence: `Duración anormal: ${fmtDayOnly(firstAbnormal.day)}, ${durTxt}`,
    };
  }

  // midnight_cross → first entry that crosses midnight
  const firstMidnight = entries.find((e) => e.flags.midnight);
  if (firstMidnight && firstMidnight.clock_out) {
    out.midnight_cross = {
      date: firstMidnight.day,
      timeEntryId: firstMidnight.id,
      shiftId: firstMidnight.shift_id ?? null,
      evidence: `Cruza medianoche: ${fmtDayOnly(firstMidnight.day)} ${fmtTime(firstMidnight.clock_in)} → ${fmtDayOnly(firstMidnight.clock_out.slice(0, 10))} ${fmtTime(firstMidnight.clock_out)}`,
    };
  }

  // delta_critical_unexplained → busiest day (by native hours), if any entries
  if (entries.length > 0) {
    const perDay = new Map<string, number>();
    for (const e of entries) {
      if (e.durationHours != null && e.durationHours > 0) {
        perDay.set(e.day, (perDay.get(e.day) ?? 0) + e.durationHours);
      }
    }
    let busiest: { day: string; hours: number } | null = null;
    for (const [day, hours] of perDay) {
      if (!busiest || hours > busiest.hours) busiest = { day, hours };
    }
    if (busiest) {
      out.delta_critical_unexplained = {
        date: busiest.day,
        timeEntryId: null,
        shiftId: null,
        evidence: `Día con más horas nativas: ${fmtDayOnly(busiest.day)} (${busiest.hours.toFixed(1)}h)`,
      };
    }
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

export function buildChecklist(
  inp: CauseInputs,
  ctx: RouterCtx,
  anchors: AnchorsByCause = {},
): ChecklistItem[] {
  const causes = detectCauses(inp);
  const fallbackDate = ctx.problematicDate ?? ctx.anchorDate ?? null;

  const items: ChecklistItem[] = [];

  for (const key of causes) {
    const severity = severityFor(key, inp);
    const a = anchors[key] ?? null;
    const anchorDate = a?.date ?? fallbackDate;
    const anchorTimeEntry = a?.timeEntryId ?? ctx.timeEntryId ?? null;
    const anchorShift = a?.shiftId ?? ctx.shiftId ?? null;
    const evidence = a?.evidence ?? null;

    switch (key) {
      case "open_entries":
        items.push({
          key, severity, evidence, anchorDate,
          title: "Revisar fichajes abiertos en Time Clock",
          reason: `Se detectaron ${inp.counts.open} fichaje${inp.counts.open === 1 ? "" : "s"} sin clock-out; quedan fuera de las horas nativas.`,
          module: "timeclock",
          ctaLabel: "Abrir Time Clock",
          ctaHref: buildTimeClockUrl({ date: anchorDate, timeEntryId: anchorTimeEntry, shiftId: anchorShift }),
        });
        break;
      case "no_shift_link":
        items.push({
          key, severity, evidence, anchorDate,
          title: "Revisar entries sin shift link",
          reason: `${inp.counts.noShift} entrada${inp.counts.noShift === 1 ? "" : "s"} sin turno asociado; confirmar si pertenecen a un turno real.`,
          module: "timeclock+shifts",
          ctaLabel: "Abrir Time Clock",
          ctaHref: buildTimeClockUrl({ date: anchorDate, timeEntryId: anchorTimeEntry }),
        });
        break;
      case "overlap":
        items.push({
          key, severity, evidence, anchorDate,
          title: "Revisar entradas solapadas",
          reason: `${inp.counts.overlap} solapamiento${inp.counts.overlap === 1 ? "" : "s"} detectado${inp.counts.overlap === 1 ? "" : "s"}; pueden inflar las horas nativas.`,
          module: "attendance",
          ctaLabel: "Abrir Attendance",
          ctaHref: buildAttendanceUrl({ date: anchorDate, employeeId: ctx.employeeId ?? undefined, timeEntryId: anchorTimeEntry }),
        });
        break;
      case "abnormal_duration":
        items.push({
          key, severity, evidence, anchorDate,
          title: "Revisar duración anormal",
          reason: `${inp.counts.abnormal} entrada${inp.counts.abnormal === 1 ? "" : "s"} con duración ≤ 0h o > ${_MAX_ABNORMAL}h; revisar clock-in/out.`,
          module: "timeclock",
          ctaLabel: "Abrir Time Clock",
          ctaHref: buildTimeClockUrl({ date: anchorDate, timeEntryId: anchorTimeEntry }),
        });
        break;
      case "midnight_cross":
        items.push({
          key, severity, evidence, anchorDate,
          title: "Revisar turnos que cruzan medianoche",
          reason: `${inp.counts.midnight} entrada${inp.counts.midnight === 1 ? "" : "s"} cruza${inp.counts.midnight === 1 ? "" : "n"} medianoche; revisar corte diario/período.`,
          module: "attendance",
          ctaLabel: "Abrir Attendance",
          ctaHref: buildAttendanceUrl({ date: anchorDate, employeeId: ctx.employeeId ?? undefined, timeEntryId: anchorTimeEntry }),
        });
        break;
      case "missing_pbp":
        items.push({
          key, severity,
          evidence: evidence ?? "Sin reconciliación para este período",
          anchorDate: null,
          title: "Confirmar reconciliación del período",
          reason: "El worker tiene horas nativas pero no aparece en la reconciliación consolidada del período.",
          module: "review_queue",
          ctaLabel: "Abrir Payroll Review Queue",
          ctaHref: buildReviewQueueUrl({ periodId: ctx.periodId ?? undefined, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
      case "no_native_entries":
        items.push({
          key, severity,
          evidence: evidence ?? "Sin fichajes nativos cerrados en este período",
          anchorDate: null,
          title: "Confirmar registro nativo del worker",
          reason: "El worker aparece en la reconciliación pero no tiene fichajes nativos cerrados; confirmar si trabajó fuera del time clock nativo.",
          module: "attendance",
          ctaLabel: "Abrir Attendance",
          ctaHref: buildAttendanceUrl({ date: ctx.anchorDate ?? null, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
      case "delta_critical_unexplained":
        items.push({
          key, severity, evidence, anchorDate,
          title: "Revisar ajustes externos o de reconciliación",
          reason: "Delta crítico sin causa evidente en los fichajes nativos; revisar ajustes o diferencias externas.",
          module: "review_queue",
          ctaLabel: "Abrir Payroll Review Queue",
          ctaHref: buildReviewQueueUrl({ periodId: ctx.periodId ?? undefined, employeeId: ctx.employeeId ?? undefined }),
        });
        break;
    }
  }

  const rank: Record<Severity, number> = { alta: 0, media: 1, baja: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return items;
}

// ── Best review point ───────────────────────────────────────────────────────

export interface BestReviewPoint {
  module: ReviewModule;
  label: string;
  hint: string;
  /** Optional anchor day (YYYY-MM-DD) tied to the dominant cause. */
  date: string | null;
  /** Dominant cause key that drove this recommendation. */
  dominantCause: CauseKey | null;
  /** Ready-to-use CTA URL with anchor when available. */
  ctaHref: string;
  ctaLabel: string;
}

const DOMINANT_ORDER: CauseKey[] = [
  "open_entries",
  "abnormal_duration",
  "overlap",
  "no_shift_link",
  "midnight_cross",
  "missing_pbp",
  "no_native_entries",
  "delta_critical_unexplained",
];

export function bestReviewPoint(
  causes: CauseKey[],
  anchors: AnchorsByCause = {},
  ctx: RouterCtx = {},
): BestReviewPoint | null {
  if (causes.length === 0) return null;
  const dominant = DOMINANT_ORDER.find((k) => causes.includes(k)) ?? null;
  if (!dominant) return null;

  const a = anchors[dominant] ?? null;
  const date = a?.date ?? ctx.anchorDate ?? null;
  const dateLabel = a?.date ? fmtDayOnly(a.date) : null;

  const causeLabel: Record<CauseKey, string> = {
    open_entries: "fichajes abiertos",
    abnormal_duration: "duración anormal",
    overlap: "entradas solapadas",
    no_shift_link: "entries sin shift",
    midnight_cross: "turnos que cruzan medianoche",
    missing_pbp: "sin reconciliación",
    no_native_entries: "sin fichajes nativos",
    delta_critical_unexplained: "delta crítico sin causa evidente",
  };

  const baseHint = causeLabel[dominant];
  const hint = dateLabel ? `${dateLabel} · ${baseHint}` : baseHint;

  switch (dominant) {
    case "open_entries":
    case "abnormal_duration":
      return {
        module: "timeclock", label: "Time Clock", hint, date,
        dominantCause: dominant,
        ctaLabel: "Abrir Time Clock",
        ctaHref: buildTimeClockUrl({ date, timeEntryId: a?.timeEntryId, shiftId: a?.shiftId }),
      };
    case "overlap":
      return {
        module: "timeclock", label: "Time Clock", hint, date,
        dominantCause: dominant,
        ctaLabel: "Abrir Time Clock",
        ctaHref: buildTimeClockUrl({ date, timeEntryId: a?.timeEntryId }),
      };
    case "no_shift_link":
      return {
        module: "timeclock+shifts", label: "Time Clock + Shifts", hint, date,
        dominantCause: dominant,
        ctaLabel: "Abrir Time Clock",
        ctaHref: buildTimeClockUrl({ date, timeEntryId: a?.timeEntryId }),
      };
    case "midnight_cross":
      return {
        module: "attendance", label: "Attendance", hint, date,
        dominantCause: dominant,
        ctaLabel: "Abrir Attendance",
        ctaHref: buildAttendanceUrl({ date, employeeId: ctx.employeeId ?? undefined, timeEntryId: a?.timeEntryId }),
      };
    case "missing_pbp":
    case "delta_critical_unexplained":
      return {
        module: "review_queue", label: "Payroll Review Queue", hint, date,
        dominantCause: dominant,
        ctaLabel: "Abrir Payroll Review Queue",
        ctaHref: buildReviewQueueUrl({ periodId: ctx.periodId ?? undefined, employeeId: ctx.employeeId ?? undefined }),
      };
    case "no_native_entries":
      return {
        module: "attendance", label: "Attendance / Time Clock", hint, date,
        dominantCause: dominant,
        ctaLabel: "Abrir Attendance",
        ctaHref: buildAttendanceUrl({ date, employeeId: ctx.employeeId ?? undefined }),
      };
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
