/**
 * WEEK BY EMPLOYEE — Worker Scheduler Layout (P1).
 *
 * El calendario es el protagonista; los trabajadores son el índice izquierdo
 * (EntityRow, columna congelada de 280px). Sólo layout: ninguna lógica de
 * asignaciones, drag & drop, disponibilidad ni payroll cambia aquí.
 */

import { isSameDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { Users, Timer, CalendarDays, Ban } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EntityRow } from "@/components/entities";
import { formatEntityRef } from "@/lib/entities/entity-identity";
import { memo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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

/** Ancho de la columna de trabajadores: fija en desktop, reducida en tablet. */
const INDEX_COL = "w-[200px] lg:w-[280px] shrink-0";

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function formatHours(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function WeekByEmployeeViewImpl({
  weekDays, shifts, assignments, clients, employees,
  onShiftClick, onDropOnShift, availabilityConfigs, availabilityOverrides,
}: WeekByEmployeeViewProps) {
  const isMobile = useIsMobile();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const clientIds = clients.map(c => c.id);

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name;

  const getDayStats = (day: Date) => {
    const dayShifts = shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));
    const totalMinutes = dayShifts.reduce((sum, s) => sum + minutesBetween(s.start_time, s.end_time), 0);
    const uniqueEmps = new Set(
      assignments.filter(a => dayShifts.some(s => s.id === a.shift_id)).map(a => a.employee_id)
    ).size;
    return { hours: formatHours(totalMinutes), shifts: dayShifts.length, users: uniqueEmps };
  };

  const getEmployeeStats = (empId: string) => {
    const empAssigns = assignments.filter(a => a.employee_id === empId);
    const empShifts = empAssigns.map(a => shifts.find(s => s.id === a.shift_id)).filter(Boolean) as Shift[];
    const totalMinutes = empShifts.reduce((sum, s) => sum + minutesBetween(s.start_time, s.end_time), 0);
    const today = new Date();
    const todayCount = empShifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), today)).length;
    const unavailableDays = weekDays.filter(day =>
      !isEmployeeAvailable(empId, format(day, "yyyy-MM-dd"), availabilityConfigs, availabilityOverrides).available
    ).length;
    return { hours: formatHours(totalMinutes), shifts: empShifts.length, todayCount, unavailableDays };
  };

  const getShiftsForDayAndEmployee = (day: Date, empId: string) => {
    const dayShifts = shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));
    return dayShifts.filter(s => assignments.some(a => a.shift_id === s.id && a.employee_id === empId))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const activeEmployees = employees.filter(emp => {
    const hasShifts = assignments.some(a => a.employee_id === emp.id && shifts.some(s => s.id === a.shift_id));
    const hasUnavailability = weekDays.some(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      return !isEmployeeAvailable(emp.id, dateStr, availabilityConfigs, availabilityOverrides).available;
    });
    return hasShifts || hasUnavailability;
  });

  const getUnassignedForDay = (day: Date) =>
    shifts.filter(s =>
      isSameDay(new Date(s.date + "T00:00:00"), day) &&
      !assignments.some(a => a.shift_id === s.id)
    );

  const getDayCoverage = (day: Date) => {
    const dayShifts = shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));
    if (dayShifts.length === 0) return 0;
    const totalSlots = dayShifts.reduce((sum, s) => sum + (s.slots ?? 1), 0);
    const assigned = dayShifts.reduce((sum, s) => sum + assignments.filter(a => a.shift_id === s.id).length, 0);
    return Math.min(100, Math.round((assigned / totalSlots) * 100));
  };

  /** Bloque de evento: Cliente → Hora → Estado. */
  const renderEvent = (shift: Shift, opts?: { unassigned?: boolean }) => {
    const color = getClientColor(shift.client_id, clientIds);
    const clientName = getClientName(shift.client_id);
    const slots = shift.slots ?? 1;
    const filled = assignments.filter(a => a.shift_id === shift.id).length;
    const title = clientName ? formatDisplayText(clientName, "name") : shift.title;
    return (
      <button
        type="button"
        key={shift.id}
        onClick={() => onShiftClick(shift)}
        className={cn(
          "w-full rounded-lg border-l-[3px] px-2.5 py-2 text-left transition-all hover:shadow-md",
          "bg-card/80 backdrop-blur-[1px]",
          opts?.unassigned ? "border-l-status-danger bg-status-danger-bg/40" : cn(color.border, color.bg),
        )}
      >
        <div className="truncate text-[11px] font-bold uppercase leading-tight tracking-[0.02em] text-foreground">
          {title}
        </div>
        <div className="mt-1 text-[12px] font-semibold tabular-nums leading-none text-foreground/80">
          {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
        </div>
        <div
          className={cn(
            "mt-1 text-[10px] font-semibold leading-none",
            opts?.unassigned ? "text-status-danger" : filled >= slots ? "text-status-success" : "text-status-warning",
          )}
        >
          {filled}/{slots}
        </div>
      </button>
    );
  };

  /* ── Mobile: vista por trabajador, sin scheduler ─────────────────────── */
  if (isMobile) {
    return (
      <div className="space-y-3">
        {activeEmployees.map(emp => {
          const stats = getEmployeeStats(emp.id);
          return (
            <div key={emp.id} className="rounded-xl border border-border/40 bg-card/50 overflow-hidden">
              <div className="w-full border-b border-border/30">
                <EntityRow
                  avatar={<EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="sm" />}
                  name={`${emp.first_name} ${emp.last_name}`}
                  role={emp.employee_role}
                  reference={formatEntityRef("worker", { number: emp.employer_identification, id: emp.id })}
                  metric={`${stats.hours} h`}
                  tone={stats.shifts > 0 ? "assigned" : "operational"}
                />
              </div>
              <div className="space-y-2 px-3 pb-3">
                {weekDays.map(day => {
                  const empShifts = getShiftsForDayAndEmployee(day, emp.id);
                  if (empShifts.length === 0) return null;
                  return (
                    <div key={day.toISOString()}>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {format(day, "EEE d/M", { locale: es })}
                      </div>
                      <div className="space-y-1.5">{empShifts.map(s => renderEvent(s))}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {activeEmployees.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground/60">No hay turnos asignados en este período</div>
        )}
      </div>
    );
  }

  /* ── Desktop / tablet: scheduler con columna congelada ───────────────── */
  return (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <div className="min-w-[880px]">
        {/* Cabecera de días */}
        <div className="sticky top-0 z-30 flex border-b border-border/40 bg-background/95 backdrop-blur">
          <div className={cn(INDEX_COL, "sticky left-0 z-40 border-r border-border/40 bg-background/95 px-3 py-2")}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Trabajadores
            </span>
          </div>
          <div className="grid flex-1 grid-cols-7">
            {weekDays.map(day => {
              const isToday = isSameDay(day, new Date());
              const stats = getDayStats(day);
              const coverage = getDayCoverage(day);
              return (
                <div key={day.toISOString()} className={cn("border-l border-border/20 px-2 py-2 text-center", isToday && "bg-primary/[0.05]")}>
                  <div className={cn("text-[10px] font-semibold uppercase tracking-[0.08em]", isToday ? "text-primary" : "text-muted-foreground/60")}>
                    {format(day, "EEE", { locale: es })}
                  </div>
                  <div className={cn("mt-0.5 text-base font-bold leading-none", isToday ? "text-primary" : "text-foreground/80")}>
                    {format(day, "d/M")}
                  </div>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground/50">
                    <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" />{stats.hours}</span>
                    <span className="flex items-center gap-0.5"><CalendarDays className="h-2.5 w-2.5" />{stats.shifts}</span>
                    <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{stats.users}</span>
                  </div>
                  <div className="mx-auto mt-1.5 h-1 w-4/5 overflow-hidden rounded-full bg-muted/30">
                    <div
                      className={cn("h-full rounded-full transition-all", coverage >= 100 ? "bg-status-success" : coverage >= 50 ? "bg-status-warning" : "bg-status-danger")}
                      style={{ width: `${coverage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filas de trabajadores */}
        {activeEmployees.map(emp => {
          const stats = getEmployeeStats(emp.id);
          const selected = selectedEmployeeId === emp.id;
          return (
            <div
              key={emp.id}
              className={cn(
                "group flex border-b border-border/25 transition-colors",
                selected ? "bg-primary/[0.04]" : "hover:bg-accent/20",
              )}
            >
              <div className={cn(INDEX_COL, "sticky left-0 z-20 border-r border-border/40", selected ? "bg-primary/[0.06]" : "bg-background")}>
                <EntityRow
                  avatar={<EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="sm" />}
                  name={`${emp.first_name} ${emp.last_name}`}
                  role={emp.employee_role}
                  reference={formatEntityRef("worker", { number: emp.employer_identification, id: emp.id })}
                  metric={`${stats.hours} h`}
                  tone={stats.shifts > 0 ? "assigned" : "operational"}
                  selected={selected}
                  onClick={() => setSelectedEmployeeId(selected ? null : emp.id)}
                  hover={
                    <div className="space-y-0.5 text-[11px]">
                      <div className="font-semibold text-foreground">{emp.first_name} {emp.last_name}</div>
                      <div>Asignados hoy: {stats.todayCount}</div>
                      <div>Horas de la semana: {stats.hours}</div>
                      <div>
                        Disponibilidad: {stats.unavailableDays === 0 ? "Completa" : `${stats.unavailableDays} día(s) no disponible`}
                      </div>
                    </div>
                  }
                />
              </div>

              <div className="grid flex-1 grid-cols-7">
                {weekDays.map(day => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const empShifts = getShiftsForDayAndEmployee(day, emp.id);
                  const avail = isEmployeeAvailable(emp.id, dateStr, availabilityConfigs, availabilityOverrides);
                  return (
                    <div
                      key={day.toISOString()}
                      className="min-h-[76px] space-y-1.5 border-l border-border/20 p-2"
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-1", "ring-primary/20", "bg-primary/5"); }}
                      onDragLeave={e => { e.currentTarget.classList.remove("ring-1", "ring-primary/20", "bg-primary/5"); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("ring-1", "ring-primary/20", "bg-primary/5");
                        const data = e.dataTransfer.getData("application/assignment");
                        if (data && empShifts[0]) onDropOnShift(empShifts[0].id, data);
                      }}
                    >
                      {empShifts.map(shift => renderEvent(shift))}
                      {!avail.available && empShifts.length === 0 && (
                        <div className="flex h-full min-h-[52px] flex-col items-center justify-center text-status-danger">
                          <Ban className="mb-0.5 h-3 w-3 opacity-60" />
                          <span className="text-[10px] font-semibold">No disponible</span>
                        </div>
                      )}
                      {!avail.available && empShifts.length > 0 && (
                        <div className="text-center text-[9px] font-medium text-status-danger">No disponible</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Fila de servicios sin asignar */}
        {weekDays.some(day => getUnassignedForDay(day).length > 0) && (
          <div className="flex border-b border-border/25 bg-status-danger-bg/20">
            <div className={cn(INDEX_COL, "sticky left-0 z-20 flex items-center gap-3 border-r border-border/40 bg-background px-3 py-2.5")}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-danger-bg text-[11px] font-bold text-status-danger">?</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-status-danger">Sin asignar</p>
                <p className="text-[11px] text-muted-foreground">Vacantes abiertas</p>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-7">
              {weekDays.map(day => (
                <div key={day.toISOString()} className="min-h-[76px] space-y-1.5 border-l border-border/20 p-2">
                  {getUnassignedForDay(day).map(shift => renderEvent(shift, { unassigned: true }))}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeEmployees.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground/60">No hay turnos asignados en este período</div>
        )}
      </div>
    </div>
  );
}

export const WeekByEmployeeView = memo(WeekByEmployeeViewImpl);
