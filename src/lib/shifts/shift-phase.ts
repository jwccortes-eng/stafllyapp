/**
 * Shift phase derivation — pure, frontend-only, read-only.
 *
 * Given a shift's `date`, `start_time`, `end_time` and `status`, plus the
 * current wall-clock, return a phase enum + human label used to reorganize
 * the Shift Ops Command Center by operational urgency.
 *
 * This helper does NOT hit the database, does NOT mutate anything and does
 * NOT depend on payroll / time_entries. Sprint 40 UI-only.
 */

export type ShiftPhase =
  | "before"      // more than 60 minutes before start
  | "imminent"    // <= 60 minutes to start
  | "in_progress" // between start and end
  | "after"       // past end, status still active
  | "closed";     // locked / archived / cancelled / completed

export interface ShiftPhaseInfo {
  phase: ShiftPhase;
  /** Short chip label, es-MX friendly (e.g. "Empieza en 12 min"). */
  label: string;
  /** Semantic tone hint for the chip (maps to Badge variant/classes). */
  tone: "muted" | "info" | "warning" | "success" | "danger" | "neutral";
}

const CLOSED_STATUSES = new Set(["locked", "archived", "cancelled", "completed"]);

function toDate(dateISO: string, timeISO: string): Date {
  // date: "YYYY-MM-DD", time: "HH:mm[:ss]"
  const [h, m] = (timeISO ?? "00:00").split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function humanDelta(ms: number): { days: number; hours: number; minutes: number } {
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return { days, hours, minutes };
}

export function getShiftPhase(
  shift: { date: string; start_time: string; end_time: string; status: string },
  now: Date = new Date(),
): ShiftPhaseInfo {
  if (CLOSED_STATUSES.has(shift.status)) {
    return { phase: "closed", label: "Cerrado", tone: "muted" };
  }

  const start = toDate(shift.date, shift.start_time);
  const end = toDate(shift.date, shift.end_time);
  // End before start → overnight shift, roll to next day.
  if (end <= start) end.setDate(end.getDate() + 1);

  const toStart = start.getTime() - now.getTime();
  const toEnd = end.getTime() - now.getTime();

  // In progress
  if (toStart <= 0 && toEnd > 0) {
    const elapsed = humanDelta(now.getTime() - start.getTime());
    const label = elapsed.hours > 0
      ? `En curso · ${elapsed.hours}h ${elapsed.minutes % 60}m`
      : `En curso · ${elapsed.minutes}m`;
    return { phase: "in_progress", label, tone: "success" };
  }

  // After
  if (toEnd <= 0) {
    const past = humanDelta(now.getTime() - end.getTime());
    const label = past.days > 0
      ? `Terminó hace ${past.days}d`
      : past.hours > 0
        ? `Terminó hace ${past.hours}h`
        : `Terminó hace ${past.minutes}m`;
    return { phase: "after", label, tone: "warning" };
  }

  // Before
  const ahead = humanDelta(toStart);
  if (toStart <= 60 * 60 * 1000) {
    return {
      phase: "imminent",
      label: `Empieza en ${ahead.minutes}m`,
      tone: "info",
    };
  }
  const label = ahead.days > 0
    ? `Antes · en ${ahead.days}d`
    : `Antes · en ${ahead.hours}h`;
  return { phase: "before", label, tone: "neutral" };
}

export function phaseChipClasses(tone: ShiftPhaseInfo["tone"]): string {
  switch (tone) {
    case "info":    return "bg-info/10 text-info border-info/20";
    case "warning": return "bg-warning/10 text-warning border-warning/20";
    case "success": return "bg-earning/10 text-earning border-earning/20";
    case "danger":  return "bg-destructive/10 text-destructive border-destructive/20";
    case "muted":   return "bg-muted text-muted-foreground border-border/40";
    default:        return "bg-primary/10 text-primary border-primary/20";
  }
}
