import { useState, useMemo } from "react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Users, Plus, UserX, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { getClientColor, CLIENT_COLORS } from "./types";
import type { Shift, Assignment, SelectOption, Employee } from "./types";
import type { AvailabilityConfig, AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
import { isEmployeeAvailable } from "@/hooks/useEmployeeAvailability";

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
  availabilityConfigs?: AvailabilityConfig[];
  availabilityOverrides?: AvailabilityOverride[];
}

export function MonthView({
  currentMonth, shifts, assignments, locations, clients, employees,
  onShiftClick, onDropOnShift, onAddShift,
  availabilityConfigs = [], availabilityOverrides = [],
}: MonthViewProps) {
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState("");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Filter shifts by selected employee
  const filteredShifts = useMemo(() => {
    if (!selectedEmpId) return shifts;
    const empAssignShiftIds = new Set(
      assignments.filter(a => a.employee_id === selectedEmpId).map(a => a.shift_id)
    );
    return shifts.filter(s => empAssignShiftIds.has(s.id));
  }, [shifts, assignments, selectedEmpId]);

  const getShiftsForDay = (day: Date) =>
    filteredShifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));

  const clientIds = clients.map(c => c.id);

  const getAssignmentsForShift = (shiftId: string) =>
    assignments.filter(a => a.shift_id === shiftId);

  const getUnavailableCount = (day: Date) => {
    if (employees.length === 0) return 0;
    const dateStr = format(day, "yyyy-MM-dd");
    return employees.filter(emp => {
      const result = isEmployeeAvailable(emp.id, dateStr, availabilityConfigs, availabilityOverrides);
      return !result.available;
    }).length;
  };

  // Employee list filtered by search
  const filteredEmps = useMemo(() => {
    if (!empSearch) return employees;
    const s = empSearch.toLowerCase();
    return employees.filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(s));
  }, [employees, empSearch]);

  // Count shifts per employee for the month
  const empShiftCounts = useMemo(() => {
    const map: Record<string, number> = {};
    assignments.forEach(a => {
      const shift = shifts.find(s => s.id === a.shift_id);
      if (shift) {
        map[a.employee_id] = (map[a.employee_id] || 0) + 1;
      }
    });
    return map;
  }, [assignments, shifts]);

  const dayHeaders = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MAX_VISIBLE = 5;

  const renderShiftCard = (shift: Shift) => {
    const shiftAssigns = getAssignmentsForShift(shift.id);
    const isUnassigned = shiftAssigns.length === 0;

    if (isUnassigned) {
      return (
        <div
          key={shift.id}
          className="rounded-md px-1.5 py-[3px] text-[10px] leading-tight cursor-pointer truncate transition-all hover:shadow-sm bg-rose-100/80 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40"
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
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
          </span>
          <span className="ml-1 text-rose-500/80 dark:text-rose-400/70 font-medium italic">Vacante</span>
        </div>
      );
    }

    const color = getClientColor(shift.client_id, clientIds);

    return shiftAssigns.map(assign => {
      const emp = employees.find(e => e.id === assign.employee_id);
      const empName = emp ? `${emp.first_name} ${emp.last_name.charAt(0)}.` : "—";

      return (
        <div
          key={`${shift.id}-${assign.id}`}
          className={cn(
            "rounded-md px-1.5 py-[3px] text-[10px] leading-tight cursor-pointer truncate transition-all hover:shadow-sm border-l-2",
            color.bg, color.border,
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
          <span className={cn("font-semibold", color.text)}>
            {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
          </span>
          <span className="ml-1 font-medium truncate text-foreground/80">{empName}</span>
        </div>
      );
    });
  };

  return (
    <div className="flex gap-4">
      {/* Employee sidebar */}
      <div className="w-48 shrink-0 space-y-1 hidden sm:block">
        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={empSearch}
            onChange={e => setEmpSearch(e.target.value)}
            placeholder="Buscar empleado..."
            className="pl-7 h-7 text-xs"
          />
        </div>

        <div className="max-h-[500px] overflow-y-auto space-y-0.5">
          <button
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors",
              !selectedEmpId ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"
            )}
            onClick={() => setSelectedEmpId(null)}
          >
            Todos ({employees.length})
          </button>
          {filteredEmps.map(emp => (
            <button
              key={emp.id}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                selectedEmpId === emp.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"
              )}
              onClick={() => setSelectedEmpId(emp.id)}
            >
              <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" className="h-5 w-5 text-[8px]" />
              <span className="truncate flex-1">{emp.first_name} {emp.last_name.charAt(0)}.</span>
              {(empShiftCounts[emp.id] ?? 0) > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">{empShiftCounts[emp.id]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-x-auto">
        {/* Selected employee chip (mobile) */}
        {selectedEmpId && (
          <div className="sm:hidden mb-2">
            <button
              className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full"
              onClick={() => setSelectedEmpId(null)}
            >
              ✕ {employees.find(e => e.id === selectedEmpId)?.first_name}
            </button>
          </div>
        )}

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px bg-border/30 rounded-t-xl overflow-hidden">
          {dayHeaders.map(dh => (
            <div key={dh} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-2 bg-muted/30">{dh}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="border border-border/30 border-t-0 rounded-b-xl overflow-hidden">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-border/20">
              {week.map(day => {
                const dayShifts = getShiftsForDay(day).sort((a, b) => a.start_time.localeCompare(b.start_time));
                const isToday = isSameDay(day, new Date());
                const inMonth = isSameMonth(day, currentMonth);
                const unavailableCount = inMonth && !selectedEmpId ? getUnavailableCount(day) : 0;

                // Flatten: each shift with N assignments becomes N cards; unassigned = 1 card
                const allCards: React.ReactNode[] = [];
                dayShifts.forEach(shift => {
                  const assigns = getAssignmentsForShift(shift.id);
                  if (assigns.length === 0) {
                    allCards.push(renderShiftCard(shift));
                  } else {
                    const cards = renderShiftCard(shift);
                    if (Array.isArray(cards)) allCards.push(...cards);
                    else allCards.push(cards);
                  }
                });

                const visibleCards = allCards.slice(0, MAX_VISIBLE);
                const remainingCount = allCards.length - MAX_VISIBLE;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-[100px] p-1.5 transition-colors border-b border-border/20",
                      !inMonth && "opacity-30 bg-muted/10",
                      inMonth && "bg-card/50",
                      isToday && "bg-primary/[0.04]",
                    )}
                  >
                    {/* Day header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className={cn(
                        "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                        isToday && "bg-primary text-primary-foreground font-bold",
                        !isToday && "text-muted-foreground/70"
                      )}>{format(day, "d")}</div>
                      {unavailableCount > 0 && (
                        <span className="text-[9px] font-semibold text-rose-500 flex items-center gap-0.5">
                          <UserX className="h-2.5 w-2.5" />
                          {unavailableCount}
                        </span>
                      )}
                    </div>

                    {/* Shift cards */}
                    <div className="space-y-[2px]">
                      {visibleCards}
                      {remainingCount > 0 && (
                        <p className="text-[9px] text-primary font-semibold text-center cursor-pointer hover:underline py-0.5">
                          +{remainingCount} más
                        </p>
                      )}
                      {onAddShift && inMonth && allCards.length === 0 && (
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
      </div>
    </div>
  );
}
