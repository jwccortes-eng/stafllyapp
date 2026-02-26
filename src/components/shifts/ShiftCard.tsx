import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, GripVertical, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
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

type AlertLevel = "red" | "yellow" | "green";

function getShiftAlert(shift: Shift, assignmentCount: number): { level: AlertLevel; label: string } {
  const totalSlots = shift.slots ?? 1;
  const pastDate = isPast(startOfDay(parseISO(shift.date))) && !isToday(shift.date);
  const noAssignments = assignmentCount === 0;
  const partialFill = assignmentCount > 0 && assignmentCount < totalSlots;
  const isDraft = shift.status !== "published";

  // 🔴 Critical: past + not published, or no employees assigned
  if ((pastDate && isDraft) || noAssignments) {
    const reasons: string[] = [];
    if (noAssignments) reasons.push("sin empleados");
    if (pastDate && isDraft) reasons.push("fecha pasada sin publicar");
    return { level: "red", label: reasons.join(", ") };
  }

  // 🟡 Warning: partially filled or still draft
  if (partialFill || isDraft) {
    const reasons: string[] = [];
    if (partialFill) reasons.push(`${totalSlots - assignmentCount} plaza${totalSlots - assignmentCount > 1 ? "s" : ""} vacía${totalSlots - assignmentCount > 1 ? "s" : ""}`);
    if (isDraft) reasons.push("borrador");
    return { level: "yellow", label: reasons.join(", ") };
  }

  // 🟢 Good
  return { level: "green", label: "completo" };
}

function isToday(dateStr: string) {
  const today = new Date();
  const d = parseISO(dateStr);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

const alertStyles: Record<AlertLevel, { dot: string; border: string }> = {
  red: { dot: "bg-red-500", border: "border-l-red-500/60" },
  yellow: { dot: "bg-amber-400", border: "border-l-amber-400/60" },
  green: { dot: "bg-emerald-500", border: "border-l-emerald-500/60" },
};

export function ShiftCard({
  shift, assignmentCount, locationName, onClick, compact, draggable, onDragStart, showDate,
}: ShiftCardProps) {
  const statusLabel = shift.status === "published" ? "publicado" : shift.status === "draft" ? "borrador" : shift.status;
  const alert = getShiftAlert(shift, assignmentCount);
  const style = alertStyles[alert.level];

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={cn(
              "cursor-pointer hover:shadow-md transition-all group border-border/40 border-l-[3px]",
              style.border,
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
                  <div className="flex items-center gap-1">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", style.dot)} />
                    <p className={cn("font-semibold truncate", compact ? "text-[10px]" : "text-xs")}>
                      {shift.title}
                    </p>
                  </div>
                  {showDate && (
                    <p className="text-[10px] text-muted-foreground capitalize pl-2.5">
                      {format(parseISO(shift.date), "EEE d MMM", { locale: es })}
                    </p>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 pl-2.5">
                    <Clock className="h-3 w-3 shrink-0" />
                    {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                  </div>
                  {locationName && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-2.5">
                      📍 {locationName}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-1 pl-2.5">
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
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px] max-w-[180px]">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full shrink-0", style.dot)} />
            <span className="capitalize">{alert.label}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
