import {
  CheckCircle2, LogIn, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseISO, isToday } from "date-fns";
import { type OpsStatusTone } from "@/components/operations/OpsStatusChip";
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
      return { tone: "warning", label: "Re-accept", rail: "bg-warning" };
    case "rejected":
      return { tone: "critical", label: "Rechazado", rail: "bg-destructive" };
    case "pending":
    default:
      return { tone: "warning", label: "Pendiente", rail: "bg-warning/80" };
  }
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
  // Format display strings — convert ALL CAPS to Title Case, replace heavy separators
  const titleDisplay = formatDisplayName(shift.title);
  const clientDisplay = formatDisplayName(shift.client_name);
  const locationDisplay = formatDisplayName(shift.location_name);
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
            {shift.status === "needs_reacceptance" ? "Re-accept" : "Accept"}
          </Button>
        )}
        {isPending && onReject && (
          <Button
            variant="outline"
            className="h-11 px-4 text-sm font-medium rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive/40"
            onClick={onReject}
            disabled={responding}
          >
            Decline
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
  // DS3.2: identity region (date · Entrada · Termina aprox. · meeting point ·
  // cliente · título · status chip) is delegated to <ShiftRouteHeader />.
  // Outer chrome (rail overlay, countdown banner, action buttons) is preserved.
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
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-4 bottom-4 w-[1.5px] rounded-r-full opacity-60 z-10",
          meta.rail,
        )}
      />

      {countdown && isConfirmed && (
        <div className="bg-primary/[0.05] px-4 py-1.5 flex items-center gap-2 border-b border-primary/10">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-primary tracking-wide uppercase">
            Empieza {countdown}
          </span>
        </div>
      )}

      <ShiftRouteHeader
        variant="worker"
        density="compact"
        title={titleDisplay}
        date={shift.date}
        startTime={shift.start_time}
        endTime={shift.end_time}
        clientName={clientDisplay}
        jobSiteName={locationDisplay}
        meetingPoint={shift.meeting_point ?? null}
        meetingTime={shift.meeting_time ?? null}
        statusLabel={showStatusChip ? meta.label : null}
        statusTone={mapStatusTone(meta.tone)}
        trailing={
          <ChevronRight className="h-4 w-4 text-muted-foreground/25 shrink-0" />
        }
        className="border-0 bg-transparent shadow-none rounded-none"
      />

      {isPending && (onAccept || onReject) && (
        <div
          className="flex items-center gap-2 px-4 pb-4"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            className="flex-1 h-10 text-xs gap-1.5 font-bold rounded-xl"
            onClick={onAccept}
            disabled={responding}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {shift.status === "needs_reacceptance" ? "Re-accept" : "Accept"}
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
        <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
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
  );
}
