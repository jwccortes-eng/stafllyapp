import { useMemo } from "react";
import { format, isSameDay, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { buildPastelMap, ASSIGNMENT_STATUS_CONFIG } from "../shifts/pastel-utils";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  shift_id: string | null;
}

interface ShiftAssignment {
  employee_id: string;
  status: string;
  scheduled_shifts: { id: string; date: string; start_time: string } | null;
}

export type ClockStatus = "on_time" | "late" | "no_shift";

interface ChipData {
  employeeId: string;
  name: string;
  status: ClockStatus;
  pillClass: string;
}

// Sober tokens consistent with OpsStatusChip language
const STATUS_DOT: Record<ClockStatus, string> = {
  on_time: "bg-earning",
  late: "bg-warning",
  no_shift: "bg-info",
};

const MAX_VISIBLE = 4;

interface WeekClockChipGridProps {
  weekDays: Date[];
  entries: TimeEntry[];
  employees: Employee[];
  assignments: ShiftAssignment[];
}

export function WeekClockChipGrid({
  weekDays, entries, employees, assignments,
}: WeekClockChipGridProps) {
  const empIds = useMemo(() => employees.map(e => e.id), [employees]);
  const colorMap = useMemo(() => buildPastelMap(empIds), [empIds]);

  const getName = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    return emp ? emp.first_name : "—";
  };

  const dayData = useMemo(() => {
    return weekDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayEntries = entries.filter(
        (e) => format(new Date(e.clock_in), "yyyy-MM-dd") === dateStr
      );

      const seen = new Set<string>();
      const chips: ChipData[] = [];

      dayEntries.forEach((entry) => {
        if (seen.has(entry.employee_id)) return;
        seen.add(entry.employee_id);

        let status: ClockStatus = "no_shift";
        if (entry.shift_id) {
          const assign = assignments.find(
            (a) =>
              a.employee_id === entry.employee_id &&
              a.scheduled_shifts?.id === entry.shift_id
          );
          if (assign?.scheduled_shifts) {
            const shiftStart = new Date(
              `${assign.scheduled_shifts.date}T${assign.scheduled_shifts.start_time}`
            );
            const clockIn = new Date(entry.clock_in);
            const lateMins = differenceInMinutes(clockIn, shiftStart);
            status = lateMins >= 5 ? "late" : "on_time";
          } else {
            status = "on_time";
          }
        }

        chips.push({
          employeeId: entry.employee_id,
          name: getName(entry.employee_id),
          status,
          pillClass: colorMap.get(entry.employee_id) || "pastel-pill-sky",
        });
      });

      return { date: day, dateStr, chips };
    });
  }, [weekDays, entries, assignments, employees, colorMap]);

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-px min-w-[600px]">
        {/* Day headers */}
        {dayData.map((d) => {
          const isToday = isSameDay(d.date, new Date());
          return (
            <div key={d.dateStr} className="text-center pb-4">
              <p className={cn(
                "text-xs font-semibold uppercase tracking-wider",
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
            </div>
          );
        })}

        {/* Chip columns */}
        {dayData.map((d) => (
          <div key={`chips-${d.dateStr}`} className="space-y-1.5 px-1 min-h-[120px]">
            {d.chips.length === 0 ? (
              <div className="h-full" />
            ) : (
              d.chips.slice(0, MAX_VISIBLE).map((chip) => (
                <div
                  key={chip.employeeId}
                  className={cn("pastel-pill w-full", chip.pillClass)}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[chip.status])} />
                  <span className="truncate flex-1">{chip.name}</span>
                </div>
              ))
            )}
            {d.chips.length > MAX_VISIBLE && (
              <p className="text-[10px] text-muted-foreground/50 text-center font-medium pt-0.5">
                +{d.chips.length - MAX_VISIBLE} más
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
