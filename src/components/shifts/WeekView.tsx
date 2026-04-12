import { useMemo, useState, useCallback } from "react";
import { isSameDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Plus, Clock, CheckCircle2 } from "lucide-react";
import { buildPastelMap, ASSIGNMENT_STATUS_CONFIG } from "./pastel-utils";
import { QuickCreatePopover } from "./QuickCreatePopover";
import type { Shift, Assignment, SelectOption, Employee } from "./types";

interface QuickCreateData {
  title: string; date: string; start_time: string; end_time: string;
  client_id: string; location_id: string; slots: number;
}

interface WeekViewProps {
  weekDays: Date[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  employees?: Employee[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
  onDuplicateToDay?: (shiftData: any, targetDate: string) => void;
  onAddShift?: (date: string) => void;
  onQuickCreate?: (data: QuickCreateData) => Promise<void>;
  onOpenFull?: (data: QuickCreateData) => void;
}

const DEFAULT_MAX_PILLS = 4;

export function WeekView({
  weekDays, shifts, assignments, locations, clients, employees = [],
  onShiftClick, onDropOnShift, onDuplicateToDay, onAddShift,
  onQuickCreate, onOpenFull,
}: WeekViewProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((dateStr: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr);
      return next;
    });
  }, []);

  const getShiftsForDay = (day: Date) =>
    shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));

  const getEmployeeName = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    return emp ? emp.first_name : "—";
  };

  // Stable pastel color per employee
  const empIds = useMemo(() => employees.map(e => e.id), [employees]);
  const colorMap = useMemo(() => buildPastelMap(empIds), [empIds]);

  // Build day → pills data
  const dayData = useMemo(() => {
    return weekDays.map(day => {
      const dayShifts = getShiftsForDay(day);
      const dayAssigns = dayShifts.flatMap(s =>
        assignments.filter(a => a.shift_id === s.id).map(a => ({
          ...a,
          shift: s,
        }))
      );
      return { date: day, dateStr: format(day, "yyyy-MM-dd"), shifts: dayShifts, assigns: dayAssigns };
    });
  }, [weekDays, shifts, assignments]);

  const handleDayDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-primary/30", "bg-primary/5");
    const action = e.dataTransfer.getData("application/shift-action");
    const shiftDataStr = e.dataTransfer.getData("application/shift-data");
    if (action === "duplicate" && shiftDataStr && onDuplicateToDay) {
      onDuplicateToDay(JSON.parse(shiftDataStr), format(day, "yyyy-MM-dd"));
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-px min-w-[600px]">
        {/* Day headers */}
        {dayData.map(d => {
          const isToday = isSameDay(d.date, new Date());
          return (
            <div key={d.dateStr} className="text-center pb-4">
              <p className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                isToday ? "text-primary" : "text-muted-foreground/60"
              )}>
                {format(d.date, "EEE", { locale: es })}
              </p>
              <p className={cn(
                "text-lg font-bold mt-0.5 leading-none",
                isToday ? "text-primary" : "text-foreground"
              )}>
                {format(d.date, "d")}
              </p>
            </div>
          );
        })}

        {/* Pill columns */}
        {dayData.map(d => {
          const isToday = isSameDay(d.date, new Date());
          const isExpanded = expandedDays.has(d.dateStr);
          const maxPills = isExpanded ? Infinity : DEFAULT_MAX_PILLS;
          const overflow = d.assigns.length - DEFAULT_MAX_PILLS;

          return (
            <div
              key={`pills-${d.dateStr}`}
              className={cn(
                "space-y-1.5 px-1 min-h-[140px] rounded-xl transition-colors",
                isToday && "bg-primary/[0.02]"
              )}
              onDragOver={e => {
                e.preventDefault();
                e.currentTarget.classList.add("ring-2", "ring-primary/30", "bg-primary/5");
              }}
              onDragLeave={e => {
                e.currentTarget.classList.remove("ring-2", "ring-primary/30", "bg-primary/5");
              }}
              onDrop={e => handleDayDrop(e, d.date)}
            >
              {d.assigns.length === 0 && d.shifts.length === 0 ? (
                onAddShift ? (
                  <button
                    onClick={() => onAddShift(d.dateStr)}
                    className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-lg py-6 transition-all"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                ) : (
                  <div className="h-full" />
                )
              ) : (
                <>
                  {d.assigns.slice(0, maxPills).map(a => {
                    const pillClass = colorMap.get(a.employee_id) || "pastel-pill-sky";
                    const statusDot = ASSIGNMENT_STATUS_CONFIG[a.status]?.dotClass || "bg-amber-400";
                    return (
                      <div
                        key={a.id}
                        className={cn("pastel-pill w-full", pillClass)}
                        onClick={() => onShiftClick(a.shift)}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot)} />
                        <span className="truncate flex-1">{getEmployeeName(a.employee_id)}</span>
                      </div>
                    );
                  })}
                  {/* Unassigned shifts with no workers */}
                  {d.shifts.filter(s => !d.assigns.some(a => a.shift.id === s.id)).slice(0, 2).map(s => (
                    <div
                      key={s.id}
                      className="pastel-pill w-full pastel-pill-rose opacity-70"
                      onClick={() => onShiftClick(s)}
                    >
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate flex-1">{s.start_time.slice(0, 5)}</span>
                    </div>
                  ))}
                </>
              )}
              {overflow > 0 && (
                <button
                  onClick={() => toggleExpand(d.dateStr)}
                  className="w-full text-[10px] text-primary/70 hover:text-primary font-semibold text-center py-1 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  {isExpanded ? "− Ver menos" : `+${overflow} más`}
                </button>
              )}
              {onAddShift && d.assigns.length > 0 && (
                <button
                  onClick={() => onAddShift(d.dateStr)}
                  className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/25 hover:text-primary hover:bg-primary/5 rounded-lg py-1 mt-0.5 transition-all"
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
