/**
 * WeekHistorySummary — compact, honest weekly recap above each History bucket.
 *
 * Strict rules (Stage 1 Connecteam/Stafly transition):
 *   - Pure presentational. Consumes only what useWorkedShiftHistory returns.
 *   - NEVER derives hours from scheduled start/end.
 *   - NEVER shows money.
 *   - NEVER reads historical_payroll_entries.
 *   - When no real time_entries exist, says "horas en revisión/importación"
 *     (NOT "0h trabajadas") to avoid implying the worker did not work.
 */
import { cn } from "@/lib/utils";
import type { WorkerShiftStatus } from "@/hooks/useWorkedShiftHistory";

interface WorkedSlice {
  hasClosedTimeEntry: boolean;
  workedMinutes: number;
  workerStatus: WorkerShiftStatus;
}

interface Props {
  total: number;
  slices: WorkedSlice[];
  className?: string;
}

function fmtDuration(min: number) {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DOMINANT_LABEL: Partial<Record<WorkerShiftStatus, string>> = {
  paid: "Pagado",
  published: "Disponible en reporte",
  in_review: "En revisión",
  pending_validation: "Pendiente",
  no_period_yet: "Pendiente",
};

const DOMINANT_TONE: Partial<Record<WorkerShiftStatus, string>> = {
  paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  published: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/30",
  in_review: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/30",
  pending_validation: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
  no_period_yet: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
};

function pickDominant(slices: WorkedSlice[]): WorkerShiftStatus | null {
  if (slices.length === 0) return null;
  // Priority order — paid/published win over pending if tied.
  const priority: WorkerShiftStatus[] = [
    "paid",
    "published",
    "in_review",
    "pending_validation",
    "no_period_yet",
  ];
  const counts = new Map<WorkerShiftStatus, number>();
  for (const s of slices) counts.set(s.workerStatus, (counts.get(s.workerStatus) ?? 0) + 1);
  let best: WorkerShiftStatus | null = null;
  let bestCount = 0;
  for (const st of priority) {
    const c = counts.get(st) ?? 0;
    if (c > bestCount) {
      best = st;
      bestCount = c;
    }
  }
  return best;
}

export function WeekHistorySummary({ total, slices, className }: Props) {
  if (total === 0) return null;

  const withHours = slices.filter((s) => s.hasClosedTimeEntry);
  const withoutHours = slices.length - withHours.length;
  const totalMinutes = withHours.reduce((acc, s) => acc + (s.workedMinutes || 0), 0);

  const turnosCopy = `${total} turno${total === 1 ? "" : "s"}`;

  let summary: string;
  if (withHours.length > 0 && withoutHours === 0) {
    // All shifts have native Stafly hours.
    summary = `${turnosCopy} · ${fmtDuration(totalMinutes)} en Stafly`;
  } else if (withHours.length > 0 && withoutHours > 0) {
    // Mixed — be explicit about both sides.
    summary = `${turnosCopy} · ${fmtDuration(totalMinutes)} en Stafly · ${withoutHours} en revisión/importación`;
  } else {
    // No native hours at all — Stage 1 honest copy.
    summary = `${turnosCopy} · horas en revisión/importación`;
  }

  const dominant = pickDominant(slices);
  const dominantLabel = dominant ? DOMINANT_LABEL[dominant] : null;
  const dominantTone = dominant ? DOMINANT_TONE[dominant] : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 rounded-xl",
        "bg-muted/40 border border-border/40",
        className,
      )}
    >
      <p className="text-[11.5px] font-semibold text-foreground/85 leading-snug truncate">
        {summary}
      </p>
      {dominantLabel && dominantTone && (
        <span
          className={cn(
            "inline-flex items-center text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0",
            dominantTone,
          )}
        >
          {dominantLabel}
        </span>
      )}
    </div>
  );
}
