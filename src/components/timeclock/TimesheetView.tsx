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
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Timer, Download, Upload,
  CheckCircle2, XCircle, AlertCircle, CalendarIcon, Clock, MapPin, Smartphone,
  Monitor, UserCheck, AlertTriangle, Navigation, Shield, Eye, Wifi, WifiOff,
  Users, Signal, CircleDot,
} from "lucide-react";
import { format, startOfWeek, addDays, differenceInMinutes, parseISO, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { distanceMeters, googleMapsUrl } from "@/lib/geo-helpers";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  status: string;
  source: "clock" | "import";
  import_meta?: { customer?: string; sub_job?: string; shift_hours?: number };
}

interface ClockEvent {
  id: string;
  employee_id: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string | null;
  clock_method: string;
  device: string | null;
  photo_url: string | null;
  created_at: string;
  shift_id: string | null;
  time_entry_id: string | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  employee_role?: string | null;
  phone_number?: string | null;
}

interface ShiftInfo {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name?: string;
  location_lat?: number;
  location_lng?: number;
  location_radius?: number;
  client_name?: string;
  pay_type?: string;
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

// --- GPS Status helpers ---
type GpsStatus = "verified" | "near" | "off_site" | "weak" | "missing";

function getGpsStatus(
  clockLat: number | null, clockLng: number | null, accuracy: number | null,
  siteLat?: number, siteLng?: number, siteRadius?: number
): { status: GpsStatus; distance?: number } {
  if (!clockLat || !clockLng) return { status: "missing" };
  if (accuracy && accuracy > 500) return { status: "weak" };
  if (!siteLat || !siteLng) return { status: "verified" }; // no site to compare
  const dist = distanceMeters(clockLat, clockLng, siteLat, siteLng);
  const radius = siteRadius ?? 200;
  if (dist <= radius) return { status: "verified", distance: dist };
  if (dist <= radius * 2) return { status: "near", distance: dist };
  return { status: "off_site", distance: dist };
}

// Sober GPS tones aligned with OpsStatusChip language
const GPS_CONFIG: Record<GpsStatus, { label: string; tone: OpsStatusTone; icon: typeof Shield }> = {
  verified: { label: "GPS Verified", tone: "success", icon: Shield },
  near:     { label: "Near Site",    tone: "warning", icon: Navigation },
  off_site: { label: "Off Site",     tone: "critical", icon: AlertTriangle },
  weak:     { label: "GPS Weak",     tone: "muted",   icon: WifiOff },
  missing:  { label: "No GPS",       tone: "muted",   icon: WifiOff },
};

function clockMethodLabel(method: string): string {
  switch (method) {
    case "mobile": return "App Móvil";
    case "kiosk": return "Kiosco";
    case "admin": return "Admin";
    case "import": return "Importado";
    case "qr": return "Código QR";
    default: return method || "Manual";
  }
}

function clockMethodIcon(method: string) {
  switch (method) {
    case "mobile": return <Smartphone className="h-3 w-3" />;
    case "kiosk": return <Monitor className="h-3 w-3" />;
    case "admin": return <UserCheck className="h-3 w-3" />;
    default: return <Clock className="h-3 w-3" />;
  }
}

// --- Component ---

export function TimesheetView() {
  const { role, hasModuleAccess } = useAuth();
  const { selectedCompanyId } = useCompany();
  const canApprove = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payPeriods, setPayPeriods] = useState<PayPeriod[]>([]);
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [shiftMap, setShiftMap] = useState<Map<string, ShiftInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gpsFilter, setGpsFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [exceptionFilter, setExceptionFilter] = useState<"all" | "late" | "off_site" | "missing_out" | "open">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

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

  const { rangeStart, rangeEnd } = useMemo(() => {
    let start: Date, end: Date;
    if (viewMode === "period" && selectedPeriodId) {
      const period = payPeriods.find(p => p.id === selectedPeriodId);
      if (period) { start = parseISO(period.start_date); end = parseISO(period.end_date); }
      else { start = weekStart; end = addDays(weekStart, 6); }
    } else if (viewMode === "custom" && customFrom && customTo) {
      start = customFrom; end = customTo;
    } else {
      start = weekStart; end = addDays(weekStart, 6);
    }
    return { rangeStart: start, rangeEnd: end };
  }, [viewMode, weekStart, selectedPeriodId, payPeriods, customFrom, customTo]);

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const fetchEnd = addDays(rangeEnd, 1);
    const startISO = rangeStart.toISOString();
    const endISO = fetchEnd.toISOString();

