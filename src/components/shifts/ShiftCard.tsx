import { Badge } from "@/components/ui/badge";
import { Clock, Users, GripVertical, MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Shift } from "./types";
import { getClientColor, formatShiftCode } from "./types";
import type { ShiftCoverageItem } from "@/hooks/useShiftCoverage";

interface ShiftCardProps {
  shift: Shift;
  assignmentCount: number;
  locationName?: string;
  clientName?: string;
  clientIds?: string[];
  onClick: () => void;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  showDate?: boolean;
  coverageStatus?: { percent: number; missing: number; extra: number } | null;
}

type StatusBadge = { label: string; variant: "destructive" | "warning" | "secondary" | "default" | "outline" };

function getStatusBadges(shift: Shift, assignmentCount: number): StatusBadge[] {
  const badges: StatusBadge[] = [];
  const totalSlots = shift.slots ?? 1;

  if (assignmentCount === 0) {
    badges.push({ label: "Sin asignar", variant: "destructive" });
  } else if (assignmentCount < totalSlots) {
    badges.push({ label: `${totalSlots - assignmentCount} vacante${totalSlots - assignmentCount > 1 ? "s" : ""}`, variant: "warning" });
  }

  if (shift.status !== "published" && shift.status !== "locked") {
    badges.push({ label: "Borrador", variant: "secondary" });
  }

  if (shift.status === "locked") {
    badges.push({ label: "Bloqueado", variant: "outline" });
  }

  if (shift.status === "published" && assignmentCount > 0 && badges.length === 0) {
    badges.push({ label: "Listo", variant: "default" });
  }

  return badges;
}

export function ShiftCard({
  shift, assignmentCount, locationName, clientName, clientIds = [], onClick, compact, draggable, onDragStart, showDate, coverageStatus,
}: ShiftCardProps) {
  const color = getClientColor(shift.client_id, clientIds);
  const badges = getStatusBadges(shift, assignmentCount);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/shift-action", e.altKey ? "duplicate" : "move");
    e.dataTransfer.setData("application/shift-data", JSON.stringify({
      shiftId: shift.id, title: shift.title, start_time: shift.start_time,
      end_time: shift.end_time, slots: shift.slots, client_id: shift.client_id,
      location_id: shift.location_id, notes: shift.notes, claimable: shift.claimable, status: shift.status,
    }));
    if (e.altKey) e.dataTransfer.effectAllowed = "copy";
    onDragStart?.(e);
  };

  return (
    <div
      className={cn(
        "cursor-pointer transition-all group border-l-[3px] rounded-xl overflow-hidden bg-white/80 dark:bg-card/80 border border-border/30 shadow-sm hover:shadow-md hover:-translate-y-px",
        color.border,
        draggable && "hover:ring-1 hover:ring-primary/20"
      )}
      draggable={draggable && shift.status !== "locked"}
      onDragStart={handleDragStart}
      onClick={onClick}
    >
      <div className={cn("px-3 py-2.5", compact && "px-2.5 py-2")}>
        <div className="flex items-start gap-1.5">
          {draggable && (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/20 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            {/* Title + code */}
            <div className="flex items-center gap-1.5">
              {shift.shift_code && (
                <span className="text-[9px] font-mono font-semibold text-primary/60 bg-primary/8 rounded-md px-1.5 py-0.5 shrink-0">
                  #{formatShiftCode(shift.shift_code)}
                </span>
              )}
              <p className={cn("font-semibold truncate leading-tight", compact ? "text-[11px]" : "text-xs")}>
                {shift.title}
              </p>
            </div>

            {/* Time + client inline */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
              <span className="flex items-center gap-1 shrink-0">
                <Clock className="h-3 w-3" />
                {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
              </span>
              {clientName && (
                <span className={cn("truncate font-medium", color.text)}>
                  {clientName}
                </span>
              )}
            </div>

            {/* Date (when shown) */}
            {showDate && (
              <p className="text-[9px] text-muted-foreground/60 capitalize">
                {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
              </p>
            )}

            {/* Location */}
            {locationName && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{locationName}</span>
              </div>
            )}

            {/* Footer: slots + badges */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70 tabular-nums">
                <Users className="h-3 w-3" />
                {assignmentCount}/{shift.slots ?? 1}
              </span>
              {badges.map((b, i) => (
                <Badge
                  key={i}
                  variant={b.variant as any}
                  className={cn(
                    "text-[8px] px-1.5 py-0 h-4 font-semibold uppercase tracking-wide leading-none rounded-full",
                    b.variant === "warning" && "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 border-0",
                    b.variant === "destructive" && "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border-0",
                    b.variant === "default" && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border-0",
                    b.variant === "secondary" && "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0",
                  )}
                >
                  {b.label}
                </Badge>
              ))}
              {/* Coverage badge */}
              {coverageStatus && coverageStatus.percent < 100 && (
                <Badge
                  variant="outline"
                  className="text-[8px] px-1.5 py-0 h-4 font-semibold uppercase tracking-wide leading-none rounded-full bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                >
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                  {coverageStatus.missing > 0 ? `${coverageStatus.missing} sin fichar` : `${coverageStatus.percent}%`}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
