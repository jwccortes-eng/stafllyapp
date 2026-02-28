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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmployeeDayDetailDrawer } from "@/components/today/EmployeeDayDetailDrawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import {
  ChevronLeft, ChevronRight, Search, Timer, Download,
  CheckCircle2, XCircle, AlertCircle, CalendarIcon, Filter,
} from "lucide-react";
import { format, startOfWeek, addDays, differenceInMinutes, parseISO, isWithinInterval, eachDayOfInterval, isSameDay } from "date-fns";
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
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // View mode & range
  const [viewMode, setViewMode] = useState<ViewMode>("period");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  // Load pay periods
  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from("pay_periods")
      .select("id, start_date, end_date, status")
      .eq("company_id", selectedCompanyId)
      .order("start_date", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const periods = (data ?? []) as PayPeriod[];
        setPayPeriods(periods);
        // Auto-select current period
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
    setPage(1);
    setLoading(false);
  }, [selectedCompanyId, rangeStart, rangeEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build employee summary rows
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
        filteredEntries.forEach(e => {
          if (e.clock_out) {
            totalMins += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
          }
        });

        const pendingCount = empEntries.filter(e => e.status === "pending").length;
        const approvedCount = empEntries.filter(e => e.status === "approved").length;
        const rejectedCount = empEntries.filter(e => e.status === "rejected").length;
        const openCount = empEntries.filter(e => !e.clock_out).length;
        const hasIssues = rejectedCount > 0 || openCount > 0;
        const entryIds = filteredEntries.map(e => e.id);

        return {
          ...emp,
          totalMins,
          totalHours: totalMins / 60,
          pendingCount,
          approvedCount,
          rejectedCount,
          openCount,
          hasIssues,
          entryIds,
          entryCount: filteredEntries.length,
        };
      })
      .filter(r => r.entryCount > 0)
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [employees, entries, search, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const paginatedRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Pending requests count
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
      regularHours: (regularMins / 60).toFixed(2),
      breakHours: (breakMins / 60).toFixed(2),
      totalHours: (regularMins / 60).toFixed(2),
      unpaidHours: (breakMins / 60).toFixed(0),
    };
  }, [entries, statusFilter]);

  // Drawer
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
        "Full name": `${r.first_name} ${r.last_name}`,
        "Total hours": Number(formatHours(r.totalMins)),
        "Paid time off": "--",
        "Pending": r.pendingCount,
        "Approved": r.approvedCount,
        "Rejected": r.rejectedCount,
      }));
      await writeExcelFile(data, "Timesheets", `timesheets_${format(rangeStart, "yyyy-MM-dd")}.xlsx`);
      toast.success("Archivo exportado");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Error al exportar");
    }
  };

  const selectedPeriod = payPeriods.find(p => p.id === selectedPeriodId);

  const getSubmissionLabel = (row: typeof rows[0]) => {
    if (row.openCount > 0) return "Open";
    if (row.pendingCount > 0) return "Open";
    if (row.approvedCount > 0) return "Submitted";
    return "Open";
  };

  const getApprovalLabel = (row: typeof rows[0]) => {
    if (row.approvedCount === row.entryCount && row.entryCount > 0) return "Approved";
    if (row.rejectedCount > 0) return "Rejected";
    return "--";
  };

  return (
    <div className="space-y-4">
      {/* Toolbar Row 1: Search + Date navigation + Status filter */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative w-full sm:max-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="pl-9 h-9" />
        </div>

        {/* Filter icon */}
        <Button variant="outline" size="icon" className="h-9 w-9">
          <Filter className="h-4 w-4" />
        </Button>

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
            <span className="text-sm font-medium min-w-[140px] text-center">
              {format(parseISO(selectedPeriod.start_date), "MM/dd")} - {format(parseISO(selectedPeriod.end_date), "MM/dd")}
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
                  {customFrom ? format(customFrom, "MM/dd") : "From"}
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
                  {customTo ? format(customTo, "MM/dd") : "To"}
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
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue placeholder="Status filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status filter</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Pending requests */}
        {pendingRequestsTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <Badge className="bg-primary text-primary-foreground rounded-full h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              {pendingRequestsTotal}
            </Badge>
            <span className="text-sm font-medium text-primary">Pending requests</span>
          </div>
        )}

        {/* Export */}
        <Button variant="outline" size="sm" className="h-9 text-sm gap-1.5" onClick={handleExport}>
          Export <ChevronRight className="h-3 w-3 rotate-90" />
        </Button>
      </div>

      {/* KPI Summary */}
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

      {/* Bulk actions */}
      {canApprove && selectedIds.size > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{selectedIds.size} selected</Badge>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBulkApprove}>
            <CheckCircle2 className="h-3 w-3" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={handleBulkReject}>
            <XCircle className="h-3 w-3" /> Reject
          </Button>
        </div>
      )}

      {/* Data Table */}
      {loading ? (
        <PageSkeleton variant="table" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Timer} title="No timesheets for this period" description="No records found for the selected range" compact />
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
                <TableHead className="min-w-[200px]">Full name</TableHead>
                <TableHead className="text-center">Total hours</TableHead>
                <TableHead className="text-center">Total pay</TableHead>
                <TableHead className="text-center">Paid time off</TableHead>
                <TableHead className="text-center">User submission</TableHead>
                <TableHead className="text-center">Admin approval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map(row => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedEmpId(row.id)}
                >
                  {canApprove && (
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={row.entryIds.every(id => selectedIds.has(id))}
                        onCheckedChange={() => toggleEmployee(row.entryIds)}
                      />
                    </TableCell>
                  )}
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
                    <span className="font-mono font-semibold text-sm">{row.totalMins > 0 ? formatHours(row.totalMins) : "--"}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground">--</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground">--</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-[11px] font-normal rounded-full px-3 bg-muted">
                      {getSubmissionLabel(row)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {getApprovalLabel(row) === "Approved" ? (
                      <Badge variant="secondary" className="text-[11px] font-normal rounded-full px-3 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Approved
                      </Badge>
                    ) : getApprovalLabel(row) === "Rejected" ? (
                      <Badge variant="secondary" className="text-[11px] font-normal rounded-full px-3 bg-destructive/10 text-destructive">
                        Rejected
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">--</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                {canApprove && <TableCell />}
                <TableCell className="font-semibold text-xs uppercase text-muted-foreground">Totals</TableCell>
                <TableCell className="text-center">
                  <span className="font-mono font-bold text-sm text-primary">
                    {formatHours(rows.reduce((sum, r) => sum + r.totalMins, 0))}
                  </span>
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">--</TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">--</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-4">
            {/* Page numbers */}
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
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page:</span>
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
