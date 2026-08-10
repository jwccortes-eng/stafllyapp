import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import OpsFilterBanner from "@/components/ops/OpsFilterBanner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { formatDateUS } from "@/lib/date-format";
import {
  ScanEye, Users, Clock, AlertTriangle, CheckCircle2, XCircle,
  Search, CalendarIcon, ArrowUpDown, ChevronDown, Eye, Info,
} from "lucide-react";
import { format, parseISO, differenceInMinutes, isAfter, isBefore, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDeepLinkFocus } from "@/hooks/useDeepLinkFocus";
import { REVIEW_COPY } from "@/utils/reviewNavigationCopy";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

/* ─── Types ─── */

type AttendanceStatus = "scheduled" | "checked-in" | "late" | "completed" | "no-show";

interface AttendanceRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  gender: string | null;
  shiftId: string;
  shiftTitle: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  clockIn: string | null;
  clockOut: string | null;
  clockMethod: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
  timeEntryId: string | null;
}

interface AlertRow {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  employeeName: string;
  createdAt: string;
}

/* ─── Helpers ─── */

function computeStatus(
  startTime: string,
  endTime: string,
  shiftDate: string,
  clockIn: string | null,
  clockOut: string | null,
): { status: AttendanceStatus; lateMinutes: number } {
  const now = new Date();
  const shiftStart = new Date(`${shiftDate}T${startTime}`);
  const shiftEnd = new Date(`${shiftDate}T${endTime}`);

  if (clockIn && clockOut) {
    const clockInDate = parseISO(clockIn);
    const late = differenceInMinutes(clockInDate, shiftStart);
    return { status: late > 0 ? "late" : "completed", lateMinutes: Math.max(0, late) };
  }

  if (clockIn) {
    const clockInDate = parseISO(clockIn);
    const late = differenceInMinutes(clockInDate, shiftStart);
    if (late > 5) return { status: "late", lateMinutes: late };
    return { status: "checked-in", lateMinutes: 0 };
  }

  if (isAfter(now, shiftEnd)) return { status: "no-show", lateMinutes: 0 };
  return { status: "scheduled", lateMinutes: 0 };
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; icon: typeof Clock }> = {
  scheduled: { label: "Programado", color: "bg-muted text-muted-foreground", icon: Clock },
  "checked-in": { label: "Fichado", color: "bg-[hsl(var(--status-confirmed))]/10 text-[hsl(var(--status-confirmed))]", icon: CheckCircle2 },
  late: { label: "Tarde", color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]", icon: AlertTriangle },
  completed: { label: "Completado", color: "bg-[hsl(var(--status-completed))]/10 text-[hsl(var(--status-completed))]", icon: CheckCircle2 },
  "no-show": { label: "No se presentó", color: "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]", icon: XCircle },
};

