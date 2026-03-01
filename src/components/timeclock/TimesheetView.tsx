import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Timer, Download,
  CheckCircle2, XCircle, AlertCircle, CalendarIcon, Filter, Clock,
} from "lucide-react";
import { format, startOfWeek, addDays, differenceInMinutes, parseISO, isWithinInterval, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

interface PayPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}

type ViewMode = "week" | "period" | "custom";

const formatHours = (mins: number) => {
  if (mins <= 0) return "--";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};

const formatHoursDecimal = (mins: number) => {
  if (mins <= 0) return "--";
  const h = mins / 60;
  return h % 1 === 0 ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function TimesheetView() {
  const { role, hasModuleAccess } = useAuth();
  const { selectedCompanyId } = useCompany();
  const canApprove = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payPeriods, setPayPeriods] = useState<PayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // View mode & range
  const [viewMode, setViewMode] = useState<ViewMode>("period");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  // Load pay periods — no limit
  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from("pay_periods")
      .select("id, start_date, end_date, status")
      .eq("company_id", selectedCompanyId)
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        const periods = (data ?? []) as PayPeriod[];
        setPayPeriods(periods);
        const now = new Date();
        const current = periods.find(p =>
          isWithinInterval(now, { start: parseISO(p.start_date), end: parseISO(p.end_date) })
        );
        if (current) setSelectedPeriodId(current.id);
        else if (periods.length > 0) setSelectedPeriodId(periods[0].id);
      });
  }, [selectedCompanyId]);

  // Compute effective date range
  const { rangeStart, rangeEnd } = useMemo(() => {
    let start: Date;
    let end: Date;

    if (viewMode === "period" && selectedPeriodId) {
      const period = payPeriods.find(p => p.id === selectedPeriodId);
      if (period) {
        start = parseISO(period.start_date);
        end = parseISO(period.end_date);
      } else {
        start = weekStart;
        end = addDays(weekStart, 6);
      }
    } else if (viewMode === "custom" && customFrom && customTo) {
      start = customFrom;
      end = customTo;
    } else {
      start = weekStart;
      end = addDays(weekStart, 6);
    }

    return { rangeStart: start, rangeEnd: end };
  }, [viewMode, weekStart, selectedPeriodId, payPeriods, customFrom, customTo]);

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const fetchEnd = addDays(rangeEnd, 1);
    const [entriesRes, empsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, notes, status")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", rangeStart.toISOString())
        .lt("clock_in", fetchEnd.toISOString())
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
    setExpandedIds(new Set());
    setPage(1);
    setLoading(false);
  }, [selectedCompanyId, rangeStart, rangeEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build employee summary rows with daily breakdown
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return employees
      .filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(s))
      .map(emp => {
        const empEntries = entries.filter(e => e.employee_id === emp.id);
        const filteredEntries = statusFilter === "all"
          ? empEntries
          : empEntries.filter(e => e.status === statusFilter);

        let totalMins = 0;
        let breakMins = 0;
        filteredEntries.forEach(e => {
          if (e.clock_out) {
            totalMins += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
            breakMins += e.break_minutes ?? 0;
          }
        });

        const pendingCount = empEntries.filter(e => e.status === "pending").length;
        const approvedCount = empEntries.filter(e => e.status === "approved").length;
        const rejectedCount = empEntries.filter(e => e.status === "rejected").length;
        const openCount = empEntries.filter(e => !e.clock_out).length;
        const hasIssues = rejectedCount > 0 || openCount > 0;
        const entryIds = filteredEntries.map(e => e.id);

        // Daily breakdown
        const dayMap = new Map<string, TimeEntry[]>();
        filteredEntries.forEach(e => {
          const dayKey = format(new Date(e.clock_in), "yyyy-MM-dd");
          if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
          dayMap.get(dayKey)!.push(e);
        });

        const dailyBreakdown = Array.from(dayMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, dayEntries]) => {
            let dayMins = 0;
            let dayBreakMins = 0;
            dayEntries.forEach(e => {
              if (e.clock_out) {
                dayMins += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
                dayBreakMins += e.break_minutes ?? 0;
              }
            });
            return { day, entries: dayEntries, totalMins: dayMins, breakMins: dayBreakMins };
          });

        return {
          ...emp,
          totalMins,
          breakMins,
          totalHours: totalMins / 60,
          pendingCount,
          approvedCount,
          rejectedCount,
          openCount,
          hasIssues,
          entryIds,
          entryCount: filteredEntries.length,
          daysWorked: dayMap.size,
          dailyBreakdown,
        };
      })
      .filter(r => r.entryCount > 0)
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [employees, entries, search, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const paginatedRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const pendingRequestsTotal = useMemo(() =>
    entries.filter(e => e.status === "pending").length
  , [entries]);

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
      regularHours: formatHoursDecimal(regularMins),
      breakHours: formatHoursDecimal(breakMins),
      totalHours: formatHoursDecimal(regularMins),
      employeeCount: new Set(entries.map(e => e.employee_id)).size,
      entryCount: filtered.length,
    };
  }, [entries, statusFilter]);

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Bulk actions — batch in chunks of 50 to avoid URL length limits
  const batchUpdate = async (ids: string[], updates: Record<string, any>) => {
    const BATCH_SIZE = 50;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("time_entries")
        .update(updates as any)
        .in("id", chunk)
        .eq("status", "pending");
      if (error) throw error;
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      await batchUpdate(ids, { status: "approved", approved_at: new Date().toISOString() });
      toast.success(`${ids.length} fichajes aprobados`);
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      toast.error(err.message ?? "Error al aprobar");
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      await batchUpdate(ids, { status: "rejected", notes: "[Rechazado] Rechazo masivo" });
      toast.success(`${ids.length} fichajes rechazados`);
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      toast.error(err.message ?? "Error al rechazar");
    }
  };

  const toggleSelectAll = () => {
    const allIds = paginatedRows.flatMap(r => r.entryIds);
    if (allIds.every(id => selectedIds.has(id))) {
      const next = new Set(selectedIds);
      allIds.forEach(id => next.delete(id));
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([...selectedIds, ...allIds]));
    }
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
      const data = rows.map(r => ({
        "Empleado": `${r.first_name} ${r.last_name}`,
        "Días trabajados": r.daysWorked,
        "Horas totales": Number(formatHoursDecimal(r.totalMins)),
        "Descansos (min)": r.breakMins,
        "Entradas": r.entryCount,
        "Pendientes": r.pendingCount,
        "Aprobados": r.approvedCount,
        "Rechazados": r.rejectedCount,
      }));
      await writeExcelFile(data, "Timesheets", `timesheets_${format(rangeStart, "yyyy-MM-dd")}.xlsx`);
      toast.success("Archivo exportado");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Error al exportar");
    }
  };

  const selectedPeriod = payPeriods.find(p => p.id === selectedPeriodId);

  const getStatusBadge = (row: typeof rows[0]) => {
    if (row.approvedCount === row.entryCount && row.entryCount > 0)
      return <Badge className="text-[10px] rounded-full px-2.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Aprobado</Badge>;
    if (row.rejectedCount > 0)
      return <Badge className="text-[10px] rounded-full px-2.5 bg-destructive/10 text-destructive border-0">Rechazado</Badge>;
    if (row.pendingCount > 0)
      return <Badge className="text-[10px] rounded-full px-2.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Pendiente</Badge>;
    return <span className="text-xs text-muted-foreground">--</span>;
  };

  const getEntryStatusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (status === "rejected") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  };

  const colCount = canApprove ? 8 : 7;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..." className="pl-9 h-9" />
        </div>

        {/* View mode selector */}
        <Select value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="period">Periodo</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range nav */}
        {viewMode === "week" && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(d => addDays(d, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {format(weekStart, "MM/dd")} - {format(addDays(weekStart, 6), "MM/dd")}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(d => addDays(d, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {viewMode === "period" && selectedPeriod && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              const idx = payPeriods.findIndex(p => p.id === selectedPeriodId);
              if (idx < payPeriods.length - 1) setSelectedPeriodId(payPeriods[idx + 1].id);
            }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">
              {format(parseISO(selectedPeriod.start_date), "MMM dd", { locale: es })} – {format(parseISO(selectedPeriod.end_date), "MMM dd, yyyy", { locale: es })}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              const idx = payPeriods.findIndex(p => p.id === selectedPeriodId);
              if (idx > 0) setSelectedPeriodId(payPeriods[idx - 1].id);
            }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {viewMode === "custom" && (
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1.5", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {customFrom ? format(customFrom, "MMM dd", { locale: es }) : "Desde"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">–</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1.5", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {customTo ? format(customTo, "MMM dd", { locale: es }) : "Hasta"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="approved">Aprobados</SelectItem>
            <SelectItem value="rejected">Rechazados</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {pendingRequestsTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <Badge className="bg-amber-500 text-white rounded-full h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              {pendingRequestsTotal}
            </Badge>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pendientes</span>
          </div>
        )}

        <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Exportar
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="flex flex-wrap items-center gap-6 text-sm bg-muted/30 rounded-lg px-4 py-3 border border-border/50">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono">{kpis.regularHours}</span>
          <span className="text-[11px] text-muted-foreground">hrs totales</span>
        </div>
        <div className="h-6 w-px bg-border/50" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold font-mono">{kpis.employeeCount}</span>
          <span className="text-[11px] text-muted-foreground">empleados</span>
        </div>
        <div className="h-6 w-px bg-border/50" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold font-mono">{kpis.entryCount}</span>
          <span className="text-[11px] text-muted-foreground">fichajes</span>
        </div>
      </div>

      {/* Bulk actions */}
      {canApprove && selectedIds.size > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{selectedIds.size} seleccionados</Badge>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBulkApprove}>
            <CheckCircle2 className="h-3 w-3" /> Aprobar
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={handleBulkReject}>
            <XCircle className="h-3 w-3" /> Rechazar
          </Button>
        </div>
      )}

      {/* Data Table */}
      {loading ? (
        <PageSkeleton variant="table" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Timer} title="Sin timesheets" description="No hay registros para el rango seleccionado" compact />
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {canApprove && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={paginatedRows.length > 0 && paginatedRows.flatMap(r => r.entryIds).every(id => selectedIds.has(id))}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                )}
                <TableHead className="w-8" />
                <TableHead className="min-w-[180px]">Empleado</TableHead>
                <TableHead className="text-center">Días</TableHead>
                <TableHead className="text-center">Horas totales</TableHead>
                <TableHead className="text-center">Descansos</TableHead>
                <TableHead className="text-center">Fichajes</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map(row => {
                const isExpanded = expandedIds.has(row.id);
                return (
                  <Fragment key={row.id}>
                    {/* Summary row */}
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => toggleExpand(row.id)}
                    >
                      {canApprove && (
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={row.entryIds.every(id => selectedIds.has(id))}
                            onCheckedChange={() => toggleEmployee(row.entryIds)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="px-1">
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <EmployeeAvatar firstName={row.first_name} lastName={row.last_name} avatarUrl={row.avatar_url} size="md" />
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{row.first_name} {row.last_name}</span>
                            {row.hasIssues && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm">{row.daysWorked}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono font-semibold text-sm">{row.totalMins > 0 ? formatHours(row.totalMins) : "--"}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm text-muted-foreground">{row.breakMins > 0 ? `${row.breakMins}m` : "--"}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">{row.entryCount}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(row)}
                      </TableCell>
                    </TableRow>

                    {/* Expanded daily detail */}
                    {isExpanded && row.dailyBreakdown.map(dayData => (
                      <Fragment key={dayData.day}>
                        {/* Day header */}
                        <TableRow className="bg-muted/20 hover:bg-muted/30">
                          {canApprove && <TableCell />}
                          <TableCell />
                          <TableCell colSpan={colCount - 3} className="py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {format(parseISO(dayData.day), "EEEE, d MMM", { locale: es })}
                              </span>
                              <span className="text-xs font-mono font-semibold">
                                {dayData.totalMins > 0 ? formatHours(dayData.totalMins) : "--"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell />
                        </TableRow>

                        {/* Individual entries */}
                        {dayData.entries.map(entry => {
                          const duration = entry.clock_out
                            ? Math.max(0, differenceInMinutes(new Date(entry.clock_out), new Date(entry.clock_in)) - (entry.break_minutes ?? 0))
                            : 0;
                          return (
                            <TableRow key={entry.id} className="bg-muted/10 hover:bg-muted/20 border-b-0">
                              {canApprove && (
                                <TableCell onClick={e => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedIds.has(entry.id)}
                                    onCheckedChange={() => {
                                      const next = new Set(selectedIds);
                                      next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                      setSelectedIds(next);
                                    }}
                                  />
                                </TableCell>
                              )}
                              <TableCell />
                              <TableCell className="py-2">
                                <div className="flex items-center gap-4 pl-4">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="text-muted-foreground">In:</span>
                                    <span className="font-mono font-medium">{format(new Date(entry.clock_in), "hh:mm a")}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="text-muted-foreground">Out:</span>
                                    <span className="font-mono font-medium">
                                      {entry.clock_out ? format(new Date(entry.clock_out), "hh:mm a") : <span className="text-amber-500">Abierto</span>}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell />
                              <TableCell className="text-center">
                                <span className="font-mono text-xs">{duration > 0 ? formatHours(duration) : "--"}</span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {entry.break_minutes > 0 ? `${entry.break_minutes}m` : "--"}
                                </span>
                              </TableCell>
                              <TableCell />
                              <TableCell className="text-center">
                                {getEntryStatusIcon(entry.status)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                {canApprove && <TableCell />}
                <TableCell />
                <TableCell className="font-semibold text-xs uppercase text-muted-foreground">Totales</TableCell>
                <TableCell className="text-center">
                  <span className="font-mono font-bold text-xs">{new Set(rows.flatMap(r => r.dailyBreakdown.map(d => d.day))).size}d</span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-mono font-bold text-sm text-primary">
                    {formatHours(rows.reduce((sum, r) => sum + r.totalMins, 0))}
                  </span>
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {rows.reduce((sum, r) => sum + r.breakMins, 0)}m
                </TableCell>
                <TableCell className="text-center text-xs">
                  {rows.reduce((sum, r) => sum + r.entryCount, 0)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev && p - prev > 1;
                return (
                  <span key={p} className="contents">
                    {showEllipsis && <span className="text-xs text-muted-foreground px-1">…</span>}
                    <Button
                      variant={p === page ? "default" : "ghost"}
                      size="icon"
                      className={cn("h-8 w-8 text-xs", p === page && "pointer-events-none")}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  </span>
                );
              })}
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Filas:</span>
            <Select value={String(rowsPerPage)} onValueChange={v => { setRowsPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[65px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROWS_PER_PAGE_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
