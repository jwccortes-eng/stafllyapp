import {
  Clock, MapPin, CheckCircle2, LogIn, ChevronRight, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";

export interface PortalShiftData {
  id: string;
  assignmentId?: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  location_name?: string | null;
  client_name?: string | null;
  meeting_point?: string | null;
  notes?: string | null;
}

interface PortalShiftCardProps {
  shift: PortalShiftData;
  /** Compact = dense list row (default for MyShifts). Full = detail-rich card. */
  compact?: boolean;
  onClick?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onClockIn?: () => void;
  responding?: boolean;
}

/** Status → unified chip + rail tone. Mirrors admin Shifts/Time Clock language. */
function getStatusMeta(status: string): { tone: OpsStatusTone; label: string; rail: string } {
  switch (status) {
    case "confirmed":
    case "accepted":
      return { tone: "success", label: "Confirmed", rail: "bg-earning/70" };
    case "needs_reacceptance":
      return { tone: "warning", label: "Re-accept", rail: "bg-warning" };
    case "rejected":
      return { tone: "critical", label: "Rejected", rail: "bg-destructive" };
    case "pending":
    default:
      return { tone: "warning", label: "Pending", rail: "bg-warning/80" };
  }
}

function calcDuration(start: string, end: string): string {
  const s = new Date(`2000-01-01T${start}`);
  let e = new Date(`2000-01-01T${end}`);
  if (e <= s) e = new Date(e.getTime() + 86400000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getCountdown(dateStr: string, startTime: string): string | null {
  const now = new Date();
  const [h, m] = startTime.split(":").map(Number);
  const shiftStart = parseISO(dateStr);
  shiftStart.setHours(h, m, 0, 0);
  const diff = shiftStart.getTime() - now.getTime();
  if (diff < 0 || diff > 24 * 60 * 60 * 1000) return null;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `in ${hrs}h ${mins}m`;
  return `in ${mins}m`;
}

/** Day label used in compact + full views. */
function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE d MMM", { locale: enUS });
}

export function PortalShiftCard({
  shift,
  compact = false,
  onClick,
  onAccept,
  onReject,
  onClockIn,
  responding,
}: PortalShiftCardProps) {
  const meta = getStatusMeta(shift.status);
  const isTodayShift = isToday(parseISO(shift.date));
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isPending = shift.status === "pending" || shift.status === "needs_reacceptance";
  const isConfirmed = shift.status === "confirmed" || shift.status === "accepted";
  const duration = calcDuration(shift.start_time, shift.end_time);
  const subtitle = shift.client_name ?? shift.location_name ?? null;

  // ───────── Compact row — single line, max scannability ─────────
  // Pattern: [rail] · [day chip] · [time] · [title · subtitle] · [chip] · [chevron]
  // Acceptance/clock-in actions shown only when needed, on a second collapsed row.
  if (compact) {
    return (
      <div
        className={cn(
          "group relative bg-card rounded-xl border border-border/40 overflow-hidden",
          "transition-colors duration-150 active:bg-muted/30 cursor-pointer",
          isTodayShift && isConfirmed && "border-primary/25",
        )}
        onClick={onClick}
      >
        {/* Severity rail — flush left, full height */}
        <span aria-hidden className={cn("absolute left-0 top-0 bottom-0 w-[2px]", meta.rail)} />

        {/* Primary row */}
        <div className="flex items-center gap-3 pl-3.5 pr-3 py-2.5">
          {/* Day + time block — fixed width for column alignment */}
          <div className="shrink-0 w-[58px]">
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-wider leading-none",
              isTodayShift ? "text-primary" : "text-muted-foreground/55",
            )}>
              {isTodayShift ? "Today" : isTomorrow(parseISO(shift.date)) ? "Tomr" : format(parseISO(shift.date), "EEE", { locale: enUS })}
            </p>
            <p className="text-[13px] font-bold text-foreground/90 tabular-nums leading-tight mt-1">
              {shift.start_time?.slice(0, 5)}
            </p>
          </div>

          {/* Title + subtitle */}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-foreground truncate leading-tight">
              {shift.title}
            </p>
            <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
              <span className="tabular-nums">{shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}</span>
              {subtitle && <> · {subtitle}</>}
            </p>
          </div>

          {/* Status chip + chevron */}
          <div className="flex items-center gap-1.5 shrink-0">
            <OpsStatusChip tone={meta.tone} label={meta.label} size="sm" />
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          </div>
        </div>

        {/* Inline actions — only shown when explicit response or clock-in is required */}
        {(isPending && (onAccept || onReject)) && (
          <div
            className="flex items-center gap-2 px-3.5 pb-2.5 pt-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              className="flex-1 h-9 text-[12px] font-semibold rounded-lg gap-1.5"
              onClick={onAccept}
              disabled={responding}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {shift.status === "needs_reacceptance" ? "Accept changes" : "Confirm"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-[12px] text-muted-foreground hover:text-destructive rounded-lg"
              onClick={onReject}
              disabled={responding}
            >
              Decline
            </Button>
          </div>
        )}

        {isConfirmed && isTodayShift && onClockIn && (
          <div className="px-3.5 pb-2.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="w-full h-9 text-[12px] font-semibold rounded-lg gap-1.5 shadow-sm shadow-primary/15"
              onClick={onClockIn}
            >
              <LogIn className="h-3.5 w-3.5" />
              Clock In{countdown && ` · starts ${countdown}`}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ───────── Full card — used in detail / hero contexts ─────────
  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-card overflow-hidden cursor-pointer",
        "transition-all duration-150 active:scale-[0.99]",
        isTodayShift
          ? "border-primary/25 shadow-[0_2px_12px_-6px_hsl(var(--primary)/0.15)]"
          : "border-border/40",
      )}
      onClick={onClick}
    >
      <span aria-hidden className={cn("absolute left-0 top-4 bottom-4 w-[1.5px] rounded-r-full opacity-60", meta.rail)} />

      {countdown && isConfirmed && (
        <div className="bg-primary/[0.05] px-4 py-1.5 flex items-center gap-2 border-b border-primary/10">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-primary tracking-wide uppercase">
            Starts {countdown}
          </span>
        </div>
      )}

      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest shrink-0",
              isTodayShift ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}>
              {dayLabel(shift.date)}
            </span>
            <span className="text-sm font-bold text-foreground flex items-center gap-1.5 tabular-nums truncate">
              <Clock className="h-3.5 w-3.5 text-primary/70 shrink-0" />
              {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
            </span>
            <span className="text-[10px] text-muted-foreground/50 font-medium tabular-nums shrink-0">
              · {duration}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/25 shrink-0" />
        </div>

        <p className="text-[15px] font-bold text-foreground leading-snug line-clamp-2">
          {shift.title}
        </p>

        {(shift.location_name || shift.client_name) && (
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground/85 min-w-0">
            {shift.client_name && (
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate">{shift.client_name}</span>
              </span>
            )}
            {shift.client_name && shift.location_name && (
              <span className="text-muted-foreground/30 shrink-0">·</span>
            )}
            {shift.location_name && (
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate">{shift.location_name}</span>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <OpsStatusChip tone={meta.tone} label={meta.label} size="sm" />
        </div>

        {isPending && (onAccept || onReject) && (
          <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              className="flex-1 h-10 text-xs gap-1.5 font-bold rounded-xl"
              onClick={onAccept}
              disabled={responding}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {shift.status === "needs_reacceptance" ? "Accept changes" : "Confirm"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-4 text-xs text-muted-foreground hover:text-destructive rounded-xl"
              onClick={onReject}
              disabled={responding}
            >
              Decline
            </Button>
          </div>
        )}

        {isConfirmed && isTodayShift && onClockIn && (
          <div className="pt-1" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              className="w-full h-10 text-xs gap-2 font-bold rounded-xl shadow-md shadow-primary/15"
              onClick={onClockIn}
            >
              <LogIn className="h-3.5 w-3.5" />
              Clock In
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
