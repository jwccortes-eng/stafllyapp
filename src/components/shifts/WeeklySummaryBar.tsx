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

  const totalSlots = shifts.reduce((sum, s) => sum + (s.slots ?? 1), 0);
  const assignedSlots = shifts.reduce((sum, s) => sum + Math.min(s.slots ?? 1, assignments.filter(a => a.shift_id === s.id).length), 0);
  const coveragePercent = totalSlots > 0 ? Math.round((assignedSlots / totalSlots) * 100) : 0;

  const stats = [
    { icon: Clock, label: "Horas", value: totalHours, color: "text-sky-500", bg: "bg-sky-100 dark:bg-sky-900/30" },
    { icon: CalendarDays, label: "Turnos", value: String(shifts.length), color: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-900/30" },
    { icon: Users, label: "Empleados", value: String(uniqueEmployees), color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  ];

  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/70 dark:bg-card/60 border border-border/15 shadow-sm px-5 py-2.5">
      <div className="flex items-center gap-5">
        {stats.map((stat, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
            </div>
            <div className="leading-tight">
              <span className="text-muted-foreground/50 text-[9px] font-medium uppercase tracking-wider block">{stat.label}</span>
              <span className="font-bold text-sm tabular-nums">{stat.value}</span>
            </div>
            {i < stats.length - 1 && <div className="h-6 w-px bg-border/20 ml-3" />}
          </div>
        ))}
      </div>
      {/* Coverage indicator */}
      <div className="flex items-center gap-2.5">
        <div className="text-right leading-tight">
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50 block">Cobertura</span>
          <span className={`text-sm font-bold tabular-nums ${coveragePercent >= 100 ? "text-emerald-500" : coveragePercent >= 50 ? "text-amber-500" : "text-rose-500"}`}>
            {coveragePercent}%
          </span>
        </div>
        <div className="h-7 w-16 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${coveragePercent >= 100 ? "bg-emerald-400" : coveragePercent >= 50 ? "bg-amber-400" : "bg-rose-400"}`}
            style={{ width: `${coveragePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
