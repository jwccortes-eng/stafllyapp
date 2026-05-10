import {
  Clock, MapPin, CheckCircle2, LogIn, ChevronRight, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";
import { formatDisplayName } from "@/lib/format-helpers";

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
      return { tone: "success", label: "Confirmado", rail: "bg-earning/70" };
    case "needs_reacceptance":
      return { tone: "warning", label: "Re-aceptar", rail: "bg-warning" };
    case "rejected":
      return { tone: "critical", label: "Rechazado", rail: "bg-destructive" };
    case "pending":
    default:
      return { tone: "warning", label: "Pendiente", rail: "bg-warning/80" };
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
  if (hrs > 0) return `en ${hrs}h ${mins}m`;
  return `en ${mins}m`;
}

/** Day label used in compact + full views. */
function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
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
  const isPast = parseISO(shift.date) < new Date(new Date().toDateString());
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isPending = shift.status === "pending" || shift.status === "needs_reacceptance";
  const isConfirmed = shift.status === "confirmed" || shift.status === "accepted";
  const duration = calcDuration(shift.start_time, shift.end_time);
  // Format display strings — convert ALL CAPS to Title Case, replace heavy separators
  const titleDisplay = formatDisplayName(shift.title);
  const clientDisplay = formatDisplayName(shift.client_name);
  const locationDisplay = formatDisplayName(shift.location_name);
  const subtitle = clientDisplay || locationDisplay || null;
  // Hide "Confirmed" badge on past shifts — repetitive noise in History.
  const showStatusChip = !(isPast && isConfirmed);

  // ───────── Compact row — single line, max scannability ─────────
  // Pattern: [rail] · [day chip] · [time] · [title · subtitle] · [chip] · [chevron]
  // Acceptance/clock-in actions shown only when needed, on a second collapsed row.
  if (compact) {
    const dayChip = isTodayShift
      ? "Hoy"
      : isTomorrow(parseISO(shift.date))
      ? "Mañana"
      : format(parseISO(shift.date), "EEE d MMM", { locale: enUS });

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
          "group relative w-full text-left rounded-2xl border border-border/50 bg-card p-4 cursor-pointer select-none",
          "shadow-sm hover:shadow-md hover:border-border transition-all active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isTodayShift && isConfirmed && "border-primary/30",
        )}
      >
        {/* Header: title + status chip */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-tight leading-snug line-clamp-2 text-foreground">
              {titleDisplay}
            </p>
            {clientDisplay && clientDisplay !== titleDisplay && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <span className="truncate">{clientDisplay}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {showStatusChip && <OpsStatusChip tone={meta.tone} label={meta.label} size="sm" />}
            <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>

        {/* Hero time row */}
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xl font-mono font-semibold tabular-nums leading-none text-foreground">
            {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
          </span>
          <span className="text-xs text-muted-foreground/70 tabular-nums">· {duration}</span>
          <span
            className={cn(
              "ml-auto text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0",
              isTodayShift
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {dayChip}
          </span>
        </div>

        {/* Countdown inline (only when starting soon) */}
        {countdown && isConfirmed && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-semibold text-primary tracking-wide">
              Empieza {countdown}
            </span>
          </div>
        )}

        {/* Location */}
        {locationDisplay && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground mb-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
            <span className="line-clamp-2 leading-snug">{locationDisplay}</span>
          </div>
        )}

        {/* Meeting point */}
        {shift.meeting_point && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span className="text-[13px] leading-none mt-0.5">📍</span>
            <span className="line-clamp-2 leading-snug">
              <span className="font-medium text-foreground/80">Punto de encuentro:</span>{" "}
              {shift.meeting_point}
            </span>
          </div>
        )}

        {/* Footer actions */}
        {((isPending && (onAccept || onReject)) || (isConfirmed && isTodayShift && onClockIn)) && (
          <div
            className="mt-3 pt-3 border-t border-border/40 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {isPending && onAccept && (
              <Button
                className="flex-1 h-11 text-sm font-semibold rounded-xl gap-1.5"
                onClick={onAccept}
                disabled={responding}
              >
                <CheckCircle2 className="h-4 w-4" />
                {shift.status === "needs_reacceptance" ? "Aceptar cambios" : "Confirmar"}
              </Button>
            )}
            {isPending && onReject && (
              <Button
                variant="outline"
                className="h-11 px-4 text-sm font-medium rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive/40"
                onClick={onReject}
                disabled={responding}
              >
                Rechazar
              </Button>
            )}
            {isConfirmed && isTodayShift && onClockIn && (
              <Button
                className="flex-1 h-11 text-sm font-semibold rounded-xl gap-1.5 shadow-sm shadow-primary/20"
                onClick={onClockIn}
              >
                <LogIn className="h-4 w-4" />
                Marcar entrada
              </Button>
            )}
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
            Empieza {countdown}
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
          {titleDisplay}
        </p>

        {(locationDisplay || clientDisplay) && (
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground/85 min-w-0">
            {clientDisplay && (
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate">{clientDisplay}</span>
              </span>
            )}
            {clientDisplay && locationDisplay && (
              <span className="text-muted-foreground/30 shrink-0">·</span>
            )}
            {locationDisplay && (
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate">{locationDisplay}</span>
              </span>
            )}
          </div>
        )}

        {showStatusChip && (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <OpsStatusChip tone={meta.tone} label={meta.label} size="sm" />
          </div>
        )}

        {isPending && (onAccept || onReject) && (
          <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              className="flex-1 h-10 text-xs gap-1.5 font-bold rounded-xl"
              onClick={onAccept}
              disabled={responding}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {shift.status === "needs_reacceptance" ? "Aceptar cambios" : "Confirmar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-4 text-xs text-muted-foreground hover:text-destructive rounded-xl"
              onClick={onReject}
              disabled={responding}
            >
              Rechazar
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
              Marcar entrada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
