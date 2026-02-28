import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Loader2, Search, Clock, Eye, EyeOff, ChevronRight, CalendarDays, Filter, LayoutGrid, X } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { EmployeeDayDetailDrawer } from "@/components/today/EmployeeDayDetailDrawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  notes: string | null;
  scheduled_shifts?: { id: string; title: string; start_time: string; end_time: string } | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  employee_role: string | null;
  gender: string | null;
  groups: string | null;
}

interface ScheduledInfo {
  title: string;
  start_time: string;
  end_time: string;
  location_name?: string;
  client_name?: string;
}

type GroupMode = "none" | "shift" | "role" | "gender" | "client";

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
  const [groupBy, setGroupBy] = useState<GroupMode>("none");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterGender, setFilterGender] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");

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
      supabase.from("employees").select("id, first_name, last_name, avatar_url, employee_role, gender, groups")
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

  // Unique values for filters
  const availableRoles = useMemo(() => {
    const roles = new Set(employees.map(e => e.employee_role).filter(Boolean) as string[]);
    return Array.from(roles).sort();
  }, [employees]);

  const availableGenders = useMemo(() => {
    const genders = new Set(employees.map(e => e.gender).filter(Boolean) as string[]);
    return Array.from(genders).sort();
  }, [employees]);

  const availableClients = useMemo(() => {
    const clients = new Set(
      Object.values(scheduledMap).map(s => s.client_name).filter(Boolean) as string[]
    );
    return Array.from(clients).sort();
  }, [scheduledMap]);

  // Build per-employee view
  const employeeRows = useMemo(() => {
    const s = search.toLowerCase();
    return employees
      .filter(e => {
        const name = `${e.first_name} ${e.last_name}`.toLowerCase();
        if (!name.includes(s)) return false;
        if (filterRole !== "all" && e.employee_role !== filterRole) return false;
        if (filterGender !== "all" && e.gender !== filterGender) return false;
        return true;
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
      .filter(emp => {
        if (filterClient !== "all") {
          const clientName = emp.scheduled?.client_name;
          if (clientName !== filterClient) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isClockedIn && !b.isClockedIn) return -1;
        if (!a.isClockedIn && b.isClockedIn) return 1;
        if (a.scheduled && !b.scheduled) return -1;
        if (!a.scheduled && b.scheduled) return 1;
        return 0;
      });
  }, [employees, entries, scheduledMap, search, now, filterRole, filterGender, filterClient]);

  const activeCount = employeeRows.filter(e => e.isClockedIn).length;
  const scheduledCount = Object.keys(scheduledMap).length;
  const visibleRows = showInactive ? employeeRows : employeeRows.filter(e => e.isClockedIn || e.scheduled);

  // Grouping logic
  const groupedRows = useMemo(() => {
    if (groupBy === "none") return { "": visibleRows };
    const groups: Record<string, typeof visibleRows> = {};
    visibleRows.forEach(emp => {
      let key = "Sin asignar";
      if (groupBy === "shift") {
        key = emp.scheduled?.title ?? "Sin turno";
      } else if (groupBy === "role") {
        key = emp.employee_role || "Sin rol";
      } else if (groupBy === "gender") {
        key = emp.gender || "Sin especificar";
      } else if (groupBy === "client") {
        key = emp.scheduled?.client_name || "Sin cliente";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(emp);
    });
    return groups;
  }, [visibleRows, groupBy]);

  const activeFiltersCount = [filterRole, filterGender, filterClient].filter(v => v !== "all").length;
  const clearFilters = () => { setFilterRole("all"); setFilterGender("all"); setFilterClient("all"); };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5">
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

      {/* Search + filters toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 h-9" />
          </div>

          {/* Group by */}
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupMode)}>
            <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
              <SelectValue placeholder="Agrupar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin agrupar</SelectItem>
              <SelectItem value="shift">Por turno</SelectItem>
              <SelectItem value="client">Por cliente</SelectItem>
              <SelectItem value="role">Por rol</SelectItem>
              <SelectItem value="gender">Por género</SelectItem>
            </SelectContent>
          </Select>

          {/* Advanced filters popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 relative">
                <Filter className="h-3.5 w-3.5" />
                Filtros
                {activeFiltersCount > 0 && (
                  <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-primary text-primary-foreground">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-3" align="end">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Filtros avanzados</p>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={clearFilters}>
                    <X className="h-3 w-3" /> Limpiar
                  </Button>
                )}
              </div>

              {availableRoles.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Rol</label>
                  <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los roles</SelectItem>
                      {availableRoles.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {availableGenders.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Género</label>
                  <Select value={filterGender} onValueChange={setFilterGender}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {availableGenders.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {availableClients.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cliente</label>
                  <Select value={filterClient} onValueChange={setFilterClient}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los clientes</SelectItem>
                      {availableClients.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </PopoverContent>
          </Popover>

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

        {/* Active filter badges */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {filterRole !== "all" && (
              <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                Rol: {filterRole}
                <button onClick={() => setFilterRole("all")} className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            {filterGender !== "all" && (
              <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                Género: {filterGender}
                <button onClick={() => setFilterGender("all")} className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            {filterClient !== "all" && (
              <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                Cliente: {filterClient}
                <button onClick={() => setFilterClient("all")} className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Employee grid with groups */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay empleados que mostrar</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(groupedRows).map(([groupLabel, rows]) => (
            <div key={groupLabel}>
              {groupBy !== "none" && (
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{groupLabel}</p>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">{rows.length}</Badge>
                </div>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2">
                {rows.map(emp => (
                  <Card
                    key={emp.id}
                    className={`relative overflow-hidden rounded-xl border shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.97] ${
                      emp.isClockedIn
                        ? "border-emerald-500/40 ring-2 ring-emerald-500/20"
                        : emp.scheduled
                        ? "border-primary/30"
                        : "border-border/30"
                    }`}
                    onClick={() => setSelectedEmpId(emp.id)}
                  >
                    <div className="aspect-square relative bg-muted/30 overflow-hidden">
                      {emp.avatar_url ? (
                        <img
                          src={emp.avatar_url}
                          alt={`${emp.first_name} ${emp.last_name}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/10">
                          <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="lg" />
                        </div>
                      )}

                      {emp.isClockedIn && (
                        <div className="absolute top-1.5 right-1.5">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                          </span>
                        </div>
                      )}

                      {(emp.isClockedIn || emp.totalMinutes > 0) && (
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
                          <span className={`text-[11px] font-mono font-bold ${emp.isClockedIn ? "text-emerald-300" : "text-white/90"}`}>
                            {formatDuration(emp.totalMinutes)}
                          </span>
                        </div>
                      )}
                    </div>

                    <CardContent className="p-1.5 space-y-0.5">
                      <p className="text-[10px] font-semibold truncate leading-tight">
                        {emp.first_name} {emp.last_name.charAt(0)}.
                      </p>
                      {emp.isClockedIn && emp.scheduled ? (
                        <p className="text-[9px] text-muted-foreground truncate">
                          {emp.scheduled.client_name || emp.scheduled.title}
                        </p>
                      ) : emp.scheduled ? (
                        <p className="text-[9px] text-muted-foreground truncate">
                          {emp.scheduled.start_time.slice(0, 5)}–{emp.scheduled.end_time.slice(0, 5)}
                        </p>
                      ) : (
                        <p className="text-[9px] text-muted-foreground/50">Sin turno</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <EmployeeDayDetailDrawer
        employee={employeeRows.find(e => e.id === selectedEmpId) ?? null}
        open={!!selectedEmpId}
        onOpenChange={o => { if (!o) setSelectedEmpId(null); }}
        now={now}
        onDataChanged={loadData}
      />
    </div>
  );
}