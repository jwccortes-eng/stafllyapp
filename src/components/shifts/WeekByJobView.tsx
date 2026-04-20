import { isSameDay, format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { Clock, Users, ChevronDown, ChevronUp, Timer, CalendarDays, Lock } from "lucide-react";
import { useState, memo, useMemo, useCallback } from "react";
import { getClientColor, formatShiftCode } from "./types";
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
    const shiftAssignments = assignments.filter(a => a.shift_id === shift.id);
    const assignCount = shiftAssignments.length;
    const isLocked = shift.status === "locked";
    const totalSlots = shift.slots ?? 1;

    const accepted = shiftAssignments.filter(a => a.status === "accepted" || a.status === "confirmed").length;
    const pending = shiftAssignments.filter(a => a.status === "pending").length;
    const rejected = shiftAssignments.filter(a => a.status === "rejected").length;
    const allAccepted = assignCount > 0 && accepted === assignCount;

    return (
      <div
        key={shift.id}
        className={cn(
          "rounded-lg px-2 py-2 text-[10px] cursor-pointer border-l-[3px] transition-all hover:shadow-md hover:-translate-y-0.5 border border-border/10 bg-card",
          color.border,
          isLocked && "opacity-70"
        )}
        onClick={() => onShiftClick(shift)}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/30"); }}
        onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/30"); }}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-2", "ring-primary/30");
          const data = e.dataTransfer.getData("application/assignment");
          if (data) onDropOnShift(shift.id, data);
        }}
      >
        {/* Title */}
        <div className="font-bold truncate text-[10px] leading-snug text-foreground/85">
          {shift.shift_code && <span className="text-foreground/40">#{formatShiftCode(shift.shift_code)}</span>}{" "}
          <span className="uppercase">{shift.title}</span>
          {totalSlots > 1 && <span className="text-foreground/40 ml-0.5">({totalSlots})</span>}
        </div>

        {/* Time */}
        <div className="text-muted-foreground/55 flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span>{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span>
        </div>

        {/* Employee names */}
        {names.length > 0 && (
          <div className="mt-1.5 space-y-0">
            {names.slice(0, 2).map((n, i) => (
              <div key={i} className="flex items-center gap-1 text-muted-foreground/50 text-[10px] leading-tight">
                <Users className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{n}</span>
              </div>
            ))}
            {names.length > 2 && (
              <span className="text-muted-foreground/35 text-[10px] ml-[14px]">+{names.length - 2} más</span>
            )}
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center gap-1 mt-1.5">
          <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden flex">
            {accepted > 0 && (
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round((accepted / totalSlots) * 100)}%` }} />
            )}
            {pending > 0 && (
              <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.round((pending / totalSlots) * 100)}%` }} />
            )}
            {rejected > 0 && (
              <div className="h-full bg-rose-400 transition-all" style={{ width: `${Math.round((rejected / totalSlots) * 100)}%` }} />
            )}
          </div>
          <span className={cn(
            "text-[8px] tabular-nums font-semibold shrink-0",
            allAccepted ? "text-emerald-500" : rejected > 0 ? "text-rose-500" : pending > 0 ? "text-amber-500" : "text-muted-foreground/40"
          )}>
            {accepted}/{totalSlots}
          </span>
        </div>
      </div>
    );
  };

  const clientGroups = clients.filter(c => shifts.some(s => s.client_id === c.id));
  const hasNoClientShifts = shifts.some(s => !s.client_id);

  return (
    <div className="border border-border/20 rounded-xl overflow-hidden bg-card/50">
      {/* Sticky day headers */}
      <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b border-border/20 bg-muted/30 sticky top-0 z-10">
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
              className="grid grid-cols-[180px_repeat(7,1fr)] cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => toggleClient(client.id)}
            >
              <div className="flex items-center gap-2.5 p-3 border-r border-border/10">
                <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", color.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{formatDisplayText(client.name, "name")}</p>
                  <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground/55 mt-0.5">
                    <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" /> {stats.hours}</span>
                    <span className="flex items-center gap-0.5"><CalendarDays className="h-2.5 w-2.5" /> {stats.shifts}</span>
                    <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {stats.users}</span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
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
              <div className="grid grid-cols-[180px_repeat(7,1fr)]">
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
          <div className="grid grid-cols-[180px_repeat(7,1fr)]">
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
