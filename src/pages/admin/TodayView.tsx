import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, Clock, Eye, EyeOff, ChevronRight } from "lucide-react";
import { format, differenceInMinutes, differenceInSeconds } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EmployeeDayDetailDrawer } from "@/components/today/EmployeeDayDetailDrawer";

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  scheduled_shifts?: { id: string; title: string; start_time: string; end_time: string } | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface ScheduledInfo {
  title: string;
  start_time: string;
  end_time: string;
  location_name?: string;
  client_name?: string;
}

export default function TodayView() {
  const { selectedCompanyId } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [scheduledMap, setScheduledMap] = useState<Record<string, ScheduledInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [now, setNow] = useState(new Date());
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  // Live clock for active entries
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    const [empsRes, entriesRes, shiftsRes] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name")
        .eq("company_id", selectedCompanyId).eq("is_active", true).order("first_name"),
      supabase.from("time_entries").select("*, scheduled_shifts(id, title, start_time, end_time)")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", startOfDay).lte("clock_in", endOfDay)
        .order("clock_in", { ascending: false }),
      supabase.from("shift_assignments").select(`
        employee_id,
        scheduled_shifts(id, title, start_time, end_time, date,
          locations(name), clients(name))
      `).eq("company_id", selectedCompanyId).eq("status", "confirmed"),
    ]);

    setEmployees((empsRes.data ?? []) as Employee[]);
    setEntries((entriesRes.data ?? []) as TimeEntry[]);

    // Build scheduled map for today
    const sMap: Record<string, ScheduledInfo> = {};
    (shiftsRes.data ?? []).forEach((a: any) => {
      const s = a.scheduled_shifts;
      if (s && s.date === today) {
        sMap[a.employee_id] = {
          title: s.title,
          start_time: s.start_time,
          end_time: s.end_time,
          location_name: s.locations?.name,
          client_name: s.clients?.name,
        };
      }
    });
    setScheduledMap(sMap);
    setLoading(false);
  }, [selectedCompanyId, today]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build per-employee view
  const employeeRows = useMemo(() => {
    const s = search.toLowerCase();
    return employees
      .filter(e => {
        const name = `${e.first_name} ${e.last_name}`.toLowerCase();
        return name.includes(s);
      })
      .map(emp => {
        const activeEntry = entries.find(en => en.employee_id === emp.id && !en.clock_out);
        const completedEntries = entries.filter(en => en.employee_id === emp.id && en.clock_out);
        const scheduled = scheduledMap[emp.id];

        let totalMinutes = 0;
        completedEntries.forEach(en => {
          totalMinutes += Math.max(0, differenceInMinutes(new Date(en.clock_out!), new Date(en.clock_in)) - (en.break_minutes ?? 0));
        });
        if (activeEntry) {
          totalMinutes += Math.max(0, differenceInMinutes(now, new Date(activeEntry.clock_in)) - (activeEntry.break_minutes ?? 0));
        }

        return {
          ...emp,
          activeEntry,
          completedEntries,
          scheduled,
          totalMinutes,
          isClockedIn: !!activeEntry,
        };
      })
      .sort((a, b) => {
        // Clocked in first, then scheduled, then others
        if (a.isClockedIn && !b.isClockedIn) return -1;
        if (!a.isClockedIn && b.isClockedIn) return 1;
        if (a.scheduled && !b.scheduled) return -1;
        if (!a.scheduled && b.scheduled) return 1;
        return 0;
      });
  }, [employees, entries, scheduledMap, search, now]);

  const activeCount = employeeRows.filter(e => e.isClockedIn).length;
  const scheduledCount = Object.keys(scheduledMap).length;
  const visibleRows = showInactive ? employeeRows : employeeRows.filter(e => e.isClockedIn || e.scheduled);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <h1 className="page-title">Hoy</h1>
        </div>
        <p className="text-muted-foreground/60 text-xs ml-10">
          {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/30 shadow-sm rounded-2xl">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Clock className="h-3.5 w-3.5 text-emerald-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{activeCount}</div>
            <p className="text-[11px] text-muted-foreground/60">Activos ahora</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 shadow-sm rounded-2xl">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <Eye className="h-3.5 w-3.5 text-sky-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{scheduledCount}</div>
            <p className="text-[11px] text-muted-foreground/60">Programados</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 shadow-sm rounded-2xl">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Search className="h-3.5 w-3.5 text-violet-500" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{employees.length}</div>
            <p className="text-[11px] text-muted-foreground/60">Total empleados</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 h-9" />
        </div>
        <Button
          variant={showInactive ? "outline" : "default"}
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={() => setShowInactive(!showInactive)}
        >
          {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {showInactive ? "Todos" : "Solo activos"}
        </Button>
      </div>

      {/* Employee list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="divide-y divide-border/30 rounded-2xl border border-border/30 bg-card shadow-sm overflow-hidden">
          {visibleRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay empleados que mostrar</p>
            </div>
          ) : (
            visibleRows.map(emp => (
              <div
                key={emp.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors active:bg-muted/60"
                onClick={() => setSelectedEmpId(emp.id)}
              >
                {/* Avatar */}
                <EmployeeAvatar
                  firstName={emp.first_name}
                  lastName={emp.last_name}
                  className="h-11 w-11 text-sm"
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {emp.first_name} {emp.last_name}
                  </p>

                  {emp.isClockedIn && emp.activeEntry ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className="bg-earning/15 text-earning border-earning/20 text-[10px] font-medium px-1.5 py-0">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        Entrada registrada
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(emp.activeEntry.clock_in), "HH:mm")}
                      </span>
                    </div>
                  ) : emp.scheduled ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Programado para {emp.scheduled.start_time.slice(0, 5)}-{emp.scheduled.end_time.slice(0, 5)}
                      {emp.scheduled.location_name && (
                        <span> · {emp.scheduled.location_name}</span>
                      )}
                    </p>
                  ) : null}

                  {/* Scheduled shift info when clocked in */}
                  {emp.isClockedIn && emp.scheduled && (
                    <p className="text-[10px] text-muted-foreground">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary mr-1 align-middle" />
                      {emp.scheduled.client_name || emp.scheduled.title}
                      {emp.scheduled.location_name && ` - ${emp.scheduled.location_name}`}
                    </p>
                  )}
                </div>

                {/* Hours / status */}
                <div className="text-right shrink-0 flex items-center gap-1.5">
                  {emp.isClockedIn || emp.totalMinutes > 0 ? (
                    <span className={`text-sm font-mono font-semibold ${emp.isClockedIn ? "text-earning" : "text-foreground"}`}>
                      {formatDuration(emp.totalMinutes)}
                    </span>
                  ) : (
                    <Badge variant="secondary" className="text-[11px] font-mono px-1.5">
                      --
                    </Badge>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <EmployeeDayDetailDrawer
        employee={employeeRows.find(e => e.id === selectedEmpId) ?? null}
        open={!!selectedEmpId}
        onOpenChange={o => { if (!o) setSelectedEmpId(null); }}
        now={now}
      />
    </div>
  );
}