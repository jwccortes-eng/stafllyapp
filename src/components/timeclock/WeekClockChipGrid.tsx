import { useMemo } from "react";
import { format, isSameDay, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Search, MoreVertical, ChevronRight, ChevronLeft } from "lucide-react";

/** Pastel chip palette — each employee gets a stable color */
const CHIP_PALETTES = [
  { bg: "bg-rose-100/80 dark:bg-rose-900/20", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-emerald-100/80 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-amber-100/80 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-violet-100/80 dark:bg-violet-900/20", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-sky-100/80 dark:bg-sky-900/20", text: "text-sky-700 dark:text-sky-300" },
  { bg: "bg-pink-100/80 dark:bg-pink-900/20", text: "text-pink-700 dark:text-pink-300" },
  { bg: "bg-teal-100/80 dark:bg-teal-900/20", text: "text-teal-700 dark:text-teal-300" },
  { bg: "bg-orange-100/80 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-indigo-100/80 dark:bg-indigo-900/20", text: "text-indigo-700 dark:text-indigo-300" },
  { bg: "bg-cyan-100/80 dark:bg-cyan-900/20", text: "text-cyan-700 dark:text-cyan-300" },
] as const;

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
  palette: (typeof CHIP_PALETTES)[number];
}

const STATUS_DOT: Record<ClockStatus, string> = {
  on_time: "bg-emerald-500",
  late: "bg-amber-500",
  no_shift: "bg-sky-400",
};

const MAX_VISIBLE = 4;

interface WeekClockChipGridProps {
  weekDays: Date[];
  entries: TimeEntry[];
  employees: Employee[];
  assignments: ShiftAssignment[];
  onNavigate?: () => void;
  onSearch?: () => void;
}

export function WeekClockChipGrid({
  weekDays,
  entries,
  employees,
  assignments,
  onNavigate,
  onSearch,
}: WeekClockChipGridProps) {
  // Stable color map
  const colorMap = useMemo(() => {
    const map = new Map<string, (typeof CHIP_PALETTES)[number]>();
    employees.forEach((emp, i) => {
      map.set(emp.id, CHIP_PALETTES[i % CHIP_PALETTES.length]);
    });
    return map;
  }, [employees]);

  const getName = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    return emp ? emp.first_name : "—";
  };

  // Build day → chips
  const dayData = useMemo(() => {
    return weekDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");

      // Employees who clocked in this day
      const dayEntries = entries.filter(
        (e) => format(new Date(e.clock_in), "yyyy-MM-dd") === dateStr
      );

      // Unique employees
      const seen = new Set<string>();
      const chips: ChipData[] = [];

      dayEntries.forEach((entry) => {
        if (seen.has(entry.employee_id)) return;
        seen.add(entry.employee_id);

        let status: ClockStatus = "no_shift";

        if (entry.shift_id) {
          // Check if late
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
          palette: colorMap.get(entry.employee_id) || CHIP_PALETTES[0],
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
            <div key={d.dateStr} className="text-center pb-3">
              <p
                className={cn(
                  "text-xs font-semibold uppercase",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}
              >
                {format(d.date, "EEE", { locale: es })}
              </p>
              <p
                className={cn(
                  "text-sm font-bold mt-0.5",
                  isToday ? "text-primary" : "text-foreground"
                )}
              >
                {format(d.date, "d")}
              </p>
            </div>
          );
        })}

        {/* Chip columns */}
        {dayData.map((d) => (
          <div
            key={`chips-${d.dateStr}`}
            className="space-y-1.5 px-0.5 min-h-[120px]"
          >
            {d.chips.length === 0 ? (
              <div className="h-full" />
            ) : (
              d.chips.slice(0, MAX_VISIBLE).map((chip) => (
                <div
                  key={chip.employeeId}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-[11px] font-medium truncate flex items-center gap-1.5 transition-opacity hover:opacity-80",
                    chip.palette.bg,
                    chip.palette.text
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      STATUS_DOT[chip.status]
                    )}
                  />
                  {chip.name}
                </div>
              ))
            )}
            {d.chips.length > MAX_VISIBLE && (
              <p className="text-[10px] text-muted-foreground text-center font-medium">
                +{d.chips.length - MAX_VISIBLE} más
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
