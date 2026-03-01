import { isSameDay } from "date-fns";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { ShiftCard } from "./ShiftCard";
import type { Shift, Assignment, SelectOption } from "./types";

interface WeekViewProps {
  weekDays: Date[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
  onDuplicateToDay?: (shiftData: any, targetDate: string) => void;
  onAddShift?: (date: string) => void;
}

export function WeekView({ weekDays, shifts, assignments, locations, clients, onShiftClick, onDropOnShift, onDuplicateToDay, onAddShift }: WeekViewProps) {
  const getShiftsForDay = (day: Date) =>
    shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));

  const getAssignmentCount = (shiftId: string) =>
    assignments.filter(a => a.shift_id === shiftId).length;

  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;
  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name;
  const clientIds = clients.map(c => c.id);

  const handleDayDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-primary/30", "bg-primary/5");
    const action = e.dataTransfer.getData("application/shift-action");
    const shiftDataStr = e.dataTransfer.getData("application/shift-data");
    const assignmentData = e.dataTransfer.getData("application/assignment");

    if (action === "duplicate" && shiftDataStr && onDuplicateToDay) {
      const shiftData = JSON.parse(shiftDataStr);
      onDuplicateToDay(shiftData, format(day, "yyyy-MM-dd"));
    } else if (assignmentData) {
      // Existing assignment drop on a shift — handled per-shift below
    }
  };

  return (
    <div className="grid grid-cols-7 gap-3">
      {weekDays.map(day => {
        const dayShifts = getShiftsForDay(day);
        const isToday = isSameDay(day, new Date());
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-[170px] rounded-xl transition-colors",
              isToday && "bg-primary/[0.03]"
            )}
            onDragOver={e => {
              e.preventDefault();
              const action = e.dataTransfer.types.includes("application/shift-action") ? "shift" : "";
              if (action) e.currentTarget.classList.add("ring-2", "ring-primary/30", "bg-primary/5");
            }}
            onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/30", "bg-primary/5"); }}
            onDrop={e => handleDayDrop(e, day)}
          >
            <div className={cn(
              "text-center mb-3 py-2 rounded-xl transition-colors",
              isToday ? "bg-primary/8" : ""
            )}>
              <div className={cn(
                "text-[9px] font-semibold uppercase tracking-[0.08em]",
                isToday ? "text-primary" : "text-muted-foreground/50"
              )}>
                {format(day, "EEE", { locale: es })}
              </div>
              <div className={cn(
                "text-lg font-bold mt-0.5 leading-none",
                isToday ? "text-primary" : "text-foreground/75"
              )}>
                {format(day, "d")}
              </div>
              <div className="text-[8px] text-muted-foreground/35 mt-0.5 font-medium">
                {format(day, "MMM", { locale: es })}
              </div>
            </div>
            <div className="space-y-2">
              {dayShifts.map(shift => (
                <div
                  key={shift.id}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/30", "rounded-xl"); }}
                  onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/30", "rounded-xl"); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove("ring-2", "ring-primary/30", "rounded-xl");
                    const action = e.dataTransfer.getData("application/shift-action");
                    const shiftDataStr = e.dataTransfer.getData("application/shift-data");
                    if (action === "duplicate" && shiftDataStr && onDuplicateToDay) {
                      onDuplicateToDay(JSON.parse(shiftDataStr), format(day, "yyyy-MM-dd"));
                      return;
                    }
                    const data = e.dataTransfer.getData("application/assignment");
                    if (data) onDropOnShift(shift.id, data);
                  }}
                >
                  <ShiftCard
                    shift={shift}
                    assignmentCount={getAssignmentCount(shift.id)}
                    locationName={getLocationName(shift.location_id)}
                    clientName={getClientName(shift.client_id)}
                    clientIds={clientIds}
                    onClick={() => onShiftClick(shift)}
                    compact
                    draggable
                  />
                </div>
              ))}
              {dayShifts.length === 0 && !onAddShift && (
                <div className="flex items-center justify-center pt-8">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/15" />
                </div>
              )}
              {onAddShift && (
                <button
                  onClick={() => onAddShift(format(day, "yyyy-MM-dd"))}
                  className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/40 hover:text-primary hover:bg-primary/5 rounded-lg py-1.5 mt-1 transition-all"
                >
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
