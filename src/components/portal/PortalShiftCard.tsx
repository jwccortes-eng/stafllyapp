import { Clock, MapPin, Users, CheckCircle2, AlertCircle, XCircle, LogIn, ChevronRight, Navigation, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
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
  confirmed: { label: "Confirmado", icon: CheckCircle2, color: "text-earning", bg: "bg-earning/10" },
  accepted: { label: "Aceptado", icon: CheckCircle2, color: "text-earning", bg: "bg-earning/10" },
  pending: { label: "Pendiente", icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
  rejected: { label: "Rechazado", icon: XCircle, color: "text-deduction", bg: "bg-deduction/10" },
};

function getRelativeDay(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
  return format(d, "EEE d MMM", { locale: es });
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
  if (hrs > 0) return `Empieza en ${hrs}h ${mins}m`;
  return `Empieza en ${mins}m`;
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
          "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border/25 bg-card/80 cursor-pointer active:scale-[0.98] transition-all",
          isTodayShift && "border-primary/20 bg-primary/[0.02]"
        )}
        onClick={onClick}
      >
        <div className="text-center shrink-0 w-8">
          <p className="text-[8px] font-bold uppercase text-muted-foreground/50 leading-none">
            {format(parseISO(shift.date), "MMM", { locale: es })}
          </p>
          <p className="text-sm font-bold text-foreground/70 leading-tight">
            {format(parseISO(shift.date), "d")}
          </p>
        </div>
        <div className="h-7 w-px bg-border/25 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground truncate">{shift.title}</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5">
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
            </span>
            {shift.client_name && <span className="truncate">{shift.client_name}</span>}
          </div>
        </div>
        <div className={cn("h-2 w-2 rounded-full shrink-0", cfg.color.replace("text-", "bg-"))} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-all duration-150 active:scale-[0.98] cursor-pointer overflow-hidden",
        isTodayShift
          ? "border-primary/25 ring-1 ring-primary/8"
          : "border-border/30"
      )}
      onClick={onClick}
    >
      {/* Countdown banner */}
      {countdown && isConfirmed && (
        <div className="bg-primary/6 px-3.5 py-1 flex items-center gap-1.5">
          <Timer className="h-2.5 w-2.5 text-primary" />
          <span className="text-[10px] font-bold text-primary">{countdown}</span>
        </div>
      )}

      <div className="p-3 space-y-2">
        {/* Line 1: Day pills + Time */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {isTodayShift && (
              <span className="text-[8px] px-1.5 py-px rounded-full font-bold bg-primary text-primary-foreground uppercase tracking-wider">
                Hoy
              </span>
            )}
            {isTomorrowShift && (
              <span className="text-[8px] px-1.5 py-px rounded-full font-bold bg-accent text-accent-foreground uppercase tracking-wider">
                Mañana
              </span>
            )}
            {!isTodayShift && !isTomorrowShift && (
              <span className="text-[10px] font-medium text-muted-foreground/70 capitalize">
                {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
              </span>
            )}
            <span className="text-[13px] font-semibold text-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 text-primary" />
              {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
            </span>
            <span className="text-[9px] text-muted-foreground/50 font-medium">{duration}</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
        </div>

        {/* Line 2: Title */}
        <p className="text-sm font-bold text-foreground leading-snug truncate">{shift.title}</p>

        {/* Line 3: Location + Client */}
        {(shift.location_name || shift.client_name) && (
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            {shift.location_name && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0 text-primary/50" />
                {shift.location_name}
              </span>
            )}
            {shift.client_name && (
              <span className="flex items-center gap-1 truncate">
                <Users className="h-3 w-3 shrink-0 text-primary/50" />
                {shift.client_name}
              </span>
            )}
          </div>
        )}

        {/* Meeting point */}
        {shift.meeting_point && (
          <div className="flex items-center gap-1 text-[10px] text-primary/80 bg-primary/[0.04] rounded-md px-2 py-1">
            <Navigation className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate font-medium">{shift.meeting_point}</span>
          </div>
        )}

        {/* Status badge + date */}
        <div className="flex items-center gap-2">
          <Badge className={cn("text-[9px] px-2 py-px font-bold rounded-full border-0", cfg.bg, cfg.color)}>
            <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
            {cfg.label}
          </Badge>
          {!isTodayShift && !isTomorrowShift && (
            <span className="text-[10px] text-muted-foreground/50 capitalize">
              {format(parseISO(shift.date), "d 'de' MMMM", { locale: es })}
            </span>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex items-center gap-1.5 pt-0.5" onClick={e => e.stopPropagation()}>
            <Button size="sm" className="flex-1 h-9 text-[11px] gap-1 font-bold" onClick={onAccept} disabled={responding}>
              <CheckCircle2 className="h-3 w-3" />
              Confirmar
            </Button>
            <Button variant="outline" size="sm" className="h-9 px-3 text-[11px] text-destructive hover:text-destructive" onClick={onReject} disabled={responding}>
              Rechazar
            </Button>
          </div>
        )}

        {isConfirmed && isTodayShift && onClockIn && (
          <div onClick={e => e.stopPropagation()}>
            <Button size="sm" className="w-full h-9 text-xs gap-1.5 font-bold" onClick={onClockIn}>
              <LogIn className="h-3.5 w-3.5" />
              Marcar Entrada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
