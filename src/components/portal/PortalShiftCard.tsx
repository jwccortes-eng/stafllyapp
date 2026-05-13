import {
  Clock, MapPin, CheckCircle2, LogIn, ChevronRight, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";
import { formatDisplayName } from "@/lib/format-helpers";
import { ShiftRouteHeader, type ShiftRouteHeaderTone } from "@/components/stafly-ui";

/** Map ops chip tone → ShiftRouteHeader tone (visual parity preserved). */
function mapStatusTone(tone: OpsStatusTone): ShiftRouteHeaderTone {
  switch (tone) {
    case "success": return "success";
    case "warning": return "warning";
    case "critical": return "danger";
    case "info":
    case "primary": return "info";
    default: return "neutral";
  }
}

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
  meeting_time?: string | null;
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
      return { tone: "warning", label: "Re-confirmar", rail: "bg-warning" };
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
  return format(d, "EEE d MMM", { locale: es });
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
    const showActions =
      (isPending && (onAccept || onReject)) ||
      (isConfirmed && isTodayShift && !!onClockIn);

    const actionsNode = showActions ? (
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
            {shift.status === "needs_reacceptance" ? "Re-confirmar" : "Confirmar"}
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
    ) : null;

    const countdownNode = countdown && isConfirmed ? (
      <div className="flex items-center gap-1.5 mt-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <span className="text-[11px] font-semibold text-primary tracking-wide">
          Empieza {countdown}
        </span>
      </div>
    ) : null;

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
          "group relative w-full text-left cursor-pointer select-none rounded-2xl",
          "transition-all active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isTodayShift && isConfirmed && "ring-1 ring-primary/30",
        )}
      >
        <ShiftRouteHeader
          variant="worker"
          density="compact"
          title={titleDisplay}
          date={shift.date}
          startTime={shift.start_time}
          endTime={shift.end_time}
          clientName={clientDisplay}
          jobSiteName={!shift.meeting_point ? locationDisplay : null}
          meetingPoint={shift.meeting_point ?? null}
          meetingTime={shift.meeting_time ?? null}
          statusLabel={showStatusChip ? meta.label : null}
          statusTone={mapStatusTone(meta.tone)}
          actions={
            <>
              {countdownNode}
              {actionsNode}
            </>
          }
          trailing={
            <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
          }
          className="hover:shadow-md hover:border-border"
        />
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

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className={cn(
              "inline-block text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest",
              isTodayShift ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}>
              {dayLabel(shift.date)}
            </span>
            <div className="mt-2">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/65 leading-none mb-1">
                Entrada
              </p>
              <p className="text-[26px] leading-none font-bold font-mono tabular-nums text-foreground">
                {shift.start_time?.slice(0, 5)}
              </p>
              <p className="text-[10.5px] text-muted-foreground/65 mt-1.5 tabular-nums">
                Termina aprox. {shift.end_time?.slice(0, 5)} · {duration} estimadas
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/25 shrink-0 mt-1" />
        </div>

        <p className="text-[15px] font-bold text-foreground leading-snug line-clamp-2">
          {titleDisplay}
        </p>

        {shift.meeting_point && (
          <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-muted/30 px-2.5 py-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 leading-none mb-0.5">
                Punto de encuentro
              </p>
              <p className="text-[12px] font-semibold text-foreground line-clamp-2 leading-snug">
                {shift.meeting_point}
              </p>
            </div>
            {shift.meeting_time && (
              <div className="shrink-0 text-right">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 leading-none mb-0.5">Hora</p>
                <p className="text-[14px] font-bold font-mono tabular-nums text-foreground leading-none">
                  {shift.meeting_time.slice(0, 5)}
                </p>
              </div>
            )}
          </div>
        )}

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
              {shift.status === "needs_reacceptance" ? "Re-confirmar" : "Confirmar"}
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
