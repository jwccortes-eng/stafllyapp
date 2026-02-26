import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Shift } from "./types";

interface ShiftCardProps {
  shift: Shift;
  assignmentCount: number;
  locationName?: string;
  onClick: () => void;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  showDate?: boolean;
}

export function ShiftCard({
  shift, assignmentCount, locationName, onClick, compact, draggable, onDragStart, showDate,
}: ShiftCardProps) {
  const statusLabel = shift.status === "published" ? "publicado" : shift.status === "draft" ? "borrador" : shift.status;

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-all group border-border/40",
        draggable && "hover:ring-1 hover:ring-primary/30"
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
    >
      <CardContent className={cn("p-2", compact && "p-1.5")}>
        <div className="flex items-start gap-1">
          {draggable && (
            <GripVertical className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold truncate", compact ? "text-[10px]" : "text-xs")}>
              {shift.title}
            </p>
            {showDate && (
              <p className="text-[10px] text-muted-foreground capitalize">
                {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
              </p>
            )}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3 shrink-0" />
              {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
            </div>
            {locationName && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                📍 {locationName}
              </p>
            )}
            <div className="flex items-center gap-1 mt-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px]">{assignmentCount}/{shift.slots ?? 1}</span>
              <Badge
                variant={shift.status === "published" ? "default" : "secondary"}
                className="text-[9px] px-1 py-0 ml-auto"
              >
                {statusLabel}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
