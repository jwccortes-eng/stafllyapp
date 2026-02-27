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
    <div className="flex items-center justify-center gap-6 rounded-2xl bg-white/70 dark:bg-card/60 border border-border/20 shadow-sm px-6 py-3">
      <div className="flex items-center gap-2 text-xs">
        <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
          <Clock className="h-3.5 w-3.5 text-sky-500" />
        </div>
        <div>
          <span className="text-muted-foreground/60 text-[10px] block">Horas</span>
          <span className="font-bold text-sm">{totalHours}</span>
        </div>
      </div>
      <div className="h-8 w-px bg-border/30" />
      <div className="flex items-center gap-2 text-xs">
        <div className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <CalendarDays className="h-3.5 w-3.5 text-violet-500" />
        </div>
        <div>
          <span className="text-muted-foreground/60 text-[10px] block">Turnos</span>
          <span className="font-bold text-sm">{shifts.length}</span>
        </div>
      </div>
      <div className="h-8 w-px bg-border/30" />
      <div className="flex items-center gap-2 text-xs">
        <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <Users className="h-3.5 w-3.5 text-emerald-500" />
        </div>
        <div>
          <span className="text-muted-foreground/60 text-[10px] block">Empleados</span>
          <span className="font-bold text-sm">{uniqueEmployees}</span>
        </div>
      </div>
    </div>
  );
}
