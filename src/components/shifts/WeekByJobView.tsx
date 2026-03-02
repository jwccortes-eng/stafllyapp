import { isSameDay, format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { Clock, Users, ChevronDown, ChevronUp, Timer, CalendarDays, Lock, Moon, Hand } from "lucide-react";
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
    const assignCount = assignments.filter(a => a.shift_id === shift.id).length;
    const isUnassigned = assignCount === 0;
    const totalSlots = shift.slots ?? 1;
    const isFull = assignCount >= totalSlots;
    const isLocked = shift.status === "locked";
    const overnight = shift.end_time.slice(0, 5) <= shift.start_time.slice(0, 5) && shift.end_time.slice(0, 5) !== "00:00";

    return (
      <div
        key={shift.id}
        className={cn(
          "rounded-xl px-2.5 py-2 text-[10px] cursor-pointer border-l-[3px] transition-all hover:shadow-md hover:-translate-y-0.5 bg-white/80 dark:bg-card/80 border border-border/15",
          color.border,
          isUnassigned ? "border-l-rose-300 bg-rose-50/40 dark:bg-rose-950/20" : color.bg,
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
        {/* Title row with icons */}
        <div className="flex items-start justify-between gap-1">
          <div className="font-semibold truncate text-[11px] min-w-0 flex-1">{shift.title}</div>
          <div className="flex items-center gap-0.5 shrink-0">
            {shift.claimable && <Hand className="h-2.5 w-2.5 text-violet-400" />}
            {overnight && <Moon className="h-2.5 w-2.5 text-indigo-400" />}
            {isLocked && <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />}
          </div>
        </div>

        {/* Time + duration */}
        <div className="text-muted-foreground/70 flex items-center gap-1.5 mt-0.5">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span>
          <span className="text-muted-foreground/40 text-[9px]">{calcDuration(shift.start_time, shift.end_time)}</span>
        </div>

        {/* Employee names */}
        {names.length > 0 ? (
          <div className="mt-1.5 space-y-px">
            {names.slice(0, 2).map((n, i) => (
              <div key={i} className="flex items-center gap-1 text-muted-foreground/60">
                <Users className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{n}</span>
              </div>
            ))}
            {names.length > 2 && <span className="text-muted-foreground/40 ml-3.5">+{names.length - 2} más</span>}
          </div>
        ) : (
          <div className="mt-1.5 text-rose-500 dark:text-rose-400 font-semibold text-[10px]">Sin asignar</div>
        )}

        {/* Mini capacity bar */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isFull ? "bg-emerald-400" : assignCount === 0 ? "bg-rose-400" : "bg-amber-400"
              )}
              style={{ width: `${Math.min(100, Math.round((assignCount / totalSlots) * 100))}%` }}
            />
          </div>
          <span className="text-[9px] tabular-nums text-muted-foreground/50 font-medium">{assignCount}/{totalSlots}</span>
        </div>
      </div>
    );
  };

  // Clients with shifts + no-client group
  const clientGroups = clients.filter(c => shifts.some(s => s.client_id === c.id));
  const hasNoClientShifts = shifts.some(s => !s.client_id);

  return (
    <div className="space-y-0">
      {/* Day headers */}
      <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px rounded-t-xl overflow-hidden border-b border-border/10 pb-1">
        <div className="p-2" />
        {weekDays.map(day => {
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} className={cn(
              "text-center py-2.5 px-1 rounded-xl transition-colors",
              isToday && "bg-primary/[0.06]"
            )}>
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
            {/* Client header row */}
            <div
              className="grid grid-cols-[200px_repeat(7,1fr)] gap-px cursor-pointer hover:bg-accent/20 transition-colors rounded-lg"
              onClick={() => toggleClient(client.id)}
            >
              <div className="flex items-center gap-2.5 p-3">
                <div className={cn("w-3 h-3 rounded-full shrink-0 ring-2 ring-white dark:ring-card", color.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{formatDisplayText(client.name, "name")}</p>
                  <div className="flex items-center gap-3 text-[9px] text-muted-foreground/60 mt-0.5">
                    <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" /> {stats.hours}</span>
                    <span className="flex items-center gap-0.5"><CalendarDays className="h-2.5 w-2.5" /> {stats.shifts}</span>
                    <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {stats.users}</span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
              </div>
              {!isExpanded && weekDays.map(day => {
                const dayShifts = getShiftsForDayAndClient(day, client.id);
                return (
                  <div key={day.toISOString()} className="p-1 flex items-center justify-center">
                    {dayShifts.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/50 tabular-nums">{dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                );
              })}
              {isExpanded && weekDays.map(day => <div key={day.toISOString()} />)}
            </div>

            {/* Expanded shifts */}
            {isExpanded && (
              <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px bg-muted/[0.03]">
                <div className="p-1" />
                {weekDays.map(day => {
                  const dayShifts = getShiftsForDayAndClient(day, client.id)
                    .sort((a, b) => a.start_time.localeCompare(b.start_time));
                  return (
                    <div key={day.toISOString()} className="p-1.5 space-y-1.5 min-h-[80px]">
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
          <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px">
            <div className="flex items-center gap-2.5 p-3">
              <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 ring-2 ring-white dark:ring-card" />
              <p className="text-xs font-medium text-muted-foreground/60">Sin cliente</p>
            </div>
            {weekDays.map(day => {
              const dayShifts = getShiftsForDayAndClient(day, null)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              const noClientColor = getClientColor(null, clientIds);
              return (
                <div key={day.toISOString()} className="p-1.5 space-y-1.5 min-h-[80px]">
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