function StatusPill({ status }: { status: AttendanceStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function fmtTime(t: string | null) {
  if (!t) return "—";
  try {
    return format(parseISO(t), "h:mm a");
  } catch {
    return t.slice(0, 5);
  }
}

/* ─── Main Component ─── */

export default function Attendance() {
  const { selectedCompanyId } = useCompany();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialWhen = searchParams.get("when");
  const initialFilter = searchParams.get("filter");
  // Sprint 14: honor ?date=YYYY-MM-DD from Root-Cause Explorer deep-links
  // (strict format; invalid → silent fallback to today).
  const parsedDateParam = useMemo(() => {
    const raw = searchParams.get("date");
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y, m, d] = raw.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }, [searchParams]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (parsedDateParam) return parsedDateParam;
    if (initialWhen === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    }
    return new Date();
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (initialFilter === "no-shows") return "no-show";
    if (initialFilter === "late") return "late";
    return "all";
  });
  const [opsFilterActive, setOpsFilterActive] = useState<boolean>(
    !!initialWhen || !!initialFilter,
  );
  const opsFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (initialWhen === "today") parts.push("Hoy");
    if (initialWhen === "tomorrow") parts.push("Mañana");
    if (initialFilter === "no-shows") parts.push("No-shows");
    if (initialFilter === "late") parts.push("Tardanzas");
    return parts.join(" · ") || "Filtro Ops";
  }, [initialWhen, initialFilter]);
  const clearOpsFilter = useCallback(() => {
    setStatusFilter("all");
    setSelectedDate(new Date());
    setOpsFilterActive(false);
    const next = new URLSearchParams(searchParams);
    next.delete("when");
    next.delete("filter");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [tab, setTab] = useState("live");
  const [reportRange, setReportRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().setDate(new Date().getDate() - 7)),
    to: new Date(),
  });

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // ─── Fetch shift assignments + shifts for date ───
  const { data: assignments, refetch: refetchAssignments } = useQuery({
    queryKey: ["attendance-assignments", selectedCompanyId, dateStr],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_assignments")
        .select(`
          id, employee_id, shift_id, status,
          scheduled_shifts!inner(id, title, date, start_time, end_time, clock_method, deleted_at),
          employees!inner(id, first_name, last_name, avatar_url, gender)
        `)
        .eq("company_id", selectedCompanyId!)
        .eq("scheduled_shifts.date", dateStr)
        .is("scheduled_shifts.deleted_at", null)
        .not("status", "in", '("rejected","removed")');
      if (error) throw error;
      return data as any[];
    },
  });

  // ─── Fetch time entries for date ───
  const { data: timeEntries, refetch: refetchEntries } = useQuery({
    queryKey: ["attendance-entries", selectedCompanyId, dateStr],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59`;
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, status")
        .eq("company_id", selectedCompanyId!)
        .gte("clock_in", dayStart)
        .lte("clock_in", dayEnd);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ─── Fetch clock events for method info ───
  const { data: clockEvents } = useQuery({
    queryKey: ["attendance-clock-events", selectedCompanyId, dateStr],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59`;
      const { data, error } = await supabase
        .from("clock_events")
        .select("id, employee_id, shift_id, clock_method, type, photo_url, created_at")
        .eq("company_id", selectedCompanyId!)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .eq("type", "clock_in");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ─── Fetch alerts ───
  const { data: alerts } = useQuery({
    queryKey: ["attendance-alerts", selectedCompanyId, dateStr],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59`;
      const { data, error } = await supabase
        .from("clock_alerts")
        .select("id, type, severity, description, employee_id, created_at, resolved_at, employees!inner(first_name, last_name)")
        .eq("company_id", selectedCompanyId!)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .is("resolved_at", null);
      if (error) throw error;
      return (data ?? []).map((a: any) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        description: a.description,
        employeeName: `${a.employees.first_name} ${a.employees.last_name}`,
        createdAt: a.created_at,
      })) as AlertRow[];
    },
  });

  // ─── Realtime subscriptions ───
  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel("attendance-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `company_id=eq.${selectedCompanyId}` }, () => {
        refetchEntries();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_alerts", filter: `company_id=eq.${selectedCompanyId}` }, () => {
        refetchAssignments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCompanyId, refetchEntries, refetchAssignments]);

  // ─── Build attendance rows ───
  const rows: AttendanceRow[] = useMemo(() => {
    if (!assignments) return [];
    const entryMap = new Map<string, typeof timeEntries extends (infer U)[] | undefined ? U : never>();
    (timeEntries ?? []).forEach((te) => {
      const key = `${te.employee_id}__${te.shift_id ?? ""}`;
      entryMap.set(key, te);
    });

    const eventMap = new Map<string, any>();
    (clockEvents ?? []).forEach((ce) => {
      const key = `${ce.employee_id}__${ce.shift_id ?? ""}`;
      if (!eventMap.has(key)) eventMap.set(key, ce);
    });

    return assignments.map((a: any) => {
      const shift = a.scheduled_shifts;
      const emp = a.employees;
      const entryKey = `${a.employee_id}__${a.shift_id}`;
      const entry = entryMap.get(entryKey);
      const event = eventMap.get(entryKey);

      const { status, lateMinutes } = computeStatus(
        shift.start_time,
        shift.end_time,
        shift.date,
        entry?.clock_in ?? null,
        entry?.clock_out ?? null,
      );

      return {
        employeeId: a.employee_id,
        firstName: emp.first_name,
        lastName: emp.last_name,
        avatarUrl: emp.avatar_url,
        gender: emp.gender,
        shiftId: a.shift_id,
        shiftTitle: shift.title,
        shiftDate: shift.date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        clockIn: entry?.clock_in ?? null,
        clockOut: entry?.clock_out ?? null,
        clockMethod: event?.clock_method ?? null,
        status,
        lateMinutes,
        timeEntryId: entry?.id ?? null,
      };
    });
  }, [assignments, timeEntries, clockEvents]);

  // ─── Sprint 14: Root-Cause Explorer focus (time_entry / employee) ───
  const dateStrView = format(selectedDate, "yyyy-MM-dd");
  const isViewingToday = dateStrView === format(new Date(), "yyyy-MM-dd");
  const loadedEntryIds = useMemo(
    () => rows.map(r => r.timeEntryId).filter((x): x is string => !!x),
    [rows],
  );
  const loadedEmployeeIds = useMemo(() => rows.map(r => r.employeeId), [rows]);
  const loadingRows = !assignments || !timeEntries;
  const { focusId: focusEntryId, present: entryPresent } = useDeepLinkFocus({
    param: "time_entry", attribute: "entry",
    loading: loadingRows, loadedIds: loadedEntryIds,
  });
  const { focusId: focusEmployeeId, present: employeePresent } = useDeepLinkFocus({
    param: "employee", attribute: "employee",
    loading: loadingRows, loadedIds: loadedEmployeeIds,
  });
  const hasReviewFocus = !!focusEntryId || !!focusEmployeeId || !!parsedDateParam;
  const clearDateFocus = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("date");
    setSearchParams(next, { replace: true });
    setSelectedDate(new Date());
  }, [searchParams, setSearchParams]);

  // ─── Sprint 21: Optional local "focus on employee" filter ───
  // 100% client-side over rows already loaded. No new queries. No URL writes.
  // Only offered when the focused employee is actually present in the loaded
  // day; disabled by default (explicit opt-in via chip).
  const [focusEmployeeFilter, setFocusEmployeeFilter] = useState(false);
  const canFilterByFocusedEmployee = !!focusEmployeeId && employeePresent;
  // Reset filter when the focused employee changes or disappears.
  useEffect(() => {
    if (!canFilterByFocusedEmployee) setFocusEmployeeFilter(false);
  }, [canFilterByFocusedEmployee, focusEmployeeId]);
  const focusedEmployeeName = useMemo(() => {
    if (!focusEmployeeId) return null;
    const r = rows.find((row) => row.employeeId === focusEmployeeId);
    return r ? `${r.firstName} ${r.lastName}`.trim() : null;
  }, [rows, focusEmployeeId]);


  // ─── Filter rows ───
  const filteredRows = useMemo(() => {
    let r = rows;
    if (focusEmployeeFilter && focusEmployeeId) {
      r = r.filter((row) => row.employeeId === focusEmployeeId);
    }
    if (statusFilter !== "all") r = r.filter((row) => row.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((row) => `${row.firstName} ${row.lastName}`.toLowerCase().includes(q) || row.shiftTitle.toLowerCase().includes(q));
    }
    return r;
  }, [rows, statusFilter, search, focusEmployeeFilter, focusEmployeeId]);

  // ─── KPI counts ───
  const kpis = useMemo(() => {
    const counts = { scheduled: 0, checkedIn: 0, late: 0, noShow: 0, completed: 0 };
    rows.forEach((r) => {
      if (r.status === "scheduled") counts.scheduled++;
      else if (r.status === "checked-in") counts.checkedIn++;
      else if (r.status === "late") counts.late++;
      else if (r.status === "no-show") counts.noShow++;
      else if (r.status === "completed") counts.completed++;
    });
    return { ...counts, total: rows.length };
  }, [rows]);

  // ─── Reports data ───
  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["attendance-report", selectedCompanyId, format(reportRange.from, "yyyy-MM-dd"), format(reportRange.to, "yyyy-MM-dd")],
    enabled: !!selectedCompanyId && tab === "reports",
    queryFn: async () => {
      const fromStr = format(reportRange.from, "yyyy-MM-dd");
      const toStr = format(reportRange.to, "yyyy-MM-dd");

      // Get all assignments in range
      const { data: rangeAssignments, error: e1 } = await supabase
        .from("shift_assignments")
        .select(`
          employee_id, shift_id, status,
          scheduled_shifts!inner(date, start_time, end_time, title, deleted_at),
          employees!inner(first_name, last_name)
        `)
        .eq("company_id", selectedCompanyId!)
        .gte("scheduled_shifts.date", fromStr)
        .lte("scheduled_shifts.date", toStr)
        .is("scheduled_shifts.deleted_at", null)
        .not("status", "in", '("rejected","removed")');
      if (e1) throw e1;

      // Get time entries in range
      const { data: rangeEntries, error: e2 } = await supabase
        .from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes")
        .eq("company_id", selectedCompanyId!)
        .gte("clock_in", `${fromStr}T00:00:00`)
        .lte("clock_in", `${toStr}T23:59:59`);
      if (e2) throw e2;

      // Build employee stats
      const statsMap = new Map<string, {
        name: string;
        totalShifts: number;
        onTime: number;
        lateCount: number;
        totalLateMinutes: number;
        noShowCount: number;
        totalHours: number;
      }>();

      const entryByKey = new Map<string, any>();
      (rangeEntries ?? []).forEach((te) => {
        entryByKey.set(`${te.employee_id}__${te.shift_id}`, te);
      });

      (rangeAssignments ?? []).forEach((a: any) => {
        const shift = a.scheduled_shifts;
        const emp = a.employees;
        const empKey = a.employee_id;
        if (!statsMap.has(empKey)) {
          statsMap.set(empKey, {
            name: `${emp.first_name} ${emp.last_name}`,
            totalShifts: 0, onTime: 0, lateCount: 0, totalLateMinutes: 0, noShowCount: 0, totalHours: 0,
          });
        }
        const s = statsMap.get(empKey)!;
        s.totalShifts++;

        const entry = entryByKey.get(`${a.employee_id}__${a.shift_id}`);
        if (!entry) {
          const shiftEnd = new Date(`${shift.date}T${shift.end_time}`);
          if (isBefore(shiftEnd, new Date())) s.noShowCount++;
          return;
        }

        const shiftStart = new Date(`${shift.date}T${shift.start_time}`);
        const clockInDate = parseISO(entry.clock_in);
        const lateMins = differenceInMinutes(clockInDate, shiftStart);
        if (lateMins > 5) {
          s.lateCount++;
          s.totalLateMinutes += lateMins;
        } else {
          s.onTime++;
        }

        if (entry.clock_out) {
          const hours = differenceInMinutes(parseISO(entry.clock_out), clockInDate) / 60 - (entry.break_minutes ?? 0) / 60;
          s.totalHours += Math.max(0, hours);
        }
      });

      return Array.from(statsMap.entries()).map(([id, s]) => ({
        employeeId: id,
        ...s,
        attendanceScore: s.totalShifts > 0 ? Math.round((s.onTime / s.totalShifts) * 100) : 0,
        totalHours: Math.round(s.totalHours * 100) / 100,
      }));
    },
  });

  // ─── CSV export ───
  const handleExportCSV = useCallback((): string[][] => {
    if (!reportData) return [["Sin datos"]];
    return [
      ["Empleado", "Turnos", "A tiempo", "Tardes", "Min. tarde", "No-show", "Horas", "Score %"],
      ...reportData.map((r) => [
        r.name, String(r.totalShifts), String(r.onTime), String(r.lateCount),
        String(r.totalLateMinutes), String(r.noShowCount), r.totalHours.toFixed(1), `${r.attendanceScore}%`,
      ]),
    ];
  }, [reportData]);

  return (
    <OperationalWorkspace
      title="Asistencia"
      className="max-w-[1400px] mx-auto"
      search={
        tab === "live" ? (
          <WorkspaceSearch
            value={search}
            onChange={setSearch}
            placeholder="Buscar trabajador o servicio…"
          />
        ) : undefined
      }
      action={
        tab === "live" ? (
          <div className="w-[150px]">
            <SmartDateInput
              value={format(selectedDate, "yyyy-MM-dd")}
              onChange={(iso) => {
                if (!iso) return;
                const [y, m, d] = iso.split("-").map(Number);
                setSelectedDate(new Date(y, m - 1, d));
              }}
              allowClear={false}
              inputClassName="h-8 text-xs"
              aria-label="Filtrar por fecha"
            />
          </div>
        ) : undefined
      }
      tabs={
        <WorkspaceTabs
          items={[
            { key: "live", label: "En vivo" },
            { key: "reports", label: "Reportes" },
          ]}
          value={tab}
          onChange={(k) => setTab(k)}
          ariaLabel="Vista de asistencia"
        />
      }
      metrics={
        tab === "live"
          ? [
              {
                label: "Faltan por fichar",
                value: Math.max(kpis.total - kpis.checkedIn - kpis.completed - kpis.noShow, 0),
                tone: "primary" as const,
                onClick: () => setStatusFilter("scheduled"),
                active: statusFilter === "scheduled",
              },
              {
                label: "Tarde",
                value: kpis.late,
                tone: "warning" as const,
                onClick: () => setStatusFilter("late"),
                active: statusFilter === "late",
              },
              {
                label: "No-show",
                value: kpis.noShow,
                tone: "critical" as const,
                onClick: () => setStatusFilter("no-show"),
                active: statusFilter === "no-show",
              },
              ...(statusFilter !== "all"
                ? [{ label: "Ver todos", value: kpis.total, onClick: () => setStatusFilter("all") }]
                : []),
            ]
          : undefined
      }
    >
      <OpsFilterBanner
        active={opsFilterActive}
        label={opsFilterLabel}
        onClear={clearOpsFilter}
      />

      {(hasReviewFocus || !isViewingToday) && (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-3.5 py-2.5 text-xs flex items-start gap-2 mb-3",
            entryPresent || employeePresent || (!focusEntryId && !focusEmployeeId && !isViewingToday)
              ? "border-primary/40 bg-primary/5 text-primary"
              : (focusEntryId && !entryPresent) || (focusEmployeeId && !employeePresent)
              ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
              : "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          <span className="mt-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-current shrink-0" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="font-semibold">
              {entryPresent || employeePresent
                ? REVIEW_COPY.bannerFromReview
                : (focusEntryId && !entryPresent) || (focusEmployeeId && !employeePresent)
                ? REVIEW_COPY.notFoundInRange
                : !isViewingToday
                ? REVIEW_COPY.viewingHistoricalDay
                : REVIEW_COPY.bannerFromReview}
            </div>
            <div className="text-[11px] opacity-80 truncate">
              Día <span className="font-mono">{dateStrView}</span>
              {!isViewingToday && <> · {REVIEW_COPY.viewingHistoricalDay.toLowerCase()}</>}
            </div>
          </div>
          {!isViewingToday && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 shrink-0" onClick={clearDateFocus}>
              {REVIEW_COPY.backToToday}
            </Button>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        {/* ─── Live Tab ─── */}
        <TabsContent value="live" className="space-y-4 mt-0">


          {/* Alerts banner */}
          {(alerts?.length ?? 0) > 0 && (
            <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/[0.04]">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--warning))]">
                  <AlertTriangle className="h-4 w-4" />
                  {alerts!.length} alerta{alerts!.length > 1 ? "s" : ""} activa{alerts!.length > 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="space-y-1.5">
                  {alerts!.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px] uppercase">{a.type.replace(/_/g, " ")}</Badge>
                      <span className="font-medium">{a.employeeName}</span>
                      <span className="text-muted-foreground">{a.description || fmtTime(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Foco de empleado (deep-link). Sin filtros administrativos extra. */}
          {(canFilterByFocusedEmployee || focusEmployeeFilter) && (
            <div className="flex items-center gap-2 flex-wrap">
              {canFilterByFocusedEmployee && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 pl-2.5 pr-1 py-0.5 text-[11px] text-primary max-w-full">
                  <span className="font-semibold shrink-0">Empleado enfocado</span>
                  {focusedEmployeeName && (
                    <span className="text-muted-foreground truncate max-w-[140px]">· {focusedEmployeeName}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 shrink-0"
                    onClick={() => setFocusEmployeeFilter(!focusEmployeeFilter)}
                  >
                    {focusEmployeeFilter ? "Mostrar todos" : "Filtrar por empleado"}
                  </Button>
                </div>
              )}
              {focusEmployeeFilter && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3 shrink-0" />
                  {REVIEW_COPY.localFilterNoteAttendance}
                </span>
              )}
            </div>
          )}

          {/* Lista por persona — quién debía llegar, quién fichó, quién falta. */}
          {filteredRows.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-card py-12 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "No hay turnos programados para este día."
                : "Ningún fichaje coincide con los filtros."}
            </div>
          ) : (
            <div className="max-w-4xl rounded-xl border border-border/50 bg-card overflow-hidden divide-y divide-border/20">
              {filteredRows.map((row) => {
                const isFocused =
                  (!!focusEntryId && row.timeEntryId === focusEntryId) ||
                  (!focusEntryId && !!focusEmployeeId && row.employeeId === focusEmployeeId);

                const tone: EntityStatusTone =
                  row.status === "no-show"
                    ? "blocked"
                    : row.status === "late"
                      ? "attention"
                      : row.status === "completed"
                        ? "historical"
                        : row.status === "checked-in"
                          ? "operational"
                          : "assigned";

                const badges: EntityBadgeSpec[] = [];
                if (row.lateMinutes > 0) {
                  badges.push({ key: "late", label: `${row.lateMinutes} min tarde`, tone: "warning" });
                }
                if (row.status === "no-show") {
                  badges.push({ key: "ns", label: "No-show", tone: "critical" });
                }

                return (
                  <div
                    key={`${row.employeeId}-${row.shiftId}`}
                    data-entry-id={row.timeEntryId ?? undefined}
                    data-employee-id={row.employeeId}
                    className={cn(isFocused && "bg-primary/5 border-l-2 border-primary scroll-mt-24")}
                  >
                    <EntityCard
                      bare
                      density="compact"
                      kind="worker"
                      entityId={row.employeeId}
                      name={`${row.firstName} ${row.lastName}`}
                      avatarUrl={row.avatarUrl}
                      status={tone}
                      badges={badges}
                      maxBadges={2}
                      primaryDetail={
                        <>
                          {row.shiftTitle} · {row.startTime.slice(0, 5)}–{row.endTime.slice(0, 5)}
                        </>
                      }
                      actions={
                        <div className="flex items-center gap-3">
                          <span className="hidden sm:block text-[11px] tabular-nums text-muted-foreground text-right leading-tight">
                            <span className="block">In {fmtTime(row.clockIn)}</span>
                            <span className="block">Out {fmtTime(row.clockOut)}</span>
                          </span>
                          <StatusPill status={row.status} />
                        </div>
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}

        </TabsContent>

        {/* ─── Reports Tab ─── */}
        <TabsContent value="reports" className="space-y-5 mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {formatDateUS(reportRange.from)} – {formatDateUS(reportRange.to)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: reportRange.from, to: reportRange.to }}
                  onSelect={(r) => {
                    if (r?.from) setReportRange({ from: r.from, to: r.to ?? r.from });
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            <ReportActionsBar title="Reporte de Asistencia" subtitle={`${formatDateUS(reportRange.from)} - ${formatDateUS(reportRange.to)}`} onExportCSV={handleExportCSV} />
          </div>

          {/* Report KPIs */}
          {reportData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                value={reportData.reduce((a, r) => a + r.totalShifts, 0)}
                label="Total turnos asignados"
                accent="primary"
              />
              <KpiCard
                value={reportData.reduce((a, r) => a + r.lateCount, 0)}
                label="Llegadas tarde"
                accent="warning"
              />
              <KpiCard
                value={reportData.reduce((a, r) => a + r.noShowCount, 0)}
                label="No-shows"
                accent="deduction"
              />
              <KpiCard
                value={`${reportData.reduce((a, r) => a + r.totalHours, 0).toFixed(0)}h`}
                label="Horas trabajadas"
                accent="earning"
              />
            </div>
          )}

          {/* Report Table */}
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Trabajador</TableHead>
                    <TableHead className="text-center">{ADMIN_LEX.EntityPlural}</TableHead>
                    <TableHead className="text-center">A tiempo</TableHead>
                    <TableHead className="text-center">Tardes</TableHead>
                    <TableHead className="text-center">Min. tarde</TableHead>
                    <TableHead className="text-center">No-show</TableHead>
                    <TableHead className="text-center">Horas</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Cargando…</TableCell>
                    </TableRow>
                  ) : !reportData || reportData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Sin datos para el rango seleccionado</TableCell>
                    </TableRow>
                  ) : (
                    reportData
                      .sort((a, b) => b.totalLateMinutes - a.totalLateMinutes)
                      .map((r) => (
                        <TableRow key={r.employeeId}>
                          <TableCell className="text-sm font-medium">{r.name}</TableCell>
                          <TableCell className="text-center text-sm">{r.totalShifts}</TableCell>
                          <TableCell className="text-center text-sm text-[hsl(var(--status-confirmed))]">{r.onTime}</TableCell>
                          <TableCell className="text-center text-sm text-[hsl(var(--warning))]">{r.lateCount}</TableCell>
                          <TableCell className="text-center text-sm font-semibold text-[hsl(var(--warning))]">{r.totalLateMinutes}</TableCell>
                          <TableCell className="text-center text-sm text-[hsl(var(--destructive))]">{r.noShowCount}</TableCell>
                          <TableCell className="text-center text-sm">{r.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-center">
                            <span className={cn(
                              "text-sm font-bold",
                              r.attendanceScore >= 90 ? "text-[hsl(var(--status-confirmed))]" :
                              r.attendanceScore >= 70 ? "text-[hsl(var(--warning))]" :
                              "text-[hsl(var(--destructive))]"
                            )}>
                              {r.attendanceScore}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </OperationalWorkspace>

  );
}
