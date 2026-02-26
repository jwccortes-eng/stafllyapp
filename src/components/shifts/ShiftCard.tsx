import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, GripVertical, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { Shift } from "./types";
import { getClientColor } from "./types";

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

function isToday(dateStr: string) {
  const today = new Date();
  const d = parseISO(dateStr);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

type StatusBadge = { label: string; variant: "destructive" | "warning" | "secondary" | "default" | "outline" };

function getStatusBadges(shift: Shift, assignmentCount: number): StatusBadge[] {
  const badges: StatusBadge[] = [];
  const totalSlots = shift.slots ?? 1;

  if (assignmentCount === 0) {
    badges.push({ label: "Unassigned", variant: "destructive" });
  } else if (assignmentCount < totalSlots) {
    badges.push({ label: `${totalSlots - assignmentCount} open`, variant: "warning" });
  }

  if (shift.status !== "published") {
    badges.push({ label: "Unpublished", variant: "secondary" });
  }

  // Check for unconfirmed (pending) assignments — would need assignment statuses
  // For now we show "published" as confirmed
  if (shift.status === "published" && assignmentCount > 0 && badges.length === 0) {
    badges.push({ label: "Confirmed", variant: "default" });
  }

  return badges;
}

export function ShiftCard({
  shift, assignmentCount, locationName, clientName, clientIds = [], onClick, compact, draggable, onDragStart, showDate,
}: ShiftCardProps) {
  const color = getClientColor(shift.client_id, clientIds);
  const badges = getStatusBadges(shift, assignmentCount);

  const handleDragStart = (e: React.DragEvent) => {
    // Store whether Alt key is held for duplicate mode
    e.dataTransfer.setData("application/shift-action", e.altKey ? "duplicate" : "move");
    e.dataTransfer.setData("application/shift-data", JSON.stringify({
      shiftId: shift.id,
      title: shift.title,
      start_time: shift.start_time,
      end_time: shift.end_time,
      slots: shift.slots,
      client_id: shift.client_id,
      location_id: shift.location_id,
      notes: shift.notes,
      claimable: shift.claimable,
      status: shift.status,
    }));
    if (e.altKey) {
      e.dataTransfer.effectAllowed = "copy";
    }
    onDragStart?.(e);
  };

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-all group border-l-[4px] overflow-hidden",
        color.border,
        color.bg,
        draggable && "hover:ring-1 hover:ring-primary/30"
      )}
      draggable={draggable}
      onDragStart={handleDragStart}
      onClick={onClick}
    >
      <CardContent className={cn("p-2.5", compact && "p-1.5")}>
        <div className="flex items-start gap-1.5">
          {draggable && (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            {/* Title row */}
            <p className={cn("font-semibold truncate leading-tight", compact ? "text-[10px]" : "text-xs")}>
              {shift.title}
            </p>

            {/* Client name */}
            {clientName && (
              <p className={cn("text-[10px] font-medium truncate", color.text)}>
                {clientName}
              </p>
            )}

            {/* Date (when shown) */}
            {showDate && (
              <p className="text-[10px] text-muted-foreground capitalize">
                {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
              </p>
            )}

            {/* Time */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}</span>
            </div>

            {/* Location */}
            {locationName && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{locationName}</span>
              </div>
            )}

            {/* Footer: slots + badges */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{assignmentCount}/{shift.slots ?? 1}</span>
              </div>
              {badges.map((b, i) => (
                <Badge
                  key={i}
                  variant={b.variant as any}
                  className={cn(
                    "text-[8px] px-1.5 py-0 h-4 font-semibold uppercase tracking-wide",
                    b.variant === "warning" && "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
                    b.variant === "destructive" && "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
                    b.variant === "default" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                  )}
                >
                  {b.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
