import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import { getClientColor } from "./types";
import type { Shift, Assignment, SelectOption, Employee } from "./types";

interface MonthViewProps {
  currentMonth: Date;
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  employees: Employee[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

export function MonthView({ currentMonth, shifts, assignments, locations, clients, employees, onShiftClick, onDropOnShift }: MonthViewProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const getShiftsForDay = (day: Date) =>
    shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));
  const clientIds = clients.map(c => c.id);

  const getAssignedNames = (shiftId: string) => {
    const empIds = assignments.filter(a => a.shift_id === shiftId).map(a => a.employee_id);
    return empIds.map(id => {
      const e = employees.find(emp => emp.id === id);
      return e ? `${e.first_name} ${e.last_name?.charAt(0) ?? ""}`.trim() : "";
    }).filter(Boolean);
  };

  const dayHeaders = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const renderShiftPill = (shift: Shift) => {
    const color = getClientColor(shift.client_id, clientIds);
    const names = getAssignedNames(shift.id);
    const isUnassigned = names.length === 0;

    return (
      <div
        key={shift.id}
        className={cn(
          "rounded px-1.5 py-0.5 text-[9px] leading-tight cursor-pointer border-l-[2px] truncate transition-all hover:shadow-sm",
          color.border, color.bg,
          isUnassigned && "border-l-destructive bg-destructive/10"
        )}
        onClick={() => onShiftClick(shift)}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-1", "ring-primary/40"); }}
        onDragLeave={e => { e.currentTarget.classList.remove("ring-1", "ring-primary/40"); }}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-1", "ring-primary/40");
          const data = e.dataTransfer.getData("application/assignment");
          if (data) onDropOnShift(shift.id, data);
        }}
      >
        <span className="font-medium">
          {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
        </span>
        {names.length > 0 ? (
          <span className="ml-1 flex items-center gap-0.5 inline-flex">
            <Users className="h-2 w-2 shrink-0" />
            {names[0]}{names.length > 1 ? ` +${names.length - 1}` : ""}
          </span>
        ) : (
          <span className="ml-1 text-destructive font-medium">Sin asignar</span>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayHeaders.map(dh => (
          <div key={dh} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">{dh}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
          {week.map(day => {
            const dayShifts = getShiftsForDay(day).sort((a, b) => a.start_time.localeCompare(b.start_time));
            const isToday = isSameDay(day, new Date());
            const inMonth = isSameMonth(day, currentMonth);
            const unassignedCount = dayShifts.filter(s => !assignments.some(a => a.shift_id === s.id)).length;

            return (
              <div key={day.toISOString()} className={cn(
                "min-h-[110px] rounded-lg border p-1 transition-colors",
                !inMonth && "bg-muted/30 opacity-50",
                isToday && "ring-1 ring-primary/40"
              )}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground",
                    !isToday && "text-muted-foreground"
                  )}>{format(day, "d")}</div>
                  {unassignedCount > 0 && (
                    <span className="text-[8px] font-bold text-destructive bg-destructive/10 px-1 rounded">
                      {unassignedCount} Sin asignar
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayShifts.slice(0, 4).map(renderShiftPill)}
                  {dayShifts.length > 4 && (
                    <p className="text-[9px] text-primary font-medium text-center cursor-pointer hover:underline">
                      +{dayShifts.length - 4} más
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