    let shiftsQuery = supabase.from("shifts")
      .select("id, employee_id, clock_in_time, clock_out_time, shift_start_date, shift_hours, customer, sub_job, period_id")
      .eq("company_id", selectedCompanyId);
    if (viewMode === "period" && selectedPeriodId) {
      shiftsQuery = shiftsQuery.eq("period_id", selectedPeriodId);
    } else {
      shiftsQuery = shiftsQuery
        .gte("shift_start_date", format(rangeStart, "yyyy-MM-dd"))
        .lte("shift_start_date", format(fetchEnd, "yyyy-MM-dd"));
    }

    const [entriesRes, shiftsRes, empsRes, clockEventsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, notes, status")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", startISO).lt("clock_in", endISO)
        .order("clock_in", { ascending: true }),
      shiftsQuery.order("shift_start_date", { ascending: true }),
      supabase.from("employees")
        .select("id, first_name, last_name, avatar_url, employee_role, phone_number")
        .eq("company_id", selectedCompanyId).eq("is_active", true).order("first_name"),
      supabase.from("clock_events")
        .select("id, employee_id, type, latitude, longitude, accuracy, address, clock_method, device, photo_url, created_at, shift_id, time_entry_id")
        .eq("company_id", selectedCompanyId)
        .gte("created_at", startISO).lt("created_at", endISO)
        .order("created_at", { ascending: true }),
    ]);

    setClockEvents((clockEventsRes.data ?? []) as ClockEvent[]);

    // Load shift details for linked time entries
    const shiftIds = [...new Set((entriesRes.data ?? []).map((e: any) => e.shift_id).filter(Boolean))];
    if (shiftIds.length > 0) {
      const { data: scheduledShifts } = await supabase
        .from("scheduled_shifts")
        .select("id, title, date, start_time, end_time, pay_type, locations(name, latitude, longitude, geofence_radius), clients(name)")
        .in("id", shiftIds);
      const sMap = new Map<string, ShiftInfo>();
      (scheduledShifts ?? []).forEach((s: any) => {
        sMap.set(s.id, {
          id: s.id, title: s.title, date: s.date,
          start_time: s.start_time, end_time: s.end_time,
          location_name: s.locations?.name, location_lat: s.locations?.latitude,
          location_lng: s.locations?.longitude, location_radius: s.locations?.geofence_radius,
          client_name: s.clients?.name, pay_type: s.pay_type,
        });
      });
      setShiftMap(sMap);
    } else {
      setShiftMap(new Map());
    }

    const clockEntries: TimeEntry[] = (entriesRes.data ?? []).map((e: any) => ({ ...e, source: "clock" as const }));
    const importedEntries: TimeEntry[] = (shiftsRes.data ?? []).map((s: any) => {
      const clockIn = s.clock_in_time || (s.shift_start_date ? `${s.shift_start_date}T08:00:00` : new Date().toISOString());
      const shiftHours = s.shift_hours ?? 0;
      const clockOut = s.clock_out_time || (shiftHours > 0 ? new Date(new Date(clockIn).getTime() + shiftHours * 3600000).toISOString() : null);
      return {
        id: `imp_${s.id}`, employee_id: s.employee_id, shift_id: null,
        clock_in: clockIn, clock_out: clockOut, break_minutes: 0,
        notes: [s.customer, s.sub_job].filter(Boolean).join(" · ") || null,
        status: "imported", source: "import" as const,
        import_meta: { customer: s.customer, sub_job: s.sub_job, shift_hours: s.shift_hours },
      } satisfies TimeEntry;
    });

    setEntries([...clockEntries, ...importedEntries]);
    setEmployees((empsRes.data ?? []) as Employee[]);
    setSelectedIds(new Set());
    setExpandedIds(new Set());
    setPage(1);
    setLoading(false);
  }, [selectedCompanyId, rangeStart, rangeEnd, viewMode, selectedPeriodId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Helper: get clock events for a time entry
  const getClockEventsForEntry = useCallback((entry: TimeEntry): { clockIn?: ClockEvent; clockOut?: ClockEvent } => {
    if (entry.source === "import") return {};
    const empEvents = clockEvents.filter(ce => ce.employee_id === entry.employee_id);
    const clockIn = empEvents.find(ce => ce.type === "clock_in" && ce.time_entry_id === entry.id)
      || empEvents.find(ce => ce.type === "clock_in" && Math.abs(new Date(ce.created_at).getTime() - new Date(entry.clock_in).getTime()) < 60000);
    const clockOut = entry.clock_out
      ? empEvents.find(ce => ce.type === "clock_out" && ce.time_entry_id === entry.id)
        || empEvents.find(ce => ce.type === "clock_out" && entry.clock_out && Math.abs(new Date(ce.created_at).getTime() - new Date(entry.clock_out).getTime()) < 60000)
      : undefined;
    return { clockIn, clockOut };
  }, [clockEvents]);

  // Build employee summary rows
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return employees
      .filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(s))
      .map(emp => {
        const empEntries = entries.filter(e => e.employee_id === emp.id);
        const filteredEntries = statusFilter === "all" ? empEntries : empEntries.filter(e => e.status === statusFilter);
        let totalMins = 0, breakMins = 0;
        filteredEntries.forEach(e => {
          if (e.source === "import" && e.import_meta?.shift_hours) totalMins += Math.round(e.import_meta.shift_hours * 60);
          else if (e.clock_out) { totalMins += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0)); breakMins += e.break_minutes ?? 0; }
        });
        const pendingCount = empEntries.filter(e => e.status === "pending").length;
        const approvedCount = empEntries.filter(e => e.status === "approved").length;
        const rejectedCount = empEntries.filter(e => e.status === "rejected").length;
        const openCount = empEntries.filter(e => !e.clock_out && e.source === "clock").length;
        const importedCount = empEntries.filter(e => e.status === "imported").length;

        // GPS analysis
        let gpsVerified = 0, gpsOffSite = 0, gpsMissing = 0;
        empEntries.filter(e => e.source === "clock").forEach(entry => {
          const { clockIn } = getClockEventsForEntry(entry);
          const shift = entry.shift_id ? shiftMap.get(entry.shift_id) : undefined;
          const { status } = getGpsStatus(clockIn?.latitude ?? null, clockIn?.longitude ?? null, clockIn?.accuracy ?? null, shift?.location_lat, shift?.location_lng, shift?.location_radius);
          if (status === "verified" || status === "near") gpsVerified++;
          else if (status === "off_site") gpsOffSite++;
          else gpsMissing++;
        });

        // Late detection
        let lateCount = 0;
        empEntries.filter(e => e.source === "clock" && e.shift_id).forEach(entry => {
          const shift = shiftMap.get(entry.shift_id!);
          if (shift) {
            const scheduled = new Date(`${shift.date}T${shift.start_time}`);
            const actual = new Date(entry.clock_in);
            if (actual > scheduled && differenceInMinutes(actual, scheduled) >= 5) lateCount++;
          }
        });

        const hasIssues = rejectedCount > 0 || openCount > 0 || gpsOffSite > 0 || lateCount > 0;
        const entryIds = filteredEntries.filter(e => e.source === "clock").map(e => e.id);

        // Daily breakdown
        const dayMap = new Map<string, TimeEntry[]>();
        filteredEntries.forEach(e => {
          const dayKey = format(new Date(e.clock_in), "yyyy-MM-dd");
          if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
          dayMap.get(dayKey)!.push(e);
        });
        const dailyBreakdown = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, dayEntries]) => {
          let dayMins = 0, dayBreakMins = 0;
          dayEntries.forEach(e => {
            if (e.source === "import" && e.import_meta?.shift_hours) dayMins += Math.round(e.import_meta.shift_hours * 60);
            else if (e.clock_out) { dayMins += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0)); dayBreakMins += e.break_minutes ?? 0; }
          });
          return { day, entries: dayEntries, totalMins: dayMins, breakMins: dayBreakMins };
        });

        return {
          ...emp, totalMins, breakMins, totalHours: totalMins / 60,
          pendingCount, approvedCount, rejectedCount, importedCount, openCount,
          hasIssues, entryIds, entryCount: filteredEntries.length, daysWorked: dayMap.size,
          dailyBreakdown, gpsVerified, gpsOffSite, gpsMissing, lateCount,
        };
      })
      .filter(r => {
        if (r.entryCount === 0) return false;
        if (gpsFilter === "verified" && r.gpsVerified === 0) return false;
        if (gpsFilter === "off_site" && r.gpsOffSite === 0) return false;
        if (gpsFilter === "missing" && r.gpsMissing === 0) return false;
        if (sourceFilter === "clock" && r.importedCount === r.entryCount) return false;
        if (sourceFilter === "import" && r.importedCount === 0) return false;
        if (exceptionFilter === "late" && r.lateCount === 0) return false;
        if (exceptionFilter === "off_site" && r.gpsOffSite === 0) return false;
        if (exceptionFilter === "open" && r.openCount === 0) return false;
        if (exceptionFilter === "missing_out") {
          // missing-out heuristic: open clock_in older than 12h
          const hasMissing = entries.some(e => e.employee_id === r.id && !e.clock_out && e.source === "clock" && differenceInMinutes(new Date(), new Date(e.clock_in)) > 720);
          if (!hasMissing) return false;
        }
        return true;
      })
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [employees, entries, search, statusFilter, gpsFilter, sourceFilter, exceptionFilter, getClockEventsForEntry, shiftMap]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const paginatedRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const pendingRequestsTotal = useMemo(() => entries.filter(e => e.status === "pending").length, [entries]);

  // KPIs
  const kpis = useMemo(() => {
    const clockOnly = entries.filter(e => e.source === "clock");
    let regularMins = 0;
    entries.forEach(e => {
      if (e.source === "import" && e.import_meta?.shift_hours) regularMins += Math.round(e.import_meta.shift_hours * 60);
      else if (e.clock_out) regularMins += Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0));
    });
    const activeNow = clockOnly.filter(e => !e.clock_out).length;
    const missingClockOut = clockOnly.filter(e => !e.clock_out && differenceInMinutes(new Date(), new Date(e.clock_in)) > 720).length;
    const needsReview = clockOnly.filter(e => e.status === "pending").length;

    // GPS stats
    let gpsTotal = 0, gpsOk = 0, gpsOff = 0, gpsMiss = 0;
    clockOnly.forEach(entry => {
      gpsTotal++;
      const empEvents = clockEvents.filter(ce => ce.employee_id === entry.employee_id && ce.type === "clock_in");
      const ce = empEvents.find(ce => ce.time_entry_id === entry.id)
        || empEvents.find(ce => Math.abs(new Date(ce.created_at).getTime() - new Date(entry.clock_in).getTime()) < 60000);
      if (!ce?.latitude) gpsMiss++;
      else {
        const shift = entry.shift_id ? shiftMap.get(entry.shift_id) : undefined;
        const { status } = getGpsStatus(ce.latitude, ce.longitude, ce.accuracy, shift?.location_lat, shift?.location_lng, shift?.location_radius);
        if (status === "verified" || status === "near") gpsOk++;
        else if (status === "off_site") gpsOff++;
        else gpsMiss++;
      }
    });

    return {
      totalHours: formatHoursDecimal(regularMins),
      employeeCount: new Set(entries.map(e => e.employee_id)).size,
      entryCount: entries.length,
      activeNow, missingClockOut, needsReview,
      gpsOk, gpsOff, gpsMiss,
    };
  }, [entries, clockEvents, shiftMap]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const batchUpdate = async (ids: string[], updates: Record<string, any>) => {
    const BATCH_SIZE = 50;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("time_entries").update(updates as any).in("id", chunk).eq("status", "pending");
      if (error) throw error;
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    try { await batchUpdate(Array.from(selectedIds), { status: "approved", approved_at: new Date().toISOString() }); toast.success(`${selectedIds.size} fichajes aprobados`); setSelectedIds(new Set()); loadData(); }
    catch (err: any) { toast.error(err.message ?? "Error al aprobar"); }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    try { await batchUpdate(Array.from(selectedIds), { status: "rejected", notes: "[Rechazado] Rechazo masivo" }); toast.success(`${selectedIds.size} fichajes rechazados`); setSelectedIds(new Set()); loadData(); }
    catch (err: any) { toast.error(err.message ?? "Error al rechazar"); }
  };

  const toggleSelectAll = () => {
    const allIds = paginatedRows.flatMap(r => r.entryIds);
    if (allIds.every(id => selectedIds.has(id))) { const next = new Set(selectedIds); allIds.forEach(id => next.delete(id)); setSelectedIds(next); }
    else setSelectedIds(new Set([...selectedIds, ...allIds]));
  };

  const toggleEmployee = (entryIds: string[]) => {
    const next = new Set(selectedIds);
    const allSelected = entryIds.every(id => next.has(id));
    entryIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
    setSelectedIds(next);
  };

  const handleExport = async () => {
    try {
      const { writeExcelFile } = await import("@/lib/safe-xlsx");
      const data = rows.map(r => ({
        "Empleado": `${r.first_name} ${r.last_name}`,
        "Días trabajados": r.daysWorked, "Horas totales": Number(formatHoursDecimal(r.totalMins)),
        "Descansos (min)": r.breakMins, "Entradas": r.entryCount,
        "Pendientes": r.pendingCount, "Aprobados": r.approvedCount,
        "GPS Verificado": r.gpsVerified, "GPS Off-site": r.gpsOffSite,
        "Tardanzas": r.lateCount,
      }));
      await writeExcelFile(data, "Timesheets", `timesheets_${format(rangeStart, "yyyy-MM-dd")}.xlsx`);
      toast.success("Archivo exportado");
    } catch { toast.error("Error al exportar"); }
  };

  const selectedPeriod = payPeriods.find(p => p.id === selectedPeriodId);

  const getStatusChip = (row: typeof rows[0]) => {
    if (row.openCount > 0) return <OpsStatusChip size="sm" tone="warning" label="Active Now" pulse />;
    if (row.importedCount > 0 && row.importedCount === row.entryCount) return <OpsStatusChip size="sm" tone="info" label="Importado" />;
    if (row.approvedCount === row.entryCount && row.entryCount > 0) return <OpsStatusChip size="sm" tone="success" label="Aprobado" />;
    if (row.rejectedCount > 0) return <OpsStatusChip size="sm" tone="critical" label="Rechazado" />;
    if (row.pendingCount > 0) return <OpsStatusChip size="sm" tone="warning" label="Pendiente" />;
    return <span className="text-xs text-muted-foreground/50">—</span>;
  };

  const getEntryStatusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle2 className="h-3.5 w-3.5 text-earning" />;
    if (status === "rejected") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    if (status === "imported") return <Upload className="h-3.5 w-3.5 text-info" />;
    return <Clock className="h-3.5 w-3.5 text-warning" />;
  };

  const colCount = canApprove ? 10 : 9;

  const hasActiveFilters = statusFilter !== "all" || gpsFilter !== "all" || sourceFilter !== "all" || exceptionFilter !== "all";

  // --- Exception aggregates for the actionable banner ---
  const exceptions = useMemo(() => {
    let late = 0, offSite = 0, missingOut = 0, open = 0;
    rows.forEach(r => {
      late += r.lateCount;
      offSite += r.gpsOffSite;
      open += r.openCount;
    });
    // missingOut = clock entries with no clock_out and >12h elapsed (kpis.missingClockOut already computed)
    missingOut = kpis.missingClockOut;
    return { late, offSite, missingOut, open };
  }, [rows, kpis.missingClockOut]);

  const hasExceptions = exceptions.late + exceptions.offSite + exceptions.missingOut + exceptions.open > 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards — sober tokens, exceptions highlighted only when > 0 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <KpiMini icon={<Users className="h-4 w-4 text-muted-foreground" />} value={kpis.employeeCount} label="Empleados" />
        <KpiMini icon={<Clock className="h-4 w-4 text-muted-foreground" />} value={kpis.totalHours + "h"} label="Hrs Totales" />
        <KpiMini icon={<Signal className={cn("h-4 w-4", kpis.activeNow > 0 ? "text-earning" : "text-muted-foreground/60")} />} value={kpis.activeNow} label="Active Now" accent={kpis.activeNow > 0 ? "earning" : undefined} />
        <KpiMini icon={<AlertTriangle className={cn("h-4 w-4", kpis.needsReview > 0 ? "text-warning" : "text-muted-foreground/60")} />} value={kpis.needsReview} label="Needs Review" accent={kpis.needsReview > 0 ? "warning" : undefined} />
        <KpiMini icon={<Shield className="h-4 w-4 text-muted-foreground" />} value={kpis.gpsOk} label="GPS Verified" />
        <KpiMini icon={<Navigation className={cn("h-4 w-4", kpis.gpsOff > 0 ? "text-destructive" : "text-muted-foreground/60")} />} value={kpis.gpsOff} label="Off Site" accent={kpis.gpsOff > 0 ? "destructive" : undefined} />
        <KpiMini icon={<WifiOff className="h-4 w-4 text-muted-foreground/60" />} value={kpis.gpsMiss} label="No GPS" />
        <KpiMini icon={<AlertCircle className={cn("h-4 w-4", kpis.missingClockOut > 0 ? "text-warning" : "text-muted-foreground/60")} />} value={kpis.missingClockOut} label="Missing Out" accent={kpis.missingClockOut > 0 ? "warning" : undefined} />
      </div>

      {/* Exceptions Banner — actionable, only when issues exist */}
      {hasExceptions && (
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Excepciones a resolver</span>
            {exceptionFilter !== "all" && (
              <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px] px-2" onClick={() => setExceptionFilter("all")}>
                Limpiar filtro
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <ExceptionPill active={exceptionFilter === "late"} count={exceptions.late} tone="warning" label="Late" onClick={() => setExceptionFilter(f => f === "late" ? "all" : "late")} />
            <ExceptionPill active={exceptionFilter === "off_site"} count={exceptions.offSite} tone="critical" label="Off-site" onClick={() => setExceptionFilter(f => f === "off_site" ? "all" : "off_site")} />
            <ExceptionPill active={exceptionFilter === "missing_out"} count={exceptions.missingOut} tone="warning" label="Missing Out" onClick={() => setExceptionFilter(f => f === "missing_out" ? "all" : "missing_out")} />
            <ExceptionPill active={exceptionFilter === "open"} count={exceptions.open} tone="info" label="Open" onClick={() => setExceptionFilter(f => f === "open" ? "all" : "open")} />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..." className="pl-9 h-9" />
        </div>

        <Select value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="period">Periodo</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {viewMode === "week" && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(d => addDays(d, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[140px] text-center">{format(weekStart, "MM/dd")} - {format(addDays(weekStart, 6), "MM/dd")}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(d => addDays(d, 7))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}

        {viewMode === "period" && selectedPeriod && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { const idx = payPeriods.findIndex(p => p.id === selectedPeriodId); if (idx < payPeriods.length - 1) setSelectedPeriodId(payPeriods[idx + 1].id); }}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[160px] text-center">{format(parseISO(selectedPeriod.start_date), "MMM dd", { locale: es })} – {format(parseISO(selectedPeriod.end_date), "MMM dd, yyyy", { locale: es })}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { const idx = payPeriods.findIndex(p => p.id === selectedPeriodId); if (idx > 0) setSelectedPeriodId(payPeriods[idx - 1].id); }}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}

        {viewMode === "custom" && (
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1.5", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5" />{customFrom ? format(customFrom, "MMM dd", { locale: es }) : "Desde"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" /></PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">–</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1.5", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5" />{customTo ? format(customTo, "MMM dd", { locale: es }) : "Hasta"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" /></PopoverContent>
            </Popover>
          </div>
        )}

        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="approved">Aprobados</SelectItem>
            <SelectItem value="rejected">Rechazados</SelectItem>
            <SelectItem value="imported">Importados</SelectItem>
          </SelectContent>
        </Select>

        <Select value={gpsFilter} onValueChange={v => { setGpsFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[120px] text-xs"><MapPin className="h-3 w-3 mr-1" /><SelectValue placeholder="GPS" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos GPS</SelectItem>
            <SelectItem value="verified">GPS Verified</SelectItem>
            <SelectItem value="off_site">Off Site</SelectItem>
            <SelectItem value="missing">No GPS</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={v => { setSourceFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[120px] text-xs"><SelectValue placeholder="Fuente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas fuentes</SelectItem>
            <SelectItem value="clock">App/Kiosco</SelectItem>
            <SelectItem value="import">Importados</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setStatusFilter("all"); setGpsFilter("all"); setSourceFilter("all"); }}>Limpiar filtros</Button>
        )}

        <div className="flex-1" />

        {pendingRequestsTotal > 0 && (
          <OpsStatusChip
            size="sm"
            tone="warning"
            label={`${pendingRequestsTotal} pendientes`}
          />
        )}

        <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={handleExport}><Download className="h-3.5 w-3.5" /> Exportar</Button>
      </div>

      {/* Bulk actions */}
      {canApprove && selectedIds.size > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{selectedIds.size} seleccionados</Badge>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBulkApprove}><CheckCircle2 className="h-3 w-3" /> Aprobar</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={handleBulkReject}><XCircle className="h-3 w-3" /> Rechazar</Button>
        </div>
      )}

      {/* Data Table */}
      {loading ? <PageSkeleton variant="table" /> : rows.length === 0 ? (
        <EmptyState icon={Timer} title="Sin timesheets" description="No hay registros para el rango seleccionado" compact />
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {canApprove && <TableHead className="w-10"><Checkbox checked={paginatedRows.length > 0 && paginatedRows.flatMap(r => r.entryIds).every(id => selectedIds.has(id))} onCheckedChange={toggleSelectAll} /></TableHead>}
                <TableHead className="w-8" />
                <TableHead className="min-w-[180px]">Empleado</TableHead>
                <TableHead className="text-center">Días</TableHead>
                <TableHead className="text-center">Horas</TableHead>
                <TableHead className="text-center hidden md:table-cell">Fichajes</TableHead>
                <TableHead className="text-center">GPS</TableHead>
                <TableHead className="text-center hidden lg:table-cell">Excepciones</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map(row => {
                const isExpanded = expandedIds.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggleExpand(row.id)}>
                      {canApprove && <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={row.entryIds.every(id => selectedIds.has(id))} onCheckedChange={() => toggleEmployee(row.entryIds)} /></TableCell>}
                      <TableCell className="px-1">{isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <EmployeeAvatar firstName={row.first_name} lastName={row.last_name} avatarUrl={row.avatar_url} size="md" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm">{row.first_name} {row.last_name}</span>
                              {row.openCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-earning animate-pulse" />}
                            </div>
                            {row.employee_role && <span className="text-[10px] text-muted-foreground">{row.employee_role}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center"><span className="font-mono text-sm tabular-nums">{row.daysWorked}</span></TableCell>
                      <TableCell className="text-center"><span className="font-mono font-semibold text-sm tabular-nums">{row.totalMins > 0 ? formatHours(row.totalMins) : "—"}</span></TableCell>
                      <TableCell className="text-center hidden md:table-cell"><span className="text-sm tabular-nums text-muted-foreground">{row.entryCount}</span></TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2 text-[10.5px] tabular-nums">
                          {row.gpsVerified > 0 && <span className="text-earning font-medium">{row.gpsVerified}<span className="ml-0.5 opacity-60">✓</span></span>}
                          {row.gpsOffSite > 0 && <span className="text-destructive font-medium">{row.gpsOffSite}<span className="ml-0.5 opacity-60">✗</span></span>}
                          {row.gpsMissing > 0 && <span className="text-muted-foreground/70">{row.gpsMissing}<span className="ml-0.5">?</span></span>}
                          {row.gpsVerified === 0 && row.gpsOffSite === 0 && row.gpsMissing === 0 && <span className="text-muted-foreground/40">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {row.lateCount > 0 && <OpsStatusChip size="sm" tone="warning" label={`${row.lateCount} Late`} />}
                          {row.openCount > 0 && <OpsStatusChip size="sm" tone="warning" label={`${row.openCount} Open`} />}
                          {row.gpsOffSite > 0 && <OpsStatusChip size="sm" tone="critical" label={`${row.gpsOffSite} Off-site`} />}
                          {!row.hasIssues && <span className="text-[10px] text-muted-foreground/40">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{getStatusChip(row)}</TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {isExpanded && row.dailyBreakdown.map(dayData => (
                      <Fragment key={dayData.day}>
                        <TableRow className="bg-muted/20 hover:bg-muted/30">
                          {canApprove && <TableCell />}
                          <TableCell />
                          <TableCell colSpan={colCount - 3} className="py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{format(parseISO(dayData.day), "EEEE, d MMM", { locale: es })}</span>
                              <span className="text-xs font-mono font-semibold">{dayData.totalMins > 0 ? formatHours(dayData.totalMins) : "--"}</span>
                            </div>
                          </TableCell>
                          <TableCell />
                        </TableRow>

                        {dayData.entries.map(entry => {
                          const isImported = entry.source === "import";
                          const duration = isImported && entry.import_meta?.shift_hours
                            ? Math.round(entry.import_meta.shift_hours * 60)
                            : entry.clock_out ? Math.max(0, differenceInMinutes(new Date(entry.clock_out), new Date(entry.clock_in)) - (entry.break_minutes ?? 0)) : 0;
                          const { clockIn: ceIn, clockOut: ceOut } = getClockEventsForEntry(entry);
                          const shift = entry.shift_id ? shiftMap.get(entry.shift_id) : undefined;
                          const gps = getGpsStatus(ceIn?.latitude ?? null, ceIn?.longitude ?? null, ceIn?.accuracy ?? null, shift?.location_lat, shift?.location_lng, shift?.location_radius);
                          const gpsConf = GPS_CONFIG[gps.status];

                          // Late detection
                          let isLate = false;
                          if (shift && !isImported) {
                            const scheduled = new Date(`${shift.date}T${shift.start_time}`);
                            isLate = differenceInMinutes(new Date(entry.clock_in), scheduled) >= 5;
                          }

                          return (
                            <TableRow key={entry.id} className="bg-muted/10 hover:bg-muted/20 border-b-0">
                              {canApprove && <TableCell onClick={e => e.stopPropagation()}>{!isImported ? <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => { const next = new Set(selectedIds); next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id); setSelectedIds(next); }} /> : null}</TableCell>}
                              <TableCell />
                              <TableCell colSpan={colCount - 3} className="py-2">
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pl-4">
                                  {isImported ? (
                                    <>
                                      <div className="flex items-center gap-1.5 text-xs"><Upload className="h-3 w-3 text-info" /><span className="font-medium text-info">{entry.import_meta?.shift_hours?.toFixed(2)}h</span></div>
                                      {entry.notes && <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{entry.notes}</span>}
                                    </>
                                  ) : (
                                    <>
                                      {/* Time */}
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <span className="text-muted-foreground">In:</span>
                                        <span className="font-mono font-medium tabular-nums">{format(new Date(entry.clock_in), "hh:mm a")}</span>
                                        {isLate && <OpsStatusChip size="sm" tone="warning" label="Late" />}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <span className="text-muted-foreground">Out:</span>
                                        {entry.clock_out
                                          ? <span className="font-mono font-medium tabular-nums">{format(new Date(entry.clock_out), "hh:mm a")}</span>
                                          : <OpsStatusChip size="sm" tone="warning" label="Active" pulse />}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <span className="text-muted-foreground">Hrs:</span>
                                        <span className="font-mono font-semibold tabular-nums">{duration > 0 ? formatHours(duration) : "—"}</span>
                                      </div>

                                      {/* Shift info */}
                                      {shift && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                          <CircleDot className="h-3 w-3 opacity-60" />
                                          <span className="truncate max-w-[120px]">{shift.title}</span>
                                          {shift.client_name && <span className="opacity-70">· {shift.client_name}</span>}
                                          {shift.location_name && <span className="opacity-70">· 📍 {shift.location_name}</span>}
                                        </div>
                                      )}

                                      {/* Clock method */}
                                      {ceIn && (
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
                                          {clockMethodIcon(ceIn.clock_method)}
                                          <span>{clockMethodLabel(ceIn.clock_method)}</span>
                                        </div>
                                      )}

                                      {/* GPS chip — sober ops tone */}
                                      <TooltipProvider delayDuration={200}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span>
                                              <OpsStatusChip
                                                size="sm"
                                                tone={gpsConf.tone}
                                                label={`${gpsConf.label}${gps.distance !== undefined ? ` · ${Math.round(gps.distance)}m` : ""}`}
                                                leading={<gpsConf.icon className="h-2.5 w-2.5" />}
                                              />
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="text-xs max-w-xs">
                                            {ceIn?.latitude ? (
                                              <div className="space-y-0.5">
                                                <p>📍 {ceIn.latitude.toFixed(5)}, {ceIn.longitude?.toFixed(5)}</p>
                                                {ceIn.accuracy && <p>Accuracy: ±{Math.round(ceIn.accuracy)}m</p>}
                                                {ceIn.address && <p>{ceIn.address}</p>}
                                                {gps.distance !== undefined && <p>Distance from site: {Math.round(gps.distance)}m</p>}
                                                <a href={googleMapsUrl(ceIn.latitude, ceIn.longitude!)} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open in Maps</a>
                                              </div>
                                            ) : <p>No GPS data available</p>}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">{getEntryStatusIcon(entry.status)}</TableCell>
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
                <TableCell className="text-center"><span className="font-mono font-bold text-xs">{new Set(rows.flatMap(r => r.dailyBreakdown.map(d => d.day))).size}d</span></TableCell>
                <TableCell className="text-center"><span className="font-mono font-bold text-sm text-primary">{formatHours(rows.reduce((sum, r) => sum + r.totalMins, 0))}</span></TableCell>
                <TableCell className="text-center text-xs hidden md:table-cell">{rows.reduce((sum, r) => sum + r.entryCount, 0)}</TableCell>
                <TableCell /><TableCell className="hidden lg:table-cell" /><TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2).map((p, idx, arr) => {
              const prev = arr[idx - 1];
              const showEllipsis = prev && p - prev > 1;
              return (
                <span key={p} className="contents">
                  {showEllipsis && <span className="text-xs text-muted-foreground px-1">…</span>}
                  <Button variant={p === page ? "default" : "ghost"} size="icon" className={cn("h-8 w-8 text-xs", p === page && "pointer-events-none")} onClick={() => setPage(p)}>{p}</Button>
                </span>
              );
            })}
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Filas:</span>
            <Select value={String(rowsPerPage)} onValueChange={v => { setRowsPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[65px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{ROWS_PER_PAGE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Mini KPI Card — sober tokens, premium ops feel ---
function KpiMini({ icon, value, label, accent }: { icon: React.ReactNode; value: string | number; label: string; accent?: "earning" | "warning" | "destructive" | "info" }) {
  return (
    <Card className="border-border/40 rounded-xl shadow-none hover:border-border/70 transition-colors">
      <CardContent className="pt-3 pb-2.5 px-3">
        <div className="flex items-center gap-2 mb-1">{icon}</div>
        <div className={cn(
          "text-xl font-bold font-mono tabular-nums leading-none",
          accent === "earning" && "text-earning",
          accent === "warning" && "text-warning",
          accent === "destructive" && "text-destructive",
          accent === "info" && "text-info",
        )}>{value}</div>
        <p className="text-[10px] text-muted-foreground/80 truncate mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
