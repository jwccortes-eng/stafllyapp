import { memo, useMemo } from "react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Users, Plus, UserX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuickCreatePopover } from "./QuickCreatePopover";
import type { Shift, Assignment, SelectOption, Employee } from "./types";
import type { AvailabilityConfig, AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
import { isEmployeeAvailable } from "@/hooks/useEmployeeAvailability";
import { buildServiceEventModel } from "@/lib/shifts/service-event-model";
import { ServiceEventCard } from "./calendar/ServiceEventCard";

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

/** Máximo razonable de Servicios visibles por celda antes de "+N más". */
const MAX_VISIBLE = 4;

function MonthViewImpl({
  currentMonth, shifts, assignments, locations, clients, employees,
  onShiftClick, onDropOnShift, onAddShift,
  onQuickCreate, onOpenFull,
  availabilityConfigs = [], availabilityOverrides = [],
}: MonthViewProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const clientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? null;
  const locationName = (id: string | null) => locations.find(l => l.id === id)?.name ?? null;

  /** Un Servicio = un modelo. Los workers nunca generan eventos propios. */
  const modelsByDay = useMemo(() => {
    const map = new Map<string, { shift: Shift; model: ReturnType<typeof buildServiceEventModel> }[]>();
    shifts.forEach(shift => {
      const key = shift.date;
      const entry = {
        shift,
        model: buildServiceEventModel(shift as any, {
          assignments,
          employees,
          clientName: clientName(shift.client_id),
          locationName: locationName(shift.location_id),
        }),
      };
      const arr = map.get(key);
      if (arr) arr.push(entry); else map.set(key, [entry]);
    });
    map.forEach(arr => arr.sort((a, b) => (a.shift.start_time || "").localeCompare(b.shift.start_time || "")));
    return map;
  }, [shifts, assignments, employees, clients, locations]);

  const getUnavailableCount = (day: Date) => {
    if (employees.length === 0) return 0;
    const dateStr = format(day, "yyyy-MM-dd");
    return employees.filter(emp => !isEmployeeAvailable(emp.id, dateStr, availabilityConfigs, availabilityOverrides).available).length;
  };

  const dayHeaders = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="w-full">
      {/* Desktop: cuadrícula mensual completa */}
      <div className="hidden md:block w-full">

        <div className="grid grid-cols-7 gap-px bg-border/30 rounded-t-xl overflow-hidden">
          {dayHeaders.map(dh => (
            <div key={dh} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-2 bg-muted/30">{dh}</div>
          ))}
        </div>

        <div className="border border-border/30 border-t-0 rounded-b-xl overflow-hidden">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-border/20">
              {week.map(day => {
                const dayKey = format(day, "yyyy-MM-dd");
                const dateLabel = format(day, "EEEE d 'de' MMMM", { locale: es });
                const dayServices = modelsByDay.get(dayKey) ?? [];
                const isToday = isSameDay(day, new Date());
                const inMonth = isSameMonth(day, currentMonth);
                const unavailableCount = inMonth ? getUnavailableCount(day) : 0;

                const visible = dayServices.slice(0, MAX_VISIBLE);
                const overflow = dayServices.length - visible.length;
                const totalAssigns = dayServices.reduce((sum, s) => sum + s.model.identity.staffing.assigned, 0);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-[110px] p-1.5 transition-colors border-b border-border/20 space-y-1",
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
                          <span className="text-[9px] font-semibold text-muted-foreground/70 flex items-center gap-0.5">
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

                    {visible.map(({ shift, model }) => (
                      <ServiceEventCard
                        key={shift.id}
                        model={model}
                        density="month"
                        dateLabel={dateLabel}
                        onOpen={() => onShiftClick(shift)}
                        onDropAssignment={(data) => onDropOnShift(shift.id, data)}
                      />
                    ))}

                    {overflow > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="w-full text-[9px] font-semibold text-primary/80 hover:text-primary hover:bg-primary/5 rounded-md py-0.5 transition-colors">
                            +{overflow} más
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-2 space-y-1.5 max-h-[420px] overflow-y-auto">
                          <p className="text-[11px] font-semibold capitalize px-0.5">{dateLabel}</p>
                          <p className="text-[10px] text-muted-foreground px-0.5">
                            {dayServices.length} servicio{dayServices.length !== 1 ? "s" : ""}
                          </p>
                          {dayServices.map(({ shift, model }) => (
                            <ServiceEventCard
                              key={`all-${shift.id}`}
                              model={model}
                              density="list"
                              dateLabel={dateLabel}
                              onOpen={() => onShiftClick(shift)}
                            />
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}

                    {onAddShift && inMonth && dayServices.length === 0 && (
                      onQuickCreate && onOpenFull ? (
                        <QuickCreatePopover
                          date={dayKey}
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
                          onClick={() => onAddShift(dayKey)}
                          className="w-full flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-md py-0.5 transition-colors"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      )
                    )}
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
