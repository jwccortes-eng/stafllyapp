import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeDayDetailDrawer } from "@/components/today/EmployeeDayDetailDrawer";
import {
  ChevronLeft, ChevronRight, Search, Timer, Download,
  CheckCircle2, XCircle, AlertTriangle, FileText,
} from "lucide-react";
import { format, startOfWeek, addDays, differenceInMinutes, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  status: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
}

const formatHours = (mins: number) => {
  if (mins <= 0) return "--";
  const h = mins / 60;
  return h % 1 === 0 ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

export function TimesheetView() {
  const { role, hasModuleAccess } = useAuth();
  const { selectedCompanyId } = useCompany();
  const canApprove = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    const [entriesRes, empsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, notes, status")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", weekStart.toISOString())
        .lt("clock_in", weekEnd.toISOString())
        .order("clock_in", { ascending: true }),
      supabase.from("employees")
        .select("id, first_name, last_name, avatar_url")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true)
        .order("first_name"),
    ]);
    setEntries((entriesRes.data ?? []) as TimeEntry[]);
    setEmployees((empsRes.data ?? []) as Employee[]);
    setSelectedIds(new Set());
    setLoading(false);
  }, [selectedCompanyId, weekStart]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build employee rows with daily hours
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return employees
      .filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(s))
      .map(emp => {
        const empEntries = entries.filter(e => e.employee_id === emp.id);
        const filteredEntries = statusFilter === "all"
          ? empEntries
          : empEntries.filter(e => e.status === statusFilter);

        const dailyMins: number[] = weekDays.map(day => {
          let total = 0;
          filteredEntries.forEach(e => {
            if (isSameDay(new Date(e.clock_in), day) && e.clock_out) {
              total += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
            }
          });
          return total;
        });

        // Check which days have notes/issues
        const dailyHasNotes: boolean[] = weekDays.map(day => {
          return filteredEntries.some(e =>
            isSameDay(new Date(e.clock_in), day) &&
            (e.notes || e.status === "rejected" || !e.clock_out)
          );
        });

        const totalMins = dailyMins.reduce((a, b) => a + b, 0);
        const hasIssues = filteredEntries.some(e => e.status === "rejected" || (!e.clock_out && e.status !== "rejected"));
        const entryIds = filteredEntries.map(e => e.id);

        return { ...emp, dailyMins, dailyHasNotes, totalMins, hasIssues, entryIds, entryCount: filteredEntries.length };
      })
      .filter(r => r.entryCount > 0 || statusFilter === "all")
      .sort((a, b) => b.totalMins - a.totalMins);
  }, [employees, entries, search, weekDays, statusFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const filtered = statusFilter === "all" ? entries : entries.filter(e => e.status === statusFilter);
    let regularMins = 0;
    let breakMins = 0;
    filtered.forEach(e => {
      if (e.clock_out) {
        regularMins += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
        breakMins += e.break_minutes ?? 0;
      }
    });
    return {
      regularHours: (regularMins / 60).toFixed(2),
      breakHours: (breakMins / 60).toFixed(2),
      totalHours: (regularMins / 60).toFixed(2),
      unpaidHours: (breakMins / 60).toFixed(0),
    };
  }, [entries, statusFilter]);

  // Build drawer-compatible employee data
  const drawerEmployee = useMemo(() => {
    if (!selectedEmpId) return null;
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return null;
    const empEntries = entries.filter(en => en.employee_id === selectedEmpId);
    const activeEntry = empEntries.find(en => !en.clock_out);
    const completedEntries = empEntries.filter(en => en.clock_out);
    let totalMinutes = 0;
    completedEntries.forEach(en => {
      totalMinutes += Math.max(0, differenceInMinutes(new Date(en.clock_out!), new Date(en.clock_in)) - (en.break_minutes ?? 0));
    });
    if (activeEntry) {
      totalMinutes += Math.max(0, differenceInMinutes(new Date(), new Date(activeEntry.clock_in)) - (activeEntry.break_minutes ?? 0));
    }
    return { ...emp, activeEntry, completedEntries, totalMinutes, isClockedIn: !!activeEntry };
  }, [selectedEmpId, employees, entries]);

  // Bulk actions
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("time_entries")
      .update({ status: "approved", approved_at: new Date().toISOString() } as any)
      .in("id", ids)
      .eq("status", "pending");
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} fichajes aprobados`); loadData(); }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("time_entries")
      .update({ status: "rejected", notes: "[Rechazado] Rechazo masivo" })
      .in("id", ids)
      .eq("status", "pending");
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} fichajes rechazados`); loadData(); }
  };

  const toggleSelectAll = () => {
    const allIds = rows.flatMap(r => r.entryIds);
    if (selectedIds.size === allIds.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  };

  const toggleEmployee = (entryIds: string[]) => {
    const next = new Set(selectedIds);
    const allSelected = entryIds.every(id => next.has(id));
    entryIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
    setSelectedIds(next);
  };

  // Export
  const handleExport = async () => {
    try {
      const { writeExcelFile } = await import("@/lib/safe-xlsx");
      const data = rows.map(r => {
        const row: Record<string, any> = { Empleado: `${r.first_name} ${r.last_name}` };
        weekDays.forEach((d, i) => {
          row[format(d, "EEE dd/MM", { locale: es })] = r.dailyMins[i] > 0 ? Number(formatHours(r.dailyMins[i])) : "";
        });
        row["Total hours"] = Number(formatHours(r.totalMins));
        return row;
      });
      await writeExcelFile(data, "Timesheets", `timesheets_${format(weekStart, "yyyy-MM-dd")}.xlsx`);
      toast.success("Archivo exportado");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Error al exportar");
    }
  };

  const isToday = (day: Date) => isSameDay(day, new Date());

  return (
    <div className="space-y-4">
      {/* KPIs - Connecteam formula style */}
      <div className="flex flex-wrap items-baseline gap-3 text-sm">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono">{kpis.regularHours}</span>
          <span className="text-[11px] text-muted-foreground">Regular</span>
        </div>
        <span className="text-lg text-muted-foreground/50 font-light">+</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono">0</span>
          <span className="text-[11px] text-muted-foreground">Paid time off</span>
        </div>
        <span className="text-lg text-muted-foreground/50 font-light">=</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono text-primary">{kpis.totalHours}</span>
          <span className="text-[11px] text-muted-foreground">Total Paid Hours</span>
        </div>
        <div className="flex items-baseline gap-1.5 ml-4 pl-4 border-l border-border/50">
          <span className="text-2xl font-bold font-mono">{kpis.unpaidHours}</span>
          <span className="text-[11px] text-muted-foreground">Unpaid time off</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..." className="pl-9 h-9" />
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(d => addDays(d, -7))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium min-w-[140px] text-center">
            {format(weekStart, "MM/dd")} - {format(addDays(weekStart, 6), "MM/dd")}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(d => addDays(d, 7))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status filter</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="approved">Aprobados</SelectItem>
            <SelectItem value="rejected">Rechazados</SelectItem>
          </SelectContent>
        </Select>

        {/* Bulk actions */}
        {canApprove && selectedIds.size > 0 && (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs">{selectedIds.size} sel.</Badge>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBulkApprove}>
              <CheckCircle2 className="h-3 w-3" /> Aprobar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={handleBulkReject}>
              <XCircle className="h-3 w-3" /> Rechazar
            </Button>
          </div>
        )}

        {/* Export */}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-auto" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {/* Timesheet grid - Connecteam style */}
      {loading ? (
        <PageSkeleton variant="table" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Timer} title="Sin fichajes esta semana" description="No hay registros para el período seleccionado" compact />
      ) : (
        <div className="border rounded-xl overflow-hidden overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                {canApprove && (
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === rows.flatMap(r => r.entryIds).length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[180px]">Full name</th>
                <th className="text-center px-1 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-14">Issues</th>
                {weekDays.map(day => (
                  <th
                    key={day.toISOString()}
                    className={`text-center px-2 py-3 min-w-[75px] ${
                      isToday(day) ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className={`text-[11px] font-semibold uppercase tracking-wider ${isToday(day) ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {format(day, "EEE", { locale: es })} {format(day, "M/d")}
                    </div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[80px]">Total hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => setSelectedEmpId(row.id)}
                >
                  {canApprove && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={row.entryIds.every(id => selectedIds.has(id))}
                        onCheckedChange={() => toggleEmployee(row.entryIds)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <EmployeeAvatar firstName={row.first_name} lastName={row.last_name} avatarUrl={row.avatar_url} size="md" />
                      <span className="font-medium text-xs uppercase tracking-wide truncate">{row.first_name} {row.last_name}</span>
                    </div>
                  </td>
                  <td className="text-center px-1 py-2.5">
                    {row.hasIssues && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mx-auto" />}
                  </td>
                  {row.dailyMins.map((mins, i) => (
                    <td
                      key={i}
                      className={`text-center px-2 py-2.5 ${isToday(weekDays[i]) ? "bg-primary/5" : ""}`}
                    >
                      {mins > 0 ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-mono font-semibold bg-sky-100/80 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                          {formatHours(mins)}
                          {row.dailyHasNotes[i] && (
                            <FileText className="h-2.5 w-2.5 opacity-60" />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30 text-xs">--</span>
                      )}
                    </td>
                  ))}
                  <td className="text-center px-3 py-2.5">
                    <span className="font-mono font-bold text-sm">{row.totalMins > 0 ? formatHours(row.totalMins) : "--"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 border-t">
                {canApprove && <td />}
                <td className="px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase" colSpan={2}>Totales</td>
                {weekDays.map((day, i) => {
                  const dayTotal = rows.reduce((sum, r) => sum + r.dailyMins[i], 0);
                  return (
                    <td key={i} className={`text-center px-2 py-2.5 ${isToday(day) ? "bg-primary/5" : ""}`}>
                      <span className="font-mono font-bold text-xs">{dayTotal > 0 ? formatHours(dayTotal) : "--"}</span>
                    </td>
                  );
                })}
                <td className="text-center px-3 py-2.5">
                  <span className="font-mono font-bold text-sm text-primary">
                    {formatHours(rows.reduce((sum, r) => sum + r.totalMins, 0))}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Employee detail drawer */}
      <EmployeeDayDetailDrawer
        employee={drawerEmployee}
        open={!!selectedEmpId}
        onOpenChange={o => { if (!o) setSelectedEmpId(null); }}
        now={new Date()}
        onDataChanged={loadData}
      />
    </div>
  );
}
