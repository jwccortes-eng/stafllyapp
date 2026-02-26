import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ShiftCard } from "./ShiftCard";
import type { Shift, Assignment, SelectOption } from "./types";

interface MonthViewProps {
  currentMonth: Date;
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

export function MonthView({ currentMonth, shifts, assignments, locations, onShiftClick, onDropOnShift }: MonthViewProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getShiftsForDay = (day: Date) =>
    shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));

  const getAssignmentCount = (shiftId: string) =>
    assignments.filter(a => a.shift_id === shiftId).length;

  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;

  const dayHeaders = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayHeaders.map(dh => (
          <div key={dh} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">
            {dh}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
          {week.map(day => {
            const dayShifts = getShiftsForDay(day);
            const isToday = isSameDay(day, new Date());
            const inMonth = isSameMonth(day, currentMonth);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[100px] rounded-lg border p-1 transition-colors",
                  !inMonth && "bg-muted/30 opacity-50",
                  isToday && "ring-1 ring-primary/40"
                )}
              >
                <div className={cn(
                  "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground",
                  !isToday && "text-muted-foreground"
                )}>
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayShifts.slice(0, 3).map(shift => (
                    <div
                      key={shift.id}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40", "rounded"); }}
                      onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded"); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("ring-2", "ring-primary/40", "rounded");
                        const data = e.dataTransfer.getData("application/assignment");
                        if (data) onDropOnShift(shift.id, data);
                      }}
                    >
                      <ShiftCard
                        shift={shift}
                        assignmentCount={getAssignmentCount(shift.id)}
                        locationName={getLocationName(shift.location_id)}
                        onClick={() => onShiftClick(shift)}
                        compact
                      />
                    </div>
                  ))}
                  {dayShifts.length > 3 && (
                    <p className="text-[9px] text-muted-foreground text-center">
                      +{dayShifts.length - 3} más
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
