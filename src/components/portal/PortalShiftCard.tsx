import {
  Clock, MapPin, CheckCircle2, AlertCircle, XCircle, LogIn, ChevronRight,
  Navigation, Briefcase,
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
  compact?: boolean;
  onClick?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onClockIn?: () => void;
  responding?: boolean;
}

/**
 * Map portal status → unified OpsStatusChip tone + label.
 * Mirrors the language used in admin Shifts/TimeClock for visual coherence.
 */
function getStatusMeta(status: string): { tone: OpsStatusTone; label: string } {
  switch (status) {
    case "confirmed":
    case "accepted":
      return { tone: "success", label: "Confirmed" };
    case "needs_reacceptance":
      return { tone: "warning", label: "Needs Re-accept" };
    case "rejected":
      return { tone: "critical", label: "Rejected" };
    case "pending":
    default:
      return { tone: "warning", label: "Pending" };
  }
}

/** Severity rail tone — mirrors admin ShiftCard pattern. */
function getRailClass(status: string): string {
  switch (status) {
    case "confirmed":
    case "accepted":
      return "bg-earning/60";
    case "needs_reacceptance":
    case "pending":
      return "bg-warning";
    case "rejected":
      return "bg-destructive";
    default:
      return "bg-border";
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

export function PortalShiftCard({
  shift,
  compact = false,
  onClick,
  onAccept,
  onReject,
  onClockIn,
  responding,
}: PortalShiftCardProps) {
  const statusMeta = getStatusMeta(shift.status);
  const railClass = getRailClass(shift.status);
  const isTodayShift = isToday(parseISO(shift.date));
  const isTomorrowShift = isTomorrow(parseISO(shift.date));
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isPending = shift.status === "pending" || shift.status === "needs_reacceptance";
  const isConfirmed = shift.status === "confirmed" || shift.status === "accepted";
  const duration = calcDuration(shift.start_time, shift.end_time);

  // ───────── Compact view — dense list mode ─────────
  if (compact) {
    return (
      <div
        className={cn(
          "group relative flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-card",
          "border border-border/40 transition-all duration-150",
          "active:scale-[0.985] cursor-pointer",
          "hover:border-border/70 hover:shadow-[0_1px_3px_-1px_hsl(var(--foreground)/0.08)]",
        )}
        onClick={onClick}
      >
        {/* Severity rail */}
        <span aria-hidden className={cn("absolute left-0 top-3 bottom-3 w-[1.5px] rounded-r-full opacity-50", railClass)} />

        {/* Date tile */}
        <div className="text-center shrink-0 w-10 -ml-0.5">
          <p className="text-[8px] font-bold uppercase text-muted-foreground/45 leading-none tracking-wider">
            {format(parseISO(shift.date), "MMM", { locale: enUS })}
          </p>
          <p className="text-base font-bold text-foreground/80 leading-tight tabular-nums mt-0.5">
            {format(parseISO(shift.date), "d")}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{shift.title}</p>
          <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground/70 mt-1 min-w-0">
            <span className="flex items-center gap-1 font-medium tabular-nums shrink-0">
              <Clock className="h-2.5 w-2.5" />
              {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
            </span>
            {shift.client_name && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="truncate">{shift.client_name}</span>
              </>
            )}
          </div>
        </div>

        <OpsStatusChip tone={statusMeta.tone} label={statusMeta.label} size="sm" />
      </div>
    );
  }

  // ───────── Full card — premium mobile-first ─────────
  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-card overflow-hidden cursor-pointer",
        "transition-all duration-150 active:scale-[0.99]",
        isTodayShift
          ? "border-primary/25 shadow-[0_2px_12px_-6px_hsl(var(--primary)/0.15)]"
          : "border-border/40 hover:border-border/70",
      )}
      onClick={onClick}
    >
      {/* Severity rail */}
      <span aria-hidden className={cn("absolute left-0 top-4 bottom-4 w-[1.5px] rounded-r-full opacity-60", railClass)} />

      {/* Countdown banner — tight, premium */}
      {countdown && isConfirmed && (
        <div className="bg-primary/[0.05] px-4 py-1.5 flex items-center gap-2 border-b border-primary/10">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-primary tracking-wide uppercase">
            Starts {countdown}
          </span>
        </div>
      )}

      <div className="p-4 space-y-2.5">
        {/* Row 1 — Day chip + Time + Status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isTodayShift ? (
              <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-primary text-primary-foreground uppercase tracking-widest shrink-0">
                Today
              </span>
            ) : isTomorrowShift ? (
              <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-muted text-foreground uppercase tracking-widest shrink-0">
                Tomorrow
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-muted-foreground/80 capitalize shrink-0">
                {format(parseISO(shift.date), "EEE d MMM", { locale: enUS })}
              </span>
            )}
            <span className="text-sm font-bold text-foreground flex items-center gap-1.5 tabular-nums truncate">
              <Clock className="h-3.5 w-3.5 text-primary/70 shrink-0" />
              {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
            </span>
            <span className="text-[10px] text-muted-foreground/50 font-medium tabular-nums shrink-0">
              · {duration}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/25 shrink-0 group-hover:text-muted-foreground/50 transition-colors" />
        </div>

        {/* Row 2 — Title */}
        <p className="text-[15px] font-bold text-foreground leading-snug line-clamp-2">
          {shift.title}
        </p>

        {/* Row 3 — Client · Location (single line, sober) */}
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

        {/* Row 4 — Meeting point (only when present, single sober pill) */}
        {shift.meeting_point && (
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/75 bg-muted/50 rounded-lg px-2.5 py-1.5">
            <Navigation className="h-3 w-3 shrink-0 text-primary/60" />
            <span className="truncate font-medium">{shift.meeting_point}</span>
          </div>
        )}

        {/* Row 5 — Status chip (single, OpsStatusChip language) */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <OpsStatusChip tone={statusMeta.tone} label={statusMeta.label} size="sm" />
          {shift.status === "needs_reacceptance" && (
            <span className="text-[10px] text-warning font-semibold">Modified — re-accept</span>
          )}
        </div>

        {/* Actions: Accept / Reject — single primary, sober secondary */}
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

        {/* Action: Clock In — single primary CTA */}
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
