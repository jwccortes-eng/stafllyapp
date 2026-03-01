import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ChevronLeft, ChevronRight, Search, Timer, Download,
  Trophy, Clock, AlertTriangle, XCircle, TrendingUp,
} from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, isSameDay, isSameMonth, format, differenceInMinutes,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

interface Employee { id: string; first_name: string; last_name: string; avatar_url?: string | null; }

// Top ranking item
interface TopItem {
  employee: Employee;
  value: number;
  label: string;
}

const MEDAL_COLORS = [
  "text-amber-500", // gold
  "text-slate-400", // silver
  "text-orange-600", // bronze
];

function TopRankingCard({ title, icon, items, suffix, colorClass }: {
  title: string;
  icon: React.ReactNode;
  items: TopItem[];
  suffix: string;
  colorClass: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card className="border-border/30 rounded-xl overflow-hidden">
      <div className={cn("px-3 py-2 flex items-center gap-2 border-b border-border/20", colorClass)}>
        {icon}
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <CardContent className="p-0">
        {items.slice(0, 5).map((item, i) => (
          <div key={item.employee.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors">
            <span className={cn("text-sm font-bold w-5 text-center", i < 3 ? MEDAL_COLORS[i] : "text-muted-foreground")}>
              {i < 3 ? <Trophy className="h-3.5 w-3.5 inline" /> : `${i + 1}`}
            </span>
            <EmployeeAvatar
              firstName={item.employee.first_name}
              lastName={item.employee.last_name}
              avatarUrl={item.employee.avatar_url}
              size="sm"
            />
            <span className="text-xs font-medium flex-1 truncate">
              {item.employee.first_name} {item.employee.last_name}
            </span>
            <span className="text-xs font-mono font-bold text-foreground">{item.label}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function MonthClockView() {
  const { selectedCompanyId } = useCompany();

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const [entriesRes, empsRes, assignRes] = await Promise.all([
      supabase.from("time_entries")
        .select("id, employee_id, clock_in, clock_out, break_minutes, status, shift_id")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", monthStart.toISOString())
        .lte("clock_in", monthEnd.toISOString())
        .order("clock_in"),
      supabase.from("employees")
        .select("id, first_name, last_name, avatar_url")
        .eq("company_id", selectedCompanyId).eq("is_active", true)
        .order("first_name"),
      supabase.from("shift_assignments")
        .select("employee_id, status, scheduled_shifts(id, date, start_time)")
        .eq("company_id", selectedCompanyId),
    ]);
    setEntries((entriesRes.data ?? []) as TimeEntry[]);
    setEmployees((empsRes.data ?? []) as Employee[]);
    setAssignments((assignRes.data ?? []) as ShiftAssignment[]);
    setLoading(false);
  }, [selectedCompanyId, monthStart.toISOString()]);

  useEffect(() => { loadData(); }, [loadData]);

  // Calendar grid
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Filtered employees
  const filteredEmps = useMemo(() => {
    if (!search) return employees;
    const s = search.toLowerCase();
    return employees.filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(s));
  }, [employees, search]);

  // Employee for detail or all
  const targetEntries = useMemo(() => {
    if (selectedEmpId) return entries.filter(e => e.employee_id === selectedEmpId);
    return entries;
  }, [entries, selectedEmpId]);

  // Aggregate hours per day
  const dayHoursMap = useMemo(() => {
    const map: Record<string, number> = {};
    targetEntries.forEach(e => {
      if (!e.clock_out) return;
      const dateKey = format(new Date(e.clock_in), "yyyy-MM-dd");
      const mins = Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
      map[dateKey] = (map[dateKey] || 0) + mins;
    });
    return map;
  }, [targetEntries]);

  const totalMonthMins = Object.values(dayHoursMap).reduce((a, b) => a + b, 0);
  const daysWorked = Object.keys(dayHoursMap).length;

  const getIntensity = (mins: number) => {
    if (mins <= 0) return "";
    if (mins < 240) return "bg-sky-100/80 dark:bg-sky-900/20";
    if (mins < 480) return "bg-sky-200/80 dark:bg-sky-800/30";
    return "bg-sky-300/80 dark:bg-sky-700/40";
  };

  // ── TOP RANKINGS ──
  const monthStr = format(monthStart, "yyyy-MM");

  // Top: Most shifts worked
  const topShifts = useMemo<TopItem[]>(() => {
    const countMap: Record<string, number> = {};
    assignments.forEach(a => {
      const s = a.scheduled_shifts;
      if (s && s.date?.startsWith(monthStr) && a.status === "confirmed") {
        countMap[a.employee_id] = (countMap[a.employee_id] || 0) + 1;
      }
    });
    return Object.entries(countMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([empId, count]) => {
        const emp = employees.find(e => e.id === empId);
        return emp ? { employee: emp, value: count, label: `${count} turnos` } : null;
      })
      .filter(Boolean) as TopItem[];
  }, [assignments, employees, monthStr]);

  // Top: Most hours (= most money earned)
  const topHours = useMemo<TopItem[]>(() => {
    const minsMap: Record<string, number> = {};
    entries.forEach(e => {
      if (!e.clock_out) return;
      const mins = Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
      minsMap[e.employee_id] = (minsMap[e.employee_id] || 0) + mins;
    });
    return Object.entries(minsMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([empId, mins]) => {
        const emp = employees.find(e => e.id === empId);
        return emp ? { employee: emp, value: mins, label: `${(mins / 60).toFixed(1)}h` } : null;
      })
      .filter(Boolean) as TopItem[];
  }, [entries, employees]);

  // Top: Most late arrivals (clock_in > shift start_time)
  const topLate = useMemo<TopItem[]>(() => {
    const lateMap: Record<string, number> = {};
    entries.forEach(e => {
      if (!e.shift_id) return;
      // Find matching assignment to get shift start time
      const assign = assignments.find(a =>
        a.employee_id === e.employee_id &&
        a.scheduled_shifts?.id === e.shift_id
      );
      if (!assign?.scheduled_shifts) return;
      const shiftDate = assign.scheduled_shifts.date;
      const shiftStartStr = `${shiftDate}T${assign.scheduled_shifts.start_time}`;
      const shiftStart = new Date(shiftStartStr);
      const clockIn = new Date(e.clock_in);
      if (clockIn > shiftStart && differenceInMinutes(clockIn, shiftStart) >= 5) {
        lateMap[e.employee_id] = (lateMap[e.employee_id] || 0) + 1;
      }
    });
    return Object.entries(lateMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([empId, count]) => {
        const emp = employees.find(e => e.id === empId);
        return emp ? { employee: emp, value: count, label: `${count} tardanzas` } : null;
      })
      .filter(Boolean) as TopItem[];
  }, [entries, assignments, employees]);

  // Top: Most rejected shifts
  const topRejected = useMemo<TopItem[]>(() => {
    const rejectMap: Record<string, number> = {};
    assignments.forEach(a => {
      const s = a.scheduled_shifts;
      if (s && s.date?.startsWith(monthStr) && a.status === "rejected") {
        rejectMap[a.employee_id] = (rejectMap[a.employee_id] || 0) + 1;
      }
    });
    return Object.entries(rejectMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([empId, count]) => {
        const emp = employees.find(e => e.id === empId);
        return emp ? { employee: emp, value: count, label: `${count} rechazos` } : null;
      })
      .filter(Boolean) as TopItem[];
  }, [assignments, employees, monthStr]);

  // Top: Most adjustments (entries with notes containing "[" or manual edits)
  const topAdjustments = useMemo<TopItem[]>(() => {
    const adjMap: Record<string, number> = {};
    entries.forEach(e => {
      if (e.status === "rejected" || (e.status === "approved" && e.break_minutes > 0)) {
        adjMap[e.employee_id] = (adjMap[e.employee_id] || 0) + 1;
      }
    });
    return Object.entries(adjMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([empId, count]) => {
        const emp = employees.find(e => e.id === empId);
        return emp ? { employee: emp, value: count, label: `${count} ajustes` } : null;
      })
      .filter(Boolean) as TopItem[];
  }, [entries, employees]);

  const handleExport = async () => {
    try {
      const { writeExcelFile } = await import("@/lib/safe-xlsx");
      const allDays = Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1);
      const data = filteredEmps.map(emp => {
        const empEntries = entries.filter(e => e.employee_id === emp.id);
        const row: Record<string, any> = { Empleado: formatPersonName(`${emp.first_name} ${emp.last_name}`) };
        let totalMins = 0;
        allDays.forEach(day => {
          const dateKey = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day), "yyyy-MM-dd");
          let dayTotal = 0;
          empEntries.forEach(e => {
            if (e.clock_out && format(new Date(e.clock_in), "yyyy-MM-dd") === dateKey) {
              dayTotal += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
            }
          });
          row[`${day}`] = dayTotal > 0 ? Number((dayTotal / 60).toFixed(1)) : "";
          totalMins += dayTotal;
        });
        row["Total"] = Number((totalMins / 60).toFixed(1));
        return row;
      });
      await writeExcelFile(data, "Mensual", `timeclock_${format(currentMonth, "yyyy-MM")}.xlsx`);
      toast.success("Archivo exportado");
    } catch { toast.error("Error al exportar"); }
  };

  const dayHeaders = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/30 rounded-xl">
          <CardContent className="pt-3 pb-2 px-4">
            <div className="text-2xl font-bold font-mono">{(totalMonthMins / 60).toFixed(1)}h</div>
            <p className="text-[11px] text-muted-foreground">Horas totales</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 rounded-xl">
          <CardContent className="pt-3 pb-2 px-4">
            <div className="text-2xl font-bold">{daysWorked}</div>
            <p className="text-[11px] text-muted-foreground">Días trabajados</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 rounded-xl">
          <CardContent className="pt-3 pb-2 px-4">
            <div className="text-2xl font-bold font-mono">{daysWorked > 0 ? (totalMonthMins / daysWorked / 60).toFixed(1) : "0"}h</div>
            <p className="text-[11px] text-muted-foreground">Promedio/día</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..." className="pl-9 h-9" />
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, -1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium min-w-[100px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: es })}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Employee filter */}
        {selectedEmpId && (
          <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setSelectedEmpId(null)}>
            ✕ {employees.find(e => e.id === selectedEmpId)?.first_name ?? ""}
          </Button>
        )}

        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-auto" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Exportar
        </Button>
      </div>

      {loading ? (
        <PageSkeleton variant="table" />
      ) : (
        <div className="space-y-6">
          <div className="flex gap-4">
            {/* Employee sidebar */}
            <div className="w-48 shrink-0 space-y-1 max-h-[500px] overflow-y-auto hidden sm:block">
              <button
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors",
                  !selectedEmpId ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"
                )}
                onClick={() => setSelectedEmpId(null)}
              >
                Todos ({employees.length})
              </button>
              {filteredEmps.map(emp => {
                const empMins = entries
                  .filter(e => e.employee_id === emp.id && e.clock_out)
                  .reduce((sum, e) => sum + Math.max(0, differenceInMinutes(new Date(e.clock_out!), new Date(e.clock_in)) - (e.break_minutes ?? 0)), 0);
                return (
                  <button
                    key={emp.id}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                      selectedEmpId === emp.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedEmpId(emp.id)}
                  >
                    <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} size="sm" className="h-5 w-5 text-[8px]" />
                    <span className="truncate flex-1">{formatPersonName(emp.first_name)} {formatPersonName(emp.last_name)?.charAt(0)}.</span>
                    {empMins > 0 && <span className="text-[10px] font-mono text-muted-foreground">{(empMins / 60).toFixed(0)}h</span>}
                  </button>
                );
              })}
            </div>

            {/* Calendar */}
            <div className="flex-1">
              <div className="grid grid-cols-7 gap-px bg-border/30 rounded-t-xl overflow-hidden">
                {dayHeaders.map(dh => (
                  <div key={dh} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-2 bg-muted/30">{dh}</div>
                ))}
              </div>
              <div className="border border-border/30 border-t-0 rounded-b-xl overflow-hidden">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 divide-x divide-border/20">
                    {week.map(day => {
                      const dateKey = format(day, "yyyy-MM-dd");
                      const mins = dayHoursMap[dateKey] ?? 0;
                      const isCurrentDay = isSameDay(day, new Date());
                      const inMonth = isSameMonth(day, currentMonth);

                      return (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "min-h-[60px] p-1.5 border-b border-border/20 transition-colors",
                            !inMonth && "opacity-20",
                            isCurrentDay && "bg-primary/[0.04]",
                            inMonth && getIntensity(mins),
                          )}
                        >
                          <div className={cn(
                            "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-0.5",
                            isCurrentDay && "bg-primary text-primary-foreground font-bold",
                            !isCurrentDay && "text-muted-foreground/70"
                          )}>
                            {format(day, "d")}
                          </div>
                          {mins > 0 && inMonth && (
                            <div className="text-center">
                              <span className="text-[11px] font-mono font-bold text-foreground">
                                {(mins / 60).toFixed(1)}h
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── TOP RANKINGS ── */}
          {!selectedEmpId && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Top del Mes</h3>
                <Badge variant="outline" className="text-[10px]">{format(currentMonth, "MMMM yyyy", { locale: es })}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                <TopRankingCard
                  title="Más Turnos"
                  icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />}
                  items={topShifts}
                  suffix="turnos"
                  colorClass="bg-amber-50/50 dark:bg-amber-950/20"
                />
                <TopRankingCard
                  title="Más Horas"
                  icon={<Clock className="h-3.5 w-3.5 text-emerald-500" />}
                  items={topHours}
                  suffix="h"
                  colorClass="bg-emerald-50/50 dark:bg-emerald-950/20"
                />
                <TopRankingCard
                  title="Más Tardanzas"
                  icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                  items={topLate}
                  suffix="tardanzas"
                  colorClass="bg-rose-50/50 dark:bg-rose-950/20"
                />
                <TopRankingCard
                  title="Más Rechazos"
                  icon={<XCircle className="h-3.5 w-3.5 text-orange-500" />}
                  items={topRejected}
                  suffix="rechazos"
                  colorClass="bg-orange-50/50 dark:bg-orange-950/20"
                />
                <TopRankingCard
                  title="Más Ajustes"
                  icon={<Timer className="h-3.5 w-3.5 text-violet-500" />}
                  items={topAdjustments}
                  suffix="ajustes"
                  colorClass="bg-violet-50/50 dark:bg-violet-950/20"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
