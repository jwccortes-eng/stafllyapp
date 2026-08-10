/**
 * WeekView — "Cuadrícula" semanal.
 *
 * SEMÁNTICA (documentada en docs/qa/P1_PREMIUM_SERVICE_CALENDAR_SYSTEM.md):
 *   Cuadrícula = SERVICIOS por día. La unidad es el Servicio, nunca el worker.
 *   El staffing por persona vive en "Agrupar por → Equipo" (WeekByEmployeeView).
 */
import { useMemo, useState, useCallback, memo } from "react";
import { isSameDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { QuickCreatePopover } from "./QuickCreatePopover";
import { buildServiceEventModel } from "@/lib/shifts/service-event-model";
import { ServiceEventCard } from "./calendar/ServiceEventCard";
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

const DEFAULT_MAX_CARDS = 5;

function WeekViewImpl({
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

  const dayData = useMemo(() => {
    return weekDays.map(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      const services = shifts
        .filter(s => isSameDay(new Date(s.date + "T00:00:00"), day))
        .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))
        .map(shift => ({
          shift,
          model: buildServiceEventModel(shift as any, {
            assignments,
            employees,
            clientName: clients.find(c => c.id === shift.client_id)?.name ?? null,
            locationName: locations.find(l => l.id === shift.location_id)?.name ?? null,
          }),
        }));
      return { date: day, dateStr, services };
    });
  }, [weekDays, shifts, assignments, employees, clients, locations]);

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
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-px lg:gap-1">
        {/* Day headers (desktop) */}
        {dayData.map(d => {
          const isToday = isSameDay(d.date, new Date());
          return (
            <div key={`h-${d.dateStr}`} className="hidden lg:block text-center pb-2">
              <p className={cn(
                "text-[10px] font-semibold uppercase tracking-wider",
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
              <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                {d.services.length} servicio{d.services.length !== 1 ? "s" : ""}
              </p>
            </div>
          );
        })}

        {/* Service columns */}
        {dayData.map(d => {
          const isToday = isSameDay(d.date, new Date());
          const isExpanded = expandedDays.has(d.dateStr);
          const visible = isExpanded ? d.services : d.services.slice(0, DEFAULT_MAX_CARDS);
          const overflow = d.services.length - visible.length;
          const dateLabel = format(d.date, "EEEE d 'de' MMMM", { locale: es });

          return (
            <div
              key={`col-${d.dateStr}`}
              className={cn(
                "space-y-1.5 p-1 min-h-[140px] rounded-xl transition-colors border border-transparent",
                isToday && "bg-primary/[0.03] border-primary/15"
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
              {/* Day label on mobile/tablet stacking */}
              <p className="lg:hidden text-[11px] font-semibold capitalize text-muted-foreground">
                {format(d.date, "EEE d", { locale: es })} · {d.services.length}
              </p>

              {d.services.length === 0 ? (
                onAddShift ? (
                  onQuickCreate && onOpenFull ? (
                    <QuickCreatePopover
                      date={d.dateStr}
                      clients={clients}
                      locations={locations as any}
                      onQuickCreate={onQuickCreate}
                      onOpenFull={onOpenFull}
                    >
                      <button className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-lg py-6 transition-all">
                        <Plus className="h-3 w-3" />
                      </button>
                    </QuickCreatePopover>
                  ) : (
                    <button
                      onClick={() => onAddShift(d.dateStr)}
                      className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/30 hover:text-primary hover:bg-primary/5 rounded-lg py-6 transition-all"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )
                ) : (
                  <div className="h-full" />
                )
              ) : (
                <>
                  {visible.map(({ shift, model }) => (
                    <ServiceEventCard
                      key={shift.id}
                      model={model}
                      density="week"
                      dateLabel={dateLabel}
                      onOpen={() => onShiftClick(shift)}
                      onDropAssignment={(data) => onDropOnShift(shift.id, data)}
                    />
                  ))}
                  {overflow > 0 && (
                    <button
                      onClick={() => toggleExpand(d.dateStr)}
                      className="w-full text-[10px] text-primary/70 hover:text-primary font-semibold text-center py-1 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
                    >
                      +{overflow} más
                    </button>
                  )}
                  {isExpanded && d.services.length > DEFAULT_MAX_CARDS && (
                    <button
                      onClick={() => toggleExpand(d.dateStr)}
                      className="w-full text-[10px] text-muted-foreground hover:text-foreground font-semibold text-center py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      − Ver menos
                    </button>
                  )}
                  {onAddShift && (
                    onQuickCreate && onOpenFull ? (
                      <QuickCreatePopover
                        date={d.dateStr}
                        clients={clients}
                        locations={locations as any}
                        onQuickCreate={onQuickCreate}
                        onOpenFull={onOpenFull}
                      >
                        <button className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/25 hover:text-primary hover:bg-primary/5 rounded-lg py-1 mt-0.5 transition-all">
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </QuickCreatePopover>
                    ) : (
                      <button
                        onClick={() => onAddShift(d.dateStr)}
                        className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground/25 hover:text-primary hover:bg-primary/5 rounded-lg py-1 mt-0.5 transition-all"
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const WeekView = memo(WeekViewImpl);
