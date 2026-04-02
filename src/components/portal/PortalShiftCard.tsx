import { Clock, MapPin, Users, CheckCircle2, AlertCircle, XCircle, LogIn, ChevronRight, Navigation, Timer, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";

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

const STATUS_MAP: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  confirmed: { label: "Confirmado", icon: CheckCircle2, color: "text-[hsl(var(--status-confirmed))]", bg: "bg-[hsl(var(--status-confirmed)/0.08)]" },
  accepted: { label: "Aceptado", icon: CheckCircle2, color: "text-[hsl(var(--status-confirmed))]", bg: "bg-[hsl(var(--status-confirmed)/0.08)]" },
  pending: { label: "Pendiente", icon: AlertCircle, color: "text-[hsl(var(--status-pending))]", bg: "bg-[hsl(var(--status-pending)/0.08)]" },
  rejected: { label: "Rechazado", icon: XCircle, color: "text-[hsl(var(--status-cancelled))]", bg: "bg-[hsl(var(--status-cancelled)/0.08)]" },
};

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

export function PortalShiftCard({
  shift,
  compact = false,
  onClick,
  onAccept,
  onReject,
  onClockIn,
  responding,
}: PortalShiftCardProps) {
  const cfg = STATUS_MAP[shift.status] || STATUS_MAP.pending;
  const StatusIcon = cfg.icon;
  const isTodayShift = isToday(parseISO(shift.date));
  const isTomorrowShift = isTomorrow(parseISO(shift.date));
  const countdown = isTodayShift ? getCountdown(shift.date, shift.start_time) : null;
  const isPending = shift.status === "pending";
  const isConfirmed = shift.status === "confirmed" || shift.status === "accepted";
  const duration = calcDuration(shift.start_time, shift.end_time);

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-card border shadow-sm cursor-pointer active:scale-[0.98] transition-all",
          isTodayShift ? "border-primary/15" : "border-border/30"
        )}
        onClick={onClick}
      >
        <div className="text-center shrink-0 w-10">
          <p className="text-[8px] font-bold uppercase text-muted-foreground/40 leading-none">
            {format(parseISO(shift.date), "MMM", { locale: es })}
          </p>
          <p className="text-base font-bold text-foreground/70 leading-tight">
            {format(parseISO(shift.date), "d")}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate">{shift.title}</p>
          <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground/60 mt-0.5">
            <span className="flex items-center gap-0.5 font-medium">
              <Clock className="h-2.5 w-2.5" />
              {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
            </span>
            {shift.client_name && <span className="truncate">{shift.client_name}</span>}
          </div>
        </div>
        <div className={cn("flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full", cfg.bg, cfg.color)}>
          <StatusIcon className="h-2.5 w-2.5" />
          {cfg.label}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card shadow-sm transition-all duration-150 active:scale-[0.98] cursor-pointer overflow-hidden",
        isTodayShift
          ? "border-primary/20 shadow-[0_2px_16px_-6px_hsl(var(--primary)/0.12)]"
          : "border-border/30"
      )}
      onClick={onClick}
    >
      {/* Countdown banner */}
      {countdown && isConfirmed && (
        <div className="bg-primary/[0.05] px-4 py-1.5 flex items-center gap-2 border-b border-primary/10">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-bold text-primary">Empieza {countdown}</span>
        </div>
      )}

      <div className="p-4 space-y-2.5">
        {/* Line 1: Day label + Time + Duration */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {isTodayShift && (
              <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground uppercase tracking-widest">
                Hoy
              </span>
            )}
            {isTomorrowShift && (
              <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold bg-accent text-accent-foreground uppercase tracking-widest">
                Mañana
              </span>
            )}
            {!isTodayShift && !isTomorrowShift && (
              <span className="text-[11px] font-semibold text-muted-foreground capitalize">
                {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
              </span>
            )}
            <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground/40 font-medium">{duration}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/20" />
          </div>
        </div>

        {/* Line 2: Title */}
        <p className="text-[15px] font-bold text-foreground leading-snug truncate">{shift.title}</p>

        {/* Line 3: Location + Client */}
        {(shift.location_name || shift.client_name) && (
          <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
            {shift.location_name && (
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="h-3 w-3 shrink-0 text-primary/40" />
                {shift.location_name}
              </span>
            )}
            {shift.client_name && (
              <span className="flex items-center gap-1.5 truncate">
                <Briefcase className="h-3 w-3 shrink-0 text-primary/40" />
                {shift.client_name}
              </span>
            )}
          </div>
        )}

        {/* Meeting point */}
        {shift.meeting_point && (
          <div className="flex items-center gap-1.5 text-[11px] text-primary/80 bg-primary/[0.04] rounded-xl px-3 py-2">
            <Navigation className="h-3 w-3 shrink-0" />
            <span className="truncate font-medium">{shift.meeting_point}</span>
          </div>
        )}

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full", cfg.bg, cfg.color)}>
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </div>
          {!isTodayShift && !isTomorrowShift && (
            <span className="text-[10px] text-muted-foreground/40 capitalize">
              {format(parseISO(shift.date), "d 'de' MMMM", { locale: es })}
            </span>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
            <Button size="sm" className="flex-1 h-10 text-xs gap-1.5 font-bold rounded-xl" onClick={onAccept} disabled={responding}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar
            </Button>
            <Button variant="outline" size="sm" className="h-10 px-4 text-xs text-destructive hover:text-destructive rounded-xl" onClick={onReject} disabled={responding}>
              Rechazar
            </Button>
          </div>
        )}

        {isConfirmed && isTodayShift && onClockIn && (
          <div onClick={e => e.stopPropagation()}>
            <Button size="sm" className="w-full h-10 text-xs gap-2 font-bold rounded-xl shadow-lg shadow-primary/15" onClick={onClockIn}>
              <LogIn className="h-3.5 w-3.5" />
              Marcar Entrada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
