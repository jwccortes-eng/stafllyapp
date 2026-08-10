import { isSameDay, format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { Clock, Users, ChevronDown, ChevronUp, Timer, CalendarDays, Lock } from "lucide-react";
import { useState, memo, useMemo, useCallback } from "react";
import { getClientColor, formatShiftCode } from "./types";
import { buildServiceEventModel } from "@/lib/shifts/service-event-model";
import { ServiceEventCard } from "./calendar/ServiceEventCard";
import { EntityRow, ClientAvatar } from "@/components/entities";
import { formatEntityRef } from "@/lib/entities/entity-identity";
import { clientStatusLabel, clientStatusTone } from "@/lib/clients/client-entity-status";


import type { Shift, Assignment, SelectOption, ClientOption, Employee } from "./types";

interface WeekByJobViewProps {
  weekDays: Date[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: ClientOption[];
  employees: Employee[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

function calcDuration(start: string, end: string): string {
  const today = "2000-01-01";
  const s = new Date(`${today}T${start}`);
  let e = new Date(`${today}T${end}`);
  if (e <= s) e = new Date(e.getTime() + 24 * 60 * 60 * 1000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function WeekByJobViewImpl({ weekDays, shifts, assignments, locations, clients, employees, onShiftClick, onDropOnShift }: WeekByJobViewProps) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set(clients.map(c => c.id)));
  const clientIds = clients.map(c => c.id);

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId);
      return next;
    });
  };

  const getShiftsForDayAndClient = (day: Date, clientId: string | null) =>
    shifts.filter(s =>
      isSameDay(new Date(s.date + "T00:00:00"), day) &&
      (clientId === null ? !s.client_id : s.client_id === clientId)
    );

  const getAssignedNames = (shiftId: string) => {
    const empIds = assignments.filter(a => a.shift_id === shiftId).map(a => a.employee_id);
    return empIds.map(id => {
      const e = employees.find(emp => emp.id === id);
      return e ? `${e.first_name} ${e.last_name?.charAt(0)}.` : "";
    }).filter(Boolean);
  };

  const getClientStats = (clientId: string) => {
    const clientShifts = shifts.filter(s => s.client_id === clientId);
    let totalMinutes = 0;
    for (const s of clientShifts) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      totalMinutes += diff;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const assignedCount = new Set(
      assignments.filter(a => clientShifts.some(s => s.id === a.shift_id)).map(a => a.employee_id)
    ).size;
    return {
      hours: `${hours}:${String(mins).padStart(2, "0")}`,
      shifts: clientShifts.length,
      users: assignedCount,
    };
  };

  /** Un Servicio = una ServiceEventCard. Los workers son metadata. */
  const renderShiftPill = (shift: Shift, _color: ReturnType<typeof getClientColor>) => {
    const model = buildServiceEventModel(shift as any, {
      assignments,
      employees,
      clientName: clients.find(c => c.id === shift.client_id)?.name ?? null,
      locationName: locations.find(l => l.id === shift.location_id)?.name ?? null,
    });
    return (
      <ServiceEventCard
        key={shift.id}
        model={model}
        density="week"
        dateLabel={shift.date ? format(new Date(shift.date + "T00:00:00"), "EEEE d 'de' MMMM", { locale: es }) : undefined}
        onOpen={() => onShiftClick(shift)}
        onDropAssignment={(data) => onDropOnShift(shift.id, data)}
      />
    );
  };


  const clientGroups = clients.filter(c => shifts.some(s => s.client_id === c.id));
  const hasNoClientShifts = shifts.some(s => !s.client_id);

  return (
    <div className="border border-border/20 rounded-xl overflow-hidden bg-card/50">
      {/* Sticky day headers */}
      <div className="grid grid-cols-[260px_repeat(7,1fr)] border-b border-border/20 bg-muted/30 sticky top-0 z-10">
        <div className="p-2 border-r border-border/10" />
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "text-center py-2.5 px-1",
                i < 6 && "border-r border-border/10",
                isToday && "bg-primary/[0.06]"
              )}
            >
              <div className={cn(
                "text-[9px] font-semibold uppercase tracking-[0.08em]",
                isToday ? "text-primary" : "text-muted-foreground/50"
              )}>
                {format(day, "EEE", { locale: es })}
              </div>
              <div className={cn(
                "text-lg font-bold mt-0.5 leading-none",
                isToday ? "text-primary" : "text-foreground/75"
              )}>
                {format(day, "d")}
              </div>
              <div className="text-[8px] text-muted-foreground/30 mt-0.5 font-medium">
                {format(day, "MMM", { locale: es })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Client rows */}
      {clientGroups.map(client => {
        const color = getClientColor(client.id, clientIds);
        const stats = getClientStats(client.id);
        const isExpanded = expandedClients.has(client.id);

        return (
          <div key={client.id} className="border-b border-border/15 last:border-b-0">
            {/* Client header */}
            <div
              className="grid grid-cols-[260px_repeat(7,1fr)] cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => toggleClient(client.id)}
            >
              <div className="flex items-center border-r border-border/10">
                <div className="min-w-0 flex-1">
                  <EntityRow
                    avatar={<ClientAvatar name={client.name} size="sm" />}
                    name={formatDisplayText(client.name, "name")}
                    role={clientStatusLabel(client.status)}
                    reference={formatEntityRef("client", { code: client.client_code, id: client.id })}
                    metric={`${stats.shifts} serv.`}
                    tone={clientStatusTone(client.status)}
                    hover={
                      <span className="text-[11px] leading-snug">
                        {stats.shifts} servicio{stats.shifts !== 1 ? "s" : ""} · {stats.users} worker
                        {stats.users !== 1 ? "s" : ""} · {stats.hours} h
                      </span>
                    }
                  />
                </div>
                {isExpanded ? <ChevronUp className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" /> : <ChevronDown className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
              </div>

              {!isExpanded && weekDays.map((day, i) => {
                const dayShifts = getShiftsForDayAndClient(day, client.id);
                return (
                  <div key={day.toISOString()} className={cn("p-1 flex items-center justify-center", i < 6 && "border-r border-border/10")}>
                    {dayShifts.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/50 tabular-nums">{dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                );
              })}
              {isExpanded && weekDays.map((day, i) => <div key={day.toISOString()} className={cn(i < 6 && "border-r border-border/10")} />)}
            </div>

            {/* Expanded: shift cards in aligned columns */}
            {isExpanded && (
              <div className="grid grid-cols-[260px_repeat(7,1fr)]">
                <div className="border-r border-border/10" />
                {weekDays.map((day, i) => {
                  const dayShifts = getShiftsForDayAndClient(day, client.id)
                    .sort((a, b) => a.start_time.localeCompare(b.start_time));
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "p-1.5 space-y-1.5 min-h-[90px]",
                        i < 6 && "border-r border-border/10",
                        isToday && "bg-primary/[0.02]"
                      )}
                    >
                      {dayShifts.length === 0 && (
                        <div className="h-full flex items-center justify-center">
                          <div className="w-1 h-1 rounded-full bg-muted-foreground/10" />
                        </div>
                      )}
                      {dayShifts.map(shift => renderShiftPill(shift, color))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* No-client group */}
      {hasNoClientShifts && (
        <div className="border-b border-border/15">
          <div className="grid grid-cols-[260px_repeat(7,1fr)]">
            <div className="flex items-center gap-2.5 p-3 border-r border-border/10">
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20 shrink-0" />
              <p className="text-xs font-medium text-muted-foreground/50">Sin cliente</p>
            </div>
            {weekDays.map((day, i) => {
              const dayShifts = getShiftsForDayAndClient(day, null)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              const noClientColor = getClientColor(null, clientIds);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "p-1.5 space-y-1.5 min-h-[90px]",
                    i < 6 && "border-r border-border/10",
                    isToday && "bg-primary/[0.02]"
                  )}
                >
                  {dayShifts.length === 0 && (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-muted-foreground/10" />
                    </div>
                  )}
                  {dayShifts.map(shift => renderShiftPill(shift, noClientColor))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {clientGroups.length === 0 && !hasNoClientShifts && (
        <div className="text-center py-16 text-sm text-muted-foreground/50">No hay turnos en este período</div>
      )}
    </div>
  );
}

export const WeekByJobView = memo(WeekByJobViewImpl);
