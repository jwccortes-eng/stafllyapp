import { isSameDay } from "date-fns";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
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
}

export function WeekView({ weekDays, shifts, assignments, locations, clients, onShiftClick, onDropOnShift }: WeekViewProps) {
  const getShiftsForDay = (day: Date) =>
    shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));

  const getAssignmentCount = (shiftId: string) =>
    assignments.filter(a => a.shift_id === shiftId).length;

  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;
  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name;
  const clientIds = clients.map(c => c.id);

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map(day => {
        const dayShifts = getShiftsForDay(day);
        const isToday = isSameDay(day, new Date());
        return (
          <div key={day.toISOString()} className="min-h-[160px]">
            <div className={cn(
              "text-center text-xs font-medium mb-2 py-1 rounded",
              isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}>
              <div>{format(day, "EEE", { locale: es })}</div>
              <div className="text-lg font-bold">{format(day, "d")}</div>
            </div>
            <div className="space-y-1.5">
              {dayShifts.map(shift => (
                <div
                  key={shift.id}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "rounded-lg"); }}
                  onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded-lg"); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded-lg");
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
                  />
                </div>
              ))}
              {dayShifts.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 text-center pt-4">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
