/**
 * HistoryShiftRow — past-shift card for /portal/shifts > Historial.
 * Presentational only. Consumes data normalized by useWorkedShiftHistory.
 *
 * Visual standard:
 *   - Real worked time is the protagonist (mono, large) WHEN it exists.
 *   - Scheduled start/end appear as "Programado: ..." muted, secondary.
 *   - A single status pill summarizes pay-period state.
 *   - We NEVER render scheduled hours as worked time.
 */
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import { Car, ChevronRight, Clock } from "lucide-react";
import { WORKER_STATUS_LABEL_ES, type WorkerShiftStatus } from "@/hooks/useWorkedShiftHistory";

interface Props {
  shiftId: string;
  date: string;
  title: string;
  subtitle?: string | null;
  scheduledStart?: string | null; // "HH:mm" or "HH:mm:ss"
  scheduledEnd?: string | null;
  // Real worked data — all optional.
  clockIn?: string | null;        // ISO timestamp
  clockOut?: string | null;       // ISO timestamp
  workedMinutes?: number;
  hasOpenClock?: boolean;
  hasClosedTimeEntry?: boolean;
  workerStatus: WorkerShiftStatus;
  hasRide?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

function dateLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
  return format(d, "EEE d MMM", { locale: es });
}

function fmtHHmm(t?: string | null) {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function fmtClock(iso?: string | null) {
  if (!iso) return null;
  try {
    return format(new Date(iso), "HH:mm");
  } catch {
    return null;
  }
}

function fmtDuration(min: number) {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_TONE: Record<WorkerShiftStatus, string> = {
  paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  published: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/30",
  in_review: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/30",
  pending_validation: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
  open_clock: "bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/30",
  no_hours: "bg-muted text-muted-foreground border-border/50",
  no_period_yet: "bg-muted text-muted-foreground border-border/50",
};

export function HistoryShiftRow({
  date,
  title,
  subtitle,
  scheduledStart,
  scheduledEnd,
  clockIn,
  clockOut,
  workedMinutes = 0,
  hasOpenClock = false,
  hasClosedTimeEntry = false,
  workerStatus,
  hasRide = false,
  loading = false,
  onClick,
  className,
}: Props) {
  const ci = fmtClock(clockIn);
  const co = fmtClock(clockOut);
  const sched = scheduledStart
    ? `Programado: entrada ${fmtHHmm(scheduledStart)}${scheduledEnd ? ` · termina aprox. ${fmtHHmm(scheduledEnd)}` : ""}`
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full text-left rounded-2xl border border-border/40 bg-card",
        "transition-all duration-200 active:scale-[0.985] hover:border-border/70",
        "px-3.5 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Date + title */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
              {dateLabel(date)}
            </span>
            {hasRide && (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/25">
                <Car className="h-2.5 w-2.5" />
                Ride
              </span>
            )}
          </div>
          <p className="text-[14px] font-bold text-foreground truncate">{title}</p>
          {subtitle && (
            <p className="text-[11.5px] text-muted-foreground/80 truncate mt-0.5">{subtitle}</p>
          )}

          {/* Real worked block — protagonist when closed entries exist */}
          {hasClosedTimeEntry ? (
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                Trabajado
              </span>
              <span className="text-[18px] font-bold font-mono tabular-nums text-foreground leading-none">
                {fmtDuration(workedMinutes)}
              </span>
              {ci && co && (
                <span className="text-[11px] text-muted-foreground/80 font-mono tabular-nums truncate">
                  · {ci} → {co}
                </span>
              )}
            </div>
          ) : hasOpenClock ? (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-rose-700 dark:text-rose-400 font-semibold">
              <Clock className="h-3.5 w-3.5" />
              Reloj sin cerrar{ci ? ` desde ${ci}` : ""}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-[12px] text-muted-foreground/85 font-medium">
                {loading ? "Cargando…" : "Sin horas en Stafly todavía"}
              </p>
              {!loading && (
                <p className="text-[10.5px] text-muted-foreground/65 italic mt-0.5">
                  Puede estar en revisión o venir de Connecteam.
                </p>
              )}
            </div>
          )}

          {/* Scheduled — secondary muted */}
          {sched && (
            <p className="mt-1 text-[10.5px] text-muted-foreground/55 truncate">{sched}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className={cn(
              "inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap",
              STATUS_TONE[workerStatus],
            )}
          >
            {WORKER_STATUS_LABEL_ES[workerStatus]}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
      </div>
    </button>
  );
}
