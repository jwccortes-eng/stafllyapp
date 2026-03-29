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
  status: string; // assignment status
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
  return format(d, "EEEE d MMM", { locale: es });
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
          "flex items-center gap-3 px-3.5 py-3 rounded-xl border border-border/30 bg-card/80 cursor-pointer active:scale-[0.98] transition-all",
          isTodayShift && "border-primary/25 bg-primary/[0.03]"
        )}
        onClick={onClick}
      >
        {/* Date pill */}
        <div className="text-center shrink-0 w-10">
          <p className="text-[9px] font-bold uppercase text-muted-foreground/60 leading-none">
            {format(parseISO(shift.date), "MMM", { locale: es })}
          </p>
          <p className="text-base font-bold text-foreground/70 leading-tight">
            {format(parseISO(shift.date), "d")}
          </p>
        </div>
        <div className="h-8 w-px bg-border/30 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{shift.title}</p>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground/70 mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}
            </span>
            {shift.client_name && <span className="truncate">{shift.client_name}</span>}
          </div>
        </div>
        <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", cfg.color.replace("text-", "bg-"))} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card transition-all duration-200 active:scale-[0.98] cursor-pointer overflow-hidden",
        isTodayShift
          ? "border-primary/30 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)] ring-1 ring-primary/10"
          : "border-border/40 shadow-xs"
      )}
      onClick={onClick}
    >
      {/* Countdown banner */}
      {countdown && isConfirmed && (
        <div className="bg-primary/8 px-4 py-1.5 flex items-center gap-2">
          <Timer className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-semibold text-primary">{countdown}</span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Line 1: Relative day + Time */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isTodayShift && (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground uppercase tracking-wider">
                  Hoy
                </span>
              )}
              {isTomorrowShift && (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-accent text-accent-foreground uppercase tracking-wider">
                  Mañana
                </span>
              )}
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
              </span>
              <span className="text-[10px] text-muted-foreground/60 font-medium">{duration}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-0.5" />
        </div>

        {/* Line 2: Title */}
        <p className="text-[15px] font-bold text-foreground leading-snug">{shift.title}</p>

        {/* Line 3: Location + Client */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {shift.location_name && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              <span className="truncate">{shift.location_name}</span>
            </span>
          )}
          {shift.client_name && (
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              <span className="truncate">{shift.client_name}</span>
            </span>
          )}
        </div>

        {/* Line 4: Meeting point */}
        {shift.meeting_point && (
          <div className="flex items-center gap-1.5 text-[11px] text-primary/80 bg-primary/5 rounded-lg px-2.5 py-1.5">
            <Navigation className="h-3 w-3 shrink-0" />
            <span className="truncate font-medium">Punto de encuentro: {shift.meeting_point}</span>
          </div>
        )}

        {/* Date label for non-today */}
        {!isTodayShift && !isTomorrowShift && (
          <p className="text-[11px] text-muted-foreground/60 capitalize">
            {format(parseISO(shift.date), "EEEE d 'de' MMMM", { locale: es })}
          </p>
        )}

        {/* Line 5: Status badge */}
        <div className="flex items-center gap-2">
          <Badge className={cn("text-[10px] px-2.5 py-0.5 font-bold rounded-full border-0", cfg.bg, cfg.color)}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
            <Button size="sm" className="flex-1 h-10 text-xs gap-1.5 font-bold" onClick={onAccept} disabled={responding}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar turno
            </Button>
            <Button variant="outline" size="sm" className="h-10 px-4 text-xs text-destructive hover:text-destructive" onClick={onReject} disabled={responding}>
              Rechazar
            </Button>
          </div>
        )}

        {isConfirmed && isTodayShift && onClockIn && (
          <div onClick={e => e.stopPropagation()}>
            <Button size="sm" className="w-full h-11 text-sm gap-2 font-bold" onClick={onClockIn}>
              <LogIn className="h-4 w-4" />
              Marcar Entrada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
