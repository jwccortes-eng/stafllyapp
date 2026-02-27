import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Users, Plus } from "lucide-react";
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
  onAddShift?: (date: string) => void;
}

export function MonthView({ currentMonth, shifts, assignments, locations, clients, employees, onShiftClick, onDropOnShift, onAddShift }: MonthViewProps) {
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
          "rounded-md px-1.5 py-0.5 text-[9px] leading-tight cursor-pointer border-l-2 truncate transition-all hover:shadow-sm",
          color.border,
          isUnassigned ? "bg-rose-50/70 dark:bg-rose-950/20 border-l-rose-300" : color.bg,
        )}
        onClick={() => onShiftClick(shift)}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-1", "ring-primary/30"); }}
        onDragLeave={e => { e.currentTarget.classList.remove("ring-1", "ring-primary/30"); }}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-1", "ring-primary/30");
          const data = e.dataTransfer.getData("application/assignment");
          if (data) onDropOnShift(shift.id, data);
        }}
      >
        <span className="font-medium">
          {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
        </span>
        {names.length > 0 ? (
          <span className="ml-1 flex items-center gap-0.5 inline-flex text-muted-foreground/60">
            <Users className="h-2 w-2 shrink-0" />
            {names[0]}{names.length > 1 ? ` +${names.length - 1}` : ""}
          </span>
        ) : (
          <span className="ml-1 text-rose-500 dark:text-rose-400 font-medium">Vacante</span>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {dayHeaders.map(dh => (
          <div key={dh} className="text-center text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider py-1">{dh}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1.5 mb-1.5">
          {week.map(day => {
            const dayShifts = getShiftsForDay(day).sort((a, b) => a.start_time.localeCompare(b.start_time));
            const isToday = isSameDay(day, new Date());
            const inMonth = isSameMonth(day, currentMonth);
            const unassignedCount = dayShifts.filter(s => !assignments.some(a => a.shift_id === s.id)).length;

            return (
              <div key={day.toISOString()} className={cn(
                "min-h-[110px] rounded-xl border border-border/20 p-1.5 transition-colors bg-white/40 dark:bg-card/30",
                !inMonth && "opacity-40",
                isToday && "ring-1 ring-primary/20 bg-primary/[0.03]"
              )}>
                <div className="flex items-center justify-between mb-1">
                  <div className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                    isToday && "bg-primary/10 text-primary font-bold",
                    !isToday && "text-muted-foreground/60"
                  )}>{format(day, "d")}</div>
                  {unassignedCount > 0 && (
                    <span className="text-[8px] font-semibold text-rose-500 bg-rose-100/60 dark:bg-rose-900/30 px-1.5 rounded-full">
                      {unassignedCount} vacante{unassignedCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayShifts.slice(0, 3).map(renderShiftPill)}
                  {dayShifts.length > 3 && (
                    <p className="text-[9px] text-primary/60 font-medium text-center cursor-pointer hover:text-primary">
                      +{dayShifts.length - 3} más
                    </p>
                  )}
                  {onAddShift && inMonth && (
                    <button
                      onClick={() => onAddShift(format(day, "yyyy-MM-dd"))}
                      className="w-full flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-md py-0.5 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
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
