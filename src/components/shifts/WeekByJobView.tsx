import { isSameDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Clock, Users, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { getClientColor } from "./types";
import type { Shift, Assignment, SelectOption, Employee } from "./types";

interface WeekByJobViewProps {
  weekDays: Date[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  clients: SelectOption[];
  employees: Employee[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

export function WeekByJobView({ weekDays, shifts, assignments, locations, clients, employees, onShiftClick, onDropOnShift }: WeekByJobViewProps) {
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

  const renderShiftPill = (shift: Shift, color: ReturnType<typeof getClientColor>) => {
    const names = getAssignedNames(shift.id);
    const assignCount = assignments.filter(a => a.shift_id === shift.id).length;
    const isUnassigned = assignCount === 0;

    return (
      <div
        key={shift.id}
        className={cn(
          "rounded-md px-2 py-1.5 text-[10px] cursor-pointer border-l-[3px] transition-all hover:shadow-sm",
          color.border, color.bg,
          isUnassigned && "border-l-red-400 bg-red-50/50 dark:bg-red-950/20"
        )}
        onClick={() => onShiftClick(shift)}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40"); }}
        onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/40"); }}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-2", "ring-primary/40");
          const data = e.dataTransfer.getData("application/assignment");
          if (data) onDropOnShift(shift.id, data);
        }}
      >
        <div className="font-semibold truncate">{shift.title}</div>
        <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5" />
          {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
        </div>
        {names.length > 0 ? (
          <div className="mt-0.5 space-y-px">
            {names.slice(0, 2).map((n, i) => (
              <div key={i} className="flex items-center gap-1">
                <Users className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="truncate">{n}</span>
              </div>
            ))}
            {names.length > 2 && <span className="text-muted-foreground/70">+{names.length - 2} más</span>}
          </div>
        ) : (
          <div className="mt-0.5 text-red-500 dark:text-red-400 font-medium">Sin asignar</div>
        )}
      </div>
    );
  };

  // Clients with shifts + no-client group
  const clientGroups = clients.filter(c => shifts.some(s => s.client_id === c.id));
  const hasNoClientShifts = shifts.some(s => !s.client_id);

  return (
    <div className="space-y-0">
      {/* Day headers */}
      <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px bg-border/30 rounded-t-lg overflow-hidden">
        <div className="bg-card p-2" />
        {weekDays.map(day => {
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={cn("text-center p-2 bg-card", isToday && "bg-primary/5")}>
              <div className={cn("text-xs font-medium capitalize", isToday ? "text-primary" : "text-muted-foreground")}>
                {format(day, "EEE", { locale: es })}
              </div>
              <div className={cn(
                "text-base font-bold",
                isToday ? "text-primary" : "text-foreground"
              )}>
                {format(day, "d")}
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
          <div key={client.id} className="border-b border-border/30">
            {/* Client header row */}
            <div
              className="grid grid-cols-[200px_repeat(7,1fr)] gap-px cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => toggleClient(client.id)}
            >
              <div className="flex items-center gap-2 p-2 bg-card/80">
                <div className={cn("w-2 h-2 rounded-full shrink-0", color.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{client.name}</p>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                    <span>⏱ {stats.hours}</span>
                    <span>📅 {stats.shifts}</span>
                    <span>👥 {stats.users}</span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </div>
              {!isExpanded && weekDays.map(day => {
                const dayShifts = getShiftsForDayAndClient(day, client.id);
                return (
                  <div key={day.toISOString()} className="bg-card/50 p-1 flex items-center justify-center">
                    {dayShifts.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                );
              })}
              {isExpanded && weekDays.map(day => <div key={day.toISOString()} className="bg-card/50" />)}
            </div>

            {/* Expanded shifts */}
            {isExpanded && (
              <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px">
                <div className="bg-muted/20 p-1" />
                {weekDays.map(day => {
                  const dayShifts = getShiftsForDayAndClient(day, client.id)
                    .sort((a, b) => a.start_time.localeCompare(b.start_time));
                  return (
                    <div key={day.toISOString()} className="bg-card/30 p-1 space-y-1 min-h-[60px]">
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
        <div className="border-b border-border/30">
          <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px">
            <div className="flex items-center gap-2 p-2 bg-card/80">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
              <p className="text-xs font-medium text-muted-foreground">Sin cliente</p>
            </div>
            {weekDays.map(day => {
              const dayShifts = getShiftsForDayAndClient(day, null)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              const noClientColor = getClientColor(null, clientIds);
              return (
                <div key={day.toISOString()} className="bg-card/30 p-1 space-y-1 min-h-[60px]">
                  {dayShifts.map(shift => renderShiftPill(shift, noClientColor))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {clientGroups.length === 0 && !hasNoClientShifts && (
        <div className="text-center py-16 text-sm text-muted-foreground">No hay turnos en este período</div>
      )}
    </div>
  );
}
