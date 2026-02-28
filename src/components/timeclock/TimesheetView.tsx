import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft, ChevronRight, Search, Timer, Download,
  CheckCircle2, XCircle, AlertTriangle, Clock, FileSpreadsheet,
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
}

const formatHours = (mins: number) => {
  if (mins <= 0) return "--";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}.${String(Math.round((m / 60) * 100)).padStart(2, "0")}`;
};

const formatDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
        .select("id, first_name, last_name")
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

        const totalMins = dailyMins.reduce((a, b) => a + b, 0);
        const hasIssues = filteredEntries.some(e => e.status === "rejected" || (!e.clock_out && e.status !== "rejected"));
        const entryIds = filteredEntries.map(e => e.id);

        return { ...emp, dailyMins, totalMins, hasIssues, entryIds, entryCount: filteredEntries.length };
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
    const pending = filtered.filter(e => e.status === "pending" && e.clock_out).length;
    const approved = filtered.filter(e => e.status === "approved").length;
    return { regularHours: (regularMins / 60).toFixed(1), breakHours: (breakMins / 60).toFixed(1), totalHours: (regularMins / 60).toFixed(1), pending, approved, total: filtered.length };
  }, [entries, statusFilter]);

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
        row["Total"] = Number(formatHours(r.totalMins));
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
      {/* KPIs */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div>
          <span className="text-2xl font-bold font-mono">{kpis.regularHours}</span>
          <span className="text-muted-foreground ml-1 text-xs">Regular</span>
        </div>
        <span className="text-muted-foreground">+</span>
        <div>
          <span className="text-2xl font-bold font-mono">{kpis.breakHours}</span>
          <span className="text-muted-foreground ml-1 text-xs">Descanso</span>
        </div>
        <span className="text-muted-foreground">=</span>
        <div>
          <span className="text-2xl font-bold font-mono text-primary">{kpis.totalHours}</span>
          <span className="text-muted-foreground ml-1 text-xs">Total Hrs Pagadas</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{kpis.pending} pendientes</Badge>
          <Badge className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-200">{kpis.approved} aprobados</Badge>
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
            {format(weekStart, "dd/MM", { locale: es })} - {format(addDays(weekStart, 6), "dd/MM/yy", { locale: es })}
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
            <SelectItem value="all">Todos ({entries.length})</SelectItem>
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
          <Download className="h-3.5 w-3.5" /> Exportar
        </Button>
      </div>

      {/* Timesheet grid */}
      {loading ? (
        <PageSkeleton variant="table" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Timer} title="Sin fichajes esta semana" description="No hay registros para el período seleccionado" compact />
      ) : (
        <div className="border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                {canApprove && (
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === rows.flatMap(r => r.entryIds).length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground min-w-[180px]">Empleado</th>
                <th className="text-center px-1 py-2 text-xs font-semibold text-muted-foreground w-10">⚠</th>
                {weekDays.map(day => (
                  <th
                    key={day.toISOString()}
                    className={`text-center px-2 py-2 text-xs font-semibold min-w-[70px] ${
                      isToday(day) ? "text-primary bg-primary/5" : "text-muted-foreground"
                    }`}
                  >
                    <div>{format(day, "EEE", { locale: es })}</div>
                    <div className="font-mono text-[10px]">{format(day, "d/MM")}</div>
                  </th>
                ))}
                <th className="text-center px-3 py-2 text-xs font-bold text-foreground min-w-[70px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  {canApprove && (
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={row.entryIds.every(id => selectedIds.has(id))}
                        onCheckedChange={() => toggleEmployee(row.entryIds)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <EmployeeAvatar firstName={row.first_name} lastName={row.last_name} className="h-7 w-7 text-[10px]" />
                      <span className="font-medium text-sm truncate">{row.first_name} {row.last_name}</span>
                    </div>
                  </td>
                  <td className="text-center px-1 py-2">
                    {row.hasIssues && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mx-auto" />}
                  </td>
                  {row.dailyMins.map((mins, i) => (
                    <td
                      key={i}
                      className={`text-center px-2 py-2 ${isToday(weekDays[i]) ? "bg-primary/5" : ""}`}
                    >
                      {mins > 0 ? (
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-mono font-semibold ${
                          row.hasIssues && entries.some(e =>
                            e.employee_id === row.id &&
                            isSameDay(new Date(e.clock_in), weekDays[i]) &&
                            (e.status === "rejected" || !e.clock_out)
                          )
                            ? "bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-sky-100/80 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                        }`}>
                          {formatHours(mins)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">--</span>
                      )}
                    </td>
                  ))}
                  <td className="text-center px-3 py-2">
                    <span className="font-mono font-bold text-sm">{row.totalMins > 0 ? formatHours(row.totalMins) : "--"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 border-t">
                {canApprove && <td />}
                <td className="px-3 py-2 text-xs font-semibold text-muted-foreground" colSpan={2}>Totales</td>
                {weekDays.map((day, i) => {
                  const dayTotal = rows.reduce((sum, r) => sum + r.dailyMins[i], 0);
                  return (
                    <td key={i} className={`text-center px-2 py-2 ${isToday(day) ? "bg-primary/5" : ""}`}>
                      <span className="font-mono font-bold text-xs">{dayTotal > 0 ? formatHours(dayTotal) : "--"}</span>
                    </td>
                  );
                })}
                <td className="text-center px-3 py-2">
                  <span className="font-mono font-bold text-sm text-primary">
                    {formatHours(rows.reduce((sum, r) => sum + r.totalMins, 0))}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
