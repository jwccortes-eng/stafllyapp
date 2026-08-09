import { useState, memo } from "react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Users, Plus, UserX, ChevronDown, ChevronUp } from "lucide-react";
import { getClientColor } from "./types";
import { QuickCreatePopover } from "./QuickCreatePopover";
import type { Shift, Assignment, SelectOption, Employee } from "./types";
import type { AvailabilityConfig, AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
import { isEmployeeAvailable } from "@/hooks/useEmployeeAvailability";
import { getCalendarServiceIdentity } from "@/lib/shifts/calendar-service-identity";
import { ServiceCalendarChip } from "./calendar/ServiceCalendarChip";

interface QuickCreateData {
  title: string; date: string; start_time: string; end_time: string;
  client_id: string; location_id: string; slots: number;
}

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
  onQuickCreate?: (data: QuickCreateData) => Promise<void>;
  onOpenFull?: (data: QuickCreateData) => void;
  availabilityConfigs?: AvailabilityConfig[];
  availabilityOverrides?: AvailabilityOverride[];
}

function MonthViewImpl({
  currentMonth, shifts, assignments, locations, clients, employees,
  onShiftClick, onDropOnShift, onAddShift,
  onQuickCreate, onOpenFull,
  availabilityConfigs = [], availabilityOverrides = [],
}: MonthViewProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const toggleDay = (key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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

  const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MAX_VISIBLE = 5;

  const renderShiftCard = (shift: Shift) => {
    const shiftAssigns = getAssignmentsForShift(shift.id);
    const color = getClientColor(shift.client_id, clientIds);

    const identity = getCalendarServiceIdentity(shift as any, {
      assignedCount: shiftAssigns.length,
      clientName: clients.find(c => c.id === shift.client_id)?.name ?? null,
      locationName: locations.find(l => l.id === shift.location_id)?.name ?? null,
    });

    // Draft: identidad de SERVICIO, nunca "Vacante" ni no-disponibilidad.
    if (identity.service.isDraft) {
      return [(
        <ServiceCalendarChip
          key={shift.id}
          identity={identity}
          dateLabel={format(new Date(shift.date + "T00:00:00"), "EEEE d 'de' MMMM", { locale: es })}
          onOpenService={() => onShiftClick(shift)}
        />
      )];
    }

    // Published sin personal → estado de STAFFING (sin cubrir), no de servicio.
    if (shiftAssigns.length === 0) {
      return [(
        <div
          key={shift.id}
          className={cn(
            "rounded-md px-1.5 py-[3px] text-[10px] leading-tight cursor-pointer truncate transition-all hover:shadow-sm border-l-2",
            "bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-600",
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
          <span className="font-mono text-[9px] text-muted-foreground mr-1">{identity.refLabel}</span>
          <span className="font-semibold text-amber-700 dark:text-amber-400 truncate">Sin cubrir</span>
          <span className="ml-1 text-[9px] text-amber-600/80 dark:text-amber-500">
            {identity.time.label}
          </span>
        </div>
      )];
    }

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
          <span className="font-semibold text-foreground/90 truncate">{empName}</span>
          <span className={cn("ml-1 text-[9px]", color.text)}>
            {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
          </span>
        </div>
      );
    });
  };

  return (
    <div className="w-full">
      {/* En la vista Mes el calendario ocupa todo el ancho disponible. */}
      <div className="w-full overflow-x-auto">
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
                const dayKey = format(day, "yyyy-MM-dd");
                const dayShifts = getShiftsForDay(day).sort((a, b) => a.start_time.localeCompare(b.start_time));
                const isToday = isSameDay(day, new Date());
                const inMonth = isSameMonth(day, currentMonth);
                const unavailableCount = inMonth ? getUnavailableCount(day) : 0;
                const isExpanded = expandedDays.has(dayKey);

                // Flatten: each shift with N assignments becomes N cards; unassigned = 1 card
                const allCards: React.ReactNode[] = [];
                dayShifts.forEach(shift => {
                  const cards = renderShiftCard(shift);
                  if (!cards) return;
                  if (Array.isArray(cards)) allCards.push(...cards);
                  else allCards.push(cards);
                });

                const visibleCards = isExpanded ? allCards : allCards.slice(0, MAX_VISIBLE);
                const remainingCount = allCards.length - MAX_VISIBLE;
                const totalAssigns = dayShifts.reduce((sum, s) => sum + getAssignmentsForShift(s.id).length, 0);

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
                      <div className="flex items-center gap-1">
                        {unavailableCount > 0 && (
                          <span className="text-[9px] font-semibold text-rose-500 flex items-center gap-0.5">
                            <UserX className="h-2.5 w-2.5" />
                            {unavailableCount}
                          </span>
                        )}
                        {totalAssigns > 0 && (
                          <span className="text-[9px] font-semibold text-muted-foreground flex items-center gap-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {totalAssigns}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Shift cards */}
                    <div className="space-y-[2px]">
                      {visibleCards}
                      {remainingCount > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleDay(dayKey); }}
                          className="w-full flex items-center justify-center gap-0.5 text-[9px] text-primary font-semibold hover:bg-primary/5 rounded-md py-0.5 transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-2.5 w-2.5" />
                              Less
                            </>
                          ) : (
                            <>
                              +{remainingCount} more
                              <ChevronDown className="h-2.5 w-2.5" />
                            </>
                          )}
                        </button>
                      )}
                      {onAddShift && inMonth && allCards.length === 0 && (
                        onQuickCreate && onOpenFull ? (
                          <QuickCreatePopover
                            date={format(day, "yyyy-MM-dd")}
                            clients={clients}
                            locations={locations as any}
                            onQuickCreate={onQuickCreate}
                            onOpenFull={onOpenFull}
                          >
                            <button className="w-full flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-md py-0.5 transition-colors">
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                          </QuickCreatePopover>
                        ) : (
                          <button
                            onClick={() => onAddShift(format(day, "yyyy-MM-dd"))}
                            className="w-full flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-md py-0.5 transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        )
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

export const MonthView = memo(MonthViewImpl);
