import { Clock, CalendarDays, Users } from "lucide-react";
import type { Shift, Assignment } from "./types";

interface WeeklySummaryBarProps {
  shifts: Shift[];
  assignments: Assignment[];
}

function calcTotalHours(shifts: Shift[]): string {
  let totalMin = 0;
  for (const s of shifts) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // overnight
    totalMin += diff * (s.slots ?? 1);
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}:${String(mins).padStart(2, "0")}`;
}

export function WeeklySummaryBar({ shifts, assignments }: WeeklySummaryBarProps) {
  const totalHours = calcTotalHours(shifts);
  const uniqueEmployees = new Set(assignments.map(a => a.employee_id)).size;

  return (
    <div className="flex items-center justify-center gap-8 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-6 py-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Horas</span>
        <span className="font-bold">{totalHours}</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2 text-xs">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Turnos</span>
        <span className="font-bold">{shifts.length}</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2 text-xs">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Empleados</span>
        <span className="font-bold">{uniqueEmployees}</span>
      </div>
    </div>
  );
}
