import { isSameDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Clock, Users, Timer, CalendarDays, Ban } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { getClientColor } from "./types";
import { isEmployeeAvailable, type AvailabilityConfig, type AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
import type { Shift, Assignment, SelectOption, Employee } from "./types";

interface WeekByEmployeeViewProps {
  weekDays: Date[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  employees: Employee[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
  availabilityConfigs: AvailabilityConfig[];
  availabilityOverrides: AvailabilityOverride[];
}

export function WeekByEmployeeView({
  weekDays, shifts, assignments, locations, clients, employees,
  onShiftClick, onDropOnShift, availabilityConfigs, availabilityOverrides,
}: WeekByEmployeeViewProps) {
  const clientIds = clients.map(c => c.id);

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name;

  // Day header stats
  const getDayStats = (day: Date) => {
    const dayShifts = shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));
    let totalMinutes = 0;
    for (const s of dayShifts) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      totalMinutes += diff;
    }
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const uniqueEmps = new Set(
      assignments.filter(a => dayShifts.some(s => s.id === a.shift_id)).map(a => a.employee_id)
    ).size;
    return { hours: `${h}:${String(m).padStart(2, "0")}`, shifts: dayShifts.length, users: uniqueEmps };
  };

  // Employee stats for the week
  const getEmployeeStats = (empId: string) => {
    const empAssigns = assignments.filter(a => a.employee_id === empId);
    const empShifts = empAssigns.map(a => shifts.find(s => s.id === a.shift_id)).filter(Boolean) as Shift[];
    let totalMinutes = 0;
    for (const s of empShifts) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      totalMinutes += diff;
    }
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return { hours: `${h}:${String(m).padStart(2, "0")}`, shifts: empShifts.length };
  };

  const getShiftsForDayAndEmployee = (day: Date, empId: string) => {
    const dayShifts = shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));
    return dayShifts.filter(s => assignments.some(a => a.shift_id === s.id && a.employee_id === empId))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  // Only employees with shifts or availability issues
  const activeEmployees = employees.filter(emp => {
    const hasShifts = assignments.some(a => a.employee_id === emp.id && shifts.some(s => s.id === a.shift_id));
    const hasUnavailability = weekDays.some(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      return !isEmployeeAvailable(emp.id, dateStr, availabilityConfigs, availabilityOverrides).available;
    });
    return hasShifts || hasUnavailability;
  });

  // Unassigned shifts
  const getUnassignedForDay = (day: Date) =>
    shifts.filter(s =>
      isSameDay(new Date(s.date + "T00:00:00"), day) &&
      !assignments.some(a => a.shift_id === s.id)
    );

  // Coverage bar for day header (% assigned)
  const getDayCoverage = (day: Date) => {
    const dayShifts = shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));
    if (dayShifts.length === 0) return 0;
    const totalSlots = dayShifts.reduce((sum, s) => sum + (s.slots ?? 1), 0);
    const assigned = dayShifts.reduce((sum, s) => sum + assignments.filter(a => a.shift_id === s.id).length, 0);
    return Math.min(100, Math.round((assigned / totalSlots) * 100));
  };

  return (
    <div className="space-y-0 overflow-x-auto">
      {/* Day headers */}
      <div className="grid grid-cols-[220px_repeat(7,1fr)] gap-px rounded-t-xl overflow-hidden border-b border-border/10 pb-1 min-w-[900px]">
        <div className="p-2" />
        {weekDays.map(day => {
          const isToday = isSameDay(day, new Date());
          const stats = getDayStats(day);
          const coverage = getDayCoverage(day);
          return (
            <div key={day.toISOString()} className={cn("text-center py-2 px-1 rounded-xl", isToday && "bg-primary/[0.06]")}>
              <div className={cn("text-[9px] font-semibold uppercase tracking-[0.08em]", isToday ? "text-primary" : "text-muted-foreground/50")}>
                {format(day, "EEE", { locale: es })}
              </div>
              <div className={cn("text-base font-bold mt-0.5 leading-none", isToday ? "text-primary" : "text-foreground/75")}>
                {format(day, "d/M")}
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[8px] text-muted-foreground/40 mt-1.5">
                <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" />{stats.hours}</span>
                <span className="flex items-center gap-0.5"><CalendarDays className="h-2.5 w-2.5" />{stats.shifts}</span>
                <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{stats.users}</span>
              </div>
              {/* Coverage bar */}
              <div className="mx-auto mt-1.5 h-1 w-4/5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", coverage >= 100 ? "bg-emerald-400" : coverage >= 50 ? "bg-amber-400" : "bg-rose-400")}
                  style={{ width: `${coverage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Employee rows */}
      {activeEmployees.map(emp => {
        const stats = getEmployeeStats(emp.id);
        return (
          <div key={emp.id} className="grid grid-cols-[220px_repeat(7,1fr)] gap-px border-b border-border/10 min-w-[900px] hover:bg-accent/5 transition-colors">
            {/* Employee info */}
            <div className="flex items-start gap-2.5 p-2.5">
              <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">{emp.first_name} {emp.last_name}</p>
                <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground/60 mt-0.5">
                  <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{stats.hours}</span>
                  <span className="flex items-center gap-0.5"><CalendarDays className="h-2.5 w-2.5" />{stats.shifts}</span>
                </div>
              </div>
            </div>

            {/* Day cells */}
            {weekDays.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const empShifts = getShiftsForDayAndEmployee(day, emp.id);
              const avail = isEmployeeAvailable(emp.id, dateStr, availabilityConfigs, availabilityOverrides);

              return (
                <div
                  key={day.toISOString()}
                  className="p-1.5 space-y-1 min-h-[60px]"
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-1", "ring-primary/20", "bg-primary/5"); }}
                  onDragLeave={e => { e.currentTarget.classList.remove("ring-1", "ring-primary/20", "bg-primary/5"); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-1", "ring-primary/20", "bg-primary/5");
                    const data = e.dataTransfer.getData("application/assignment");
                    if (data && empShifts[0]) onDropOnShift(empShifts[0].id, data);
                  }}
                >
                  {empShifts.map(shift => {
                    const color = getClientColor(shift.client_id, clientIds);
                    const clientName = getClientName(shift.client_id);
                    return (
                      <div
                        key={shift.id}
                        className={cn(
                          "rounded-lg px-2 py-1.5 text-[10px] cursor-pointer border-l-[3px] transition-all hover:shadow-sm",
                          "bg-white/70 dark:bg-card/60",
                          color.border, color.bg
                        )}
                        onClick={() => onShiftClick(shift)}
                      >
                        <div className="font-semibold truncate text-[10px]">{shift.title}</div>
                        <div className="text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                        </div>
                        {clientName && (
                          <div className={cn("truncate mt-0.5 font-medium text-[9px]", color.text)}>
                            {clientName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!avail.available && empShifts.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full min-h-[40px] text-rose-500 dark:text-rose-400">
                      <Ban className="h-3 w-3 mb-0.5 opacity-60" />
                      <span className="text-[9px] font-semibold">No disponible</span>
                      {avail.reason && <span className="text-[8px] opacity-60 truncate max-w-full">{avail.reason}</span>}
                    </div>
                  )}
                  {!avail.available && empShifts.length > 0 && (
                    <div className="text-[8px] text-rose-500 font-medium text-center mt-0.5">⚠ No disponible</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Unassigned row */}
      {weekDays.some(day => getUnassignedForDay(day).length > 0) && (
        <div className="grid grid-cols-[220px_repeat(7,1fr)] gap-px border-b border-border/10 min-w-[900px] bg-rose-50/30 dark:bg-rose-950/10">
          <div className="flex items-center gap-2.5 p-2.5">
            <div className="h-7 w-7 rounded-full bg-rose-200 dark:bg-rose-800 flex items-center justify-center text-[10px] font-bold text-rose-600 dark:text-rose-300 shrink-0">?</div>
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">Sin asignar</p>
          </div>
          {weekDays.map(day => {
            const unassigned = getUnassignedForDay(day);
            return (
              <div key={day.toISOString()} className="p-1.5 space-y-1 min-h-[60px]">
                {unassigned.map(shift => {
                  const color = getClientColor(shift.client_id, clientIds);
                  return (
                    <div
                      key={shift.id}
                      className="rounded-lg px-2 py-1.5 text-[10px] cursor-pointer border-l-[3px] border-l-rose-300 bg-rose-50/60 dark:bg-rose-950/20 transition-all hover:shadow-sm"
                      onClick={() => onShiftClick(shift)}
                    >
                      <div className="font-semibold truncate text-[10px]">{shift.title}</div>
                      <div className="text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                      </div>
                      <div className="text-rose-500 font-semibold mt-0.5 text-[9px]">
                        {(shift.slots ?? 1)} vacante{(shift.slots ?? 1) > 1 ? "s" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {activeEmployees.length === 0 && (
        <div className="text-center py-16 text-sm text-muted-foreground/50">No hay turnos asignados en este período</div>
      )}
    </div>
  );
}
