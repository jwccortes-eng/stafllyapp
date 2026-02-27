import { Badge } from "@/components/ui/badge";
import { Clock, Users, GripVertical, MapPin, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Shift } from "./types";
import { getClientColor, formatShiftCode } from "./types";

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

  if (shift.status !== "published") {
    badges.push({ label: "Borrador", variant: "secondary" });
  }

  if (shift.status === "published" && assignmentCount > 0 && badges.length === 0) {
    badges.push({ label: "Listo", variant: "default" });
  }

  return badges;
}

export function ShiftCard({
  shift, assignmentCount, locationName, clientName, clientIds = [], onClick, compact, draggable, onDragStart, showDate,
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
        "cursor-pointer hover:shadow-md transition-all group border-l-[3px] rounded-lg overflow-hidden bg-card/80 backdrop-blur-sm border border-border/40",
        color.border,
        draggable && "hover:ring-1 hover:ring-primary/30"
      )}
      draggable={draggable}
      onDragStart={handleDragStart}
      onClick={onClick}
    >
      <div className={cn("px-2.5 py-2", compact && "px-2 py-1.5")}>
        <div className="flex items-start gap-1.5">
          {draggable && (
            <GripVertical className="h-3 w-3 text-muted-foreground/30 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            {/* Title + code */}
            <div className="flex items-center gap-1.5">
              {shift.shift_code && (
                <span className="text-[9px] font-mono font-bold text-primary/70 bg-primary/8 rounded px-1 py-px shrink-0">
                  #{formatShiftCode(shift.shift_code)}
                </span>
              )}
              <p className={cn("font-semibold truncate leading-tight", compact ? "text-[10px]" : "text-[11px]")}>
                {shift.title}
              </p>
            </div>

            {/* Time + client inline */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5 shrink-0">
                <Clock className="h-2.5 w-2.5" />
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
              <p className="text-[9px] text-muted-foreground/70 capitalize">
                {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
              </p>
            )}

            {/* Location */}
            {locationName && (
              <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground/70">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{locationName}</span>
              </div>
            )}

            {/* Footer: slots + badges */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground tabular-nums">
                <Users className="h-2.5 w-2.5" />
                {assignmentCount}/{shift.slots ?? 1}
              </span>
              {badges.map((b, i) => (
                <Badge
                  key={i}
                  variant={b.variant as any}
                  className={cn(
                    "text-[7px] px-1 py-0 h-3.5 font-bold uppercase tracking-wider leading-none",
                    b.variant === "warning" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0",
                    b.variant === "destructive" && "bg-red-500/15 text-red-600 dark:text-red-400 border-0",
                    b.variant === "default" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0",
                    b.variant === "secondary" && "bg-muted/60 text-muted-foreground border-0",
                  )}
                >
                  {b.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
