import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Clock, CalendarRange, SlidersHorizontal, Search, Users, AlertTriangle,
  ChevronLeft, ChevronRight, Phone, Settings, MoreHorizontal, Loader2,
  CalendarDays, X, Eye, MapPin, Activity, UserCheck, UserX,
} from "lucide-react";
import {
  format, parseISO, isWithinInterval, addDays, differenceInMinutes,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  TraceabilitySnapshot,
  classifyTimeEntrySource,
  type TraceRisk,
  type TraceTimelineEvent,
  type TraceLinkedRecord,
} from "@/components/traceability/TraceabilitySnapshot";

/**
 * MobileTimeClockView — /app/timeclock mobile.
 * Frontend-only, READ-ONLY for mutations. Self-contained queries scoped by
 * selectedCompanyId. Does NOT touch payroll/attendance/time_entries writes.
 *
 * Tabs: Today (live attendance) and Timesheets (period totals per worker).
 * Payroll always uses real time_entries — this view only displays them.
 */

type TabKey = "today" | "timesheets";
type TodayFilter = "all" | "active" | "scheduled" | "missing" | "review";

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone_number: string | null;
  employee_role: string | null;
}

interface TimeEntryRow {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number | null;
  status: string | null;
  // Traceability (read-only) — present in time_entries schema
  shift_id?: string | null;
  entry_source?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
}

interface ScheduledInfo {
  title: string | null;
  start_time: string;
  end_time: string;
  client_name?: string;
  location_name?: string;
}

interface PayPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string | null;
}

const TODAY_FILTERS: { key: TodayFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "scheduled", label: "Scheduled" },
  { key: "missing", label: "Missing out" },
  { key: "review", label: "Needs review" },
];

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "HH:mm"); } catch { return "—"; }
}
function fmtTimeShort(t: string) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}
function fmtHours(mins: number) {
  if (!mins || mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function initials(e: { first_name: string; last_name: string }) {
  return ((e.first_name?.[0] ?? "") + (e.last_name?.[0] ?? "")).toUpperCase() || "·";
}

export default function MobileTimeClockView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId, selectedCompany } = useCompany();

  const initialTab = (searchParams.get("tab") as TabKey) || "today";
  const [tab, setTab] = useState<TabKey>(initialTab === "timesheets" ? "timesheets" : "today");

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+72px)] bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">Time Clock</h1>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {selectedCompany?.name ?? "All companies"} · {format(new Date(), "EEE MMM d", { locale: enUS })}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost" size="icon" className="h-9 w-9 rounded-xl"
              onClick={() => toast("Open settings from desktop")}
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">Reports</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate("/app/discrepancies")} className="gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Discrepancies
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/reports")} className="gap-2 text-sm">
                  <CalendarRange className="h-4 w-4" />
                  All reports
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/import-timeclock")} className="gap-2 text-sm">
                  <CalendarRange className="h-4 w-4" />
                  Import hours
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs (pills) */}
        <div className="flex items-center gap-1.5">
          {[
            { key: "today" as TabKey, label: "Today", Icon: Clock },
            { key: "timesheets" as TabKey, label: "Timesheets", Icon: CalendarRange },
          ].map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full text-sm font-medium transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted active:scale-[0.97]"
                )}
              >
                <t.Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "today"
        ? <TodayPanel companyId={selectedCompanyId} />
        : <TimesheetsPanel companyId={selectedCompanyId} />
      }
    </div>
  );
}

/* ─────────────────────────── Today Panel ─────────────────────────── */

function TodayPanel({ companyId }: { companyId: string | null }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [scheduledMap, setScheduledMap] = useState<Record<string, ScheduledInfo>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TodayFilter>("all");

  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!companyId) {
      setEmployees([]); setEntries([]); setScheduledMap({}); setLoading(false);
      return;
    }
    setLoading(true);
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    const [empsRes, entriesRes, shiftsRes] = await Promise.all([
      supabase.from("employees")
        .select("id, first_name, last_name, avatar_url, phone_number, employee_role")
        .eq("company_id", companyId).eq("is_active", true).order("first_name"),
      supabase.from("time_entries")
        .select("id, employee_id, clock_in, clock_out, break_minutes, status")
        .eq("company_id", companyId)
        .gte("clock_in", startOfDay).lte("clock_in", endOfDay)
        .order("clock_in", { ascending: false }),
      supabase.from("shift_assignments")
        .select("employee_id, scheduled_shifts(id, title, date, start_time, end_time, locations(name), clients(name))")
        .eq("company_id", companyId).eq("status", "confirmed"),
    ]);

    setEmployees((empsRes.data ?? []) as EmployeeRow[]);
    setEntries((entriesRes.data ?? []) as TimeEntryRow[]);

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
  }, [companyId, today]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    return employees.map(emp => {
      const empEntries = entries.filter(en => en.employee_id === emp.id);
      const activeEntry = empEntries.find(en => !en.clock_out) ?? null;
      const completed = empEntries.filter(en => !!en.clock_out);

      let totalMin = 0;
      for (const en of completed) {
        totalMin += Math.max(0, differenceInMinutes(parseISO(en.clock_out!), parseISO(en.clock_in)) - (en.break_minutes ?? 0));
      }
      if (activeEntry) {
        totalMin += Math.max(0, differenceInMinutes(now, parseISO(activeEntry.clock_in)) - (activeEntry.break_minutes ?? 0));
      }

      const scheduled = scheduledMap[emp.id];
      const isActive = !!activeEntry;
      const hasShift = !!scheduled;

      // Heuristics (read-only signals)
      const scheduledStartedAlready = (() => {
        if (!scheduled) return false;
        const [h, m] = scheduled.start_time.split(":").map(Number);
        const startDate = new Date(); startDate.setHours(h, m, 0, 0);
        return now > startDate;
      })();
      const isMissingOut = hasShift && scheduledStartedAlready && !isActive && completed.length === 0;
      const needsReview =
        empEntries.some(en => en.status === "needs_review") ||
        (activeEntry && differenceInMinutes(now, parseISO(activeEntry.clock_in)) > 16 * 60); // >16h open shift

      return {
        emp, activeEntry, completed, scheduled,
        totalMin, isActive, hasShift, isMissingOut, needsReview: !!needsReview,
      };
    });
  }, [employees, entries, scheduledMap, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => {
        if (q) {
          const name = `${r.emp.first_name} ${r.emp.last_name}`.toLowerCase();
          if (!name.includes(q)) return false;
        }
        switch (filter) {
          case "active": return r.isActive;
          case "scheduled": return r.hasShift;
          case "missing": return r.isMissingOut;
          case "review": return r.needsReview;
          default: return true;
        }
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.hasShift !== b.hasShift) return a.hasShift ? -1 : 1;
        return a.emp.first_name.localeCompare(b.emp.first_name);
      });
  }, [rows, search, filter]);

  const summary = useMemo(() => {
    const activeNow = rows.filter(r => r.isActive).length;
    const scheduled = rows.filter(r => r.hasShift).length;
    const total = rows.length;
    const review = rows.filter(r => r.needsReview || r.isMissingOut).length;
    return { activeNow, scheduled, total, review };
  }, [rows]);

  const filterCounts = useMemo(() => ({
    all: rows.length,
    active: rows.filter(r => r.isActive).length,
    scheduled: rows.filter(r => r.hasShift).length,
    missing: rows.filter(r => r.isMissingOut).length,
    review: rows.filter(r => r.needsReview).length,
  }), [rows]);

  return (
    <div className="px-4 pt-3">
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard label="Active" value={summary.activeNow} accent="good" />
        <SummaryCard label="Scheduled" value={summary.scheduled} />
        <SummaryCard label="Workers" value={summary.total} />
        <SummaryCard label="Review" value={summary.review} accent={summary.review > 0 ? "bad" : undefined} />
      </div>

      {/* Search */}
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar empleado…"
          className="h-11 pl-9 rounded-xl text-sm"
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 mt-3 overflow-x-auto -mx-4 px-4 scrollbar-none">
        {TODAY_FILTERS.map(f => {
          const active = filter === f.key;
          const count = filterCounts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              <span>{f.label}</span>
              {count > 0 && (
                <span className={cn(
                  "h-[18px] min-w-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-foreground"
                )}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="No workers match" hint="Adjust filters or search to see more" />
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map(r => (
              <WorkerTile key={r.emp.id} row={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkerTile({ row }: { row: ReturnType<typeof useTodayRows> extends infer T ? any : any }) {
  const { emp, activeEntry, scheduled, totalMin, isActive, hasShift, isMissingOut, needsReview } = row;
  const phone = emp.phone_number?.trim();

  const status = isActive ? "active"
    : isMissingOut ? "missing"
    : needsReview ? "review"
    : hasShift ? "scheduled"
    : "offline";

  const statusMap: Record<string, { label: string; cls: string; dot: string }> = {
    active:    { label: "Active now",  cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
    missing:   { label: "Missing out", cls: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400", dot: "bg-rose-500" },
    review:    { label: "Needs review", cls: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
    scheduled: { label: "Scheduled",   cls: "border-border bg-muted/30 text-foreground/80", dot: "bg-blue-500" },
    offline:   { label: "Offline",     cls: "border-border bg-muted/20 text-muted-foreground", dot: "bg-muted-foreground/40" },
  };
  const s = statusMap[status];

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3 shadow-sm flex flex-col">
      <div className="flex items-start gap-2.5 mb-2">
        <Avatar className="h-10 w-10 shrink-0">
          {emp.avatar_url ? <AvatarImage src={emp.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-xs font-semibold bg-muted">{initials(emp)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight line-clamp-2">
            {emp.first_name} {emp.last_name}
          </div>
          {emp.employee_role && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">{emp.employee_role}</div>
          )}
        </div>
      </div>

      <div className={cn("inline-flex items-center gap-1.5 self-start text-[11px] font-medium px-2 h-6 rounded-md border mb-2", s.cls)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, isActive && "animate-pulse")} />
        {s.label}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {isActive && activeEntry && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            <span>In {fmtTime(activeEntry.clock_in)} · {fmtHours(totalMin)}</span>
          </div>
        )}
        {!isActive && scheduled && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span>{fmtTimeShort(scheduled.start_time)}–{fmtTimeShort(scheduled.end_time)}</span>
          </div>
        )}
        {scheduled?.client_name && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{scheduled.client_name}</span>
          </div>
        )}
        {!isActive && !scheduled && (
          <div className="text-[11px]">No activity today</div>
        )}
      </div>

      {phone && (
        <a
          href={`tel:${phone}`}
          className="mt-2.5 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 active:scale-95 transition"
        >
          <Phone className="h-3.5 w-3.5" />
          Call
        </a>
      )}
    </div>
  );
}

// Helper just to satisfy TS for WorkerTile prop typing without exposing internals
function useTodayRows() { return [] as any[]; }

/* ───────────────────────── Timesheets Panel ───────────────────────── */

interface TimesheetWorkerRow {
  emp: EmployeeRow;
  totalMin: number;
  daysWorked: number;
  entriesCount: number;
  openEntries: number;
  needsReview: number;
}

function TimesheetsPanel({ companyId }: { companyId: string | null }) {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reviewWorker, setReviewWorker] = useState<TimesheetWorkerRow | null>(null);

  // Load pay_periods
  useEffect(() => {
    if (!companyId) { setPeriods([]); return; }
    supabase.from("pay_periods")
      .select("id, start_date, end_date, status")
      .eq("company_id", companyId)
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        const ps = (data ?? []) as PayPeriod[];
        setPeriods(ps);
        // Find current period (today inside range), else first
        const now = new Date();
        const idx = ps.findIndex(p =>
          isWithinInterval(now, { start: parseISO(p.start_date), end: parseISO(p.end_date) })
        );
        setPeriodIdx(idx >= 0 ? idx : 0);
      });
  }, [companyId]);

  const period = periods[periodIdx];

  // Load entries + employees for selected period
  useEffect(() => {
    if (!companyId || !period) {
      setEmployees([]); setEntries([]); setLoading(false); return;
    }
    setLoading(true);
    const startISO = `${period.start_date}T00:00:00`;
    const endISO = `${period.end_date}T23:59:59`;
    Promise.all([
      supabase.from("employees")
        .select("id, first_name, last_name, avatar_url, phone_number, employee_role")
        .eq("company_id", companyId).eq("is_active", true).order("first_name"),
      supabase.from("time_entries")
        .select("id, employee_id, clock_in, clock_out, break_minutes, status, shift_id, entry_source, approved_by, approved_at, created_at")
        .eq("company_id", companyId)
        .gte("clock_in", startISO).lte("clock_in", endISO)
        .order("clock_in", { ascending: true }),
    ]).then(([empsRes, entriesRes]) => {
      setEmployees((empsRes.data ?? []) as EmployeeRow[]);
      setEntries((entriesRes.data ?? []) as TimeEntryRow[]);
      setLoading(false);
    });
  }, [companyId, period?.id]);

  const workerRows: TimesheetWorkerRow[] = useMemo(() => {
    return employees.map(emp => {
      const empEntries = entries.filter(en => en.employee_id === emp.id);
      let totalMin = 0;
      const days = new Set<string>();
      let openEntries = 0;
      let needsReview = 0;
      for (const en of empEntries) {
        if (en.clock_out) {
          totalMin += Math.max(0, differenceInMinutes(parseISO(en.clock_out), parseISO(en.clock_in)) - (en.break_minutes ?? 0));
        } else {
          openEntries++;
        }
        if (en.status === "needs_review") needsReview++;
        try { days.add(format(parseISO(en.clock_in), "yyyy-MM-dd")); } catch {}
      }
      return {
        emp, totalMin, daysWorked: days.size,
        entriesCount: empEntries.length, openEntries, needsReview,
      };
    }).filter(r => r.entriesCount > 0);
  }, [employees, entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workerRows
      .filter(r => !q || `${r.emp.first_name} ${r.emp.last_name}`.toLowerCase().includes(q))
      .sort((a, b) => b.totalMin - a.totalMin);
  }, [workerRows, search]);

  const summary = useMemo(() => {
    const totalMin = workerRows.reduce((s, r) => s + r.totalMin, 0);
    const daysWorked = workerRows.reduce((s, r) => s + r.daysWorked, 0);
    const avgPerDay = daysWorked > 0 ? totalMin / daysWorked : 0;
    const review = workerRows.reduce((s, r) => s + r.needsReview + r.openEntries, 0);
    return { totalMin, daysWorked, avgPerDay, review };
  }, [workerRows]);

  return (
    <div className="px-4 pt-3">
      {/* Period selector */}
      <div className="flex items-center gap-2 mb-3">
        <Button
          variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0"
          disabled={periodIdx >= periods.length - 1}
          onClick={() => setPeriodIdx(i => Math.min(i + 1, periods.length - 1))}
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 h-10 rounded-xl border border-border/60 bg-card flex items-center justify-center px-3">
          {period ? (
            <div className="text-center min-w-0">
              <div className="text-sm font-semibold tracking-tight truncate">
                {format(parseISO(period.start_date), "MMM d", { locale: enUS })} – {format(parseISO(period.end_date), "MMM d, yyyy", { locale: enUS })}
              </div>
              {period.status && (
                <div className="text-[10px] text-muted-foreground capitalize leading-none mt-0.5">{period.status}</div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No periods</span>
          )}
        </div>
        <Button
          variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0"
          disabled={periodIdx <= 0}
          onClick={() => setPeriodIdx(i => Math.max(i - 1, 0))}
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard label="Hours" value={Math.round(summary.totalMin / 60)} />
        <SummaryCard label="Days" value={summary.daysWorked} />
        <SummaryCard label="Avg/day" value={`${(summary.avgPerDay / 60).toFixed(1)}h`} />
        <SummaryCard label="Review" value={summary.review} accent={summary.review > 0 ? "bad" : undefined} />
      </div>

      {/* Search */}
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar empleado…"
          className="h-11 pl-9 rounded-xl text-sm"
        />
      </div>

      {/* List */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No timesheets" hint="No worked entries in this period" />
        ) : (
          filtered.map(r => (
            <TimesheetRow key={r.emp.id} row={r} onReview={() => setReviewWorker(r)} />
          ))
        )}
      </div>

      {/* Review sheet */}
      <ReviewSheet
        open={!!reviewWorker}
        onOpenChange={(o) => !o && setReviewWorker(null)}
        row={reviewWorker}
        period={period}
        entries={reviewWorker ? entries.filter(en => en.employee_id === reviewWorker.emp.id) : []}
      />
    </div>
  );
}

function TimesheetRow({ row, onReview }: { row: TimesheetWorkerRow; onReview: () => void }) {
  const issues = row.openEntries + row.needsReview;
  const status = issues > 0
    ? { label: "Needs review", cls: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400" }
    : { label: "Ready", cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" };

  return (
    <div
      role="button" tabIndex={0}
      onClick={onReview}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onReview(); } }}
      className="w-full text-left rounded-2xl border border-border/50 bg-card p-3.5 shadow-sm cursor-pointer active:scale-[0.99] hover:border-border transition-all"
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11 shrink-0">
          {row.emp.avatar_url ? <AvatarImage src={row.emp.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-xs font-semibold bg-muted">{initials(row.emp)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold truncate">
              {row.emp.first_name} {row.emp.last_name}
            </div>
            <div className="text-base font-mono font-semibold tabular-nums tracking-tight">
              {fmtHours(row.totalMin)}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="text-xs text-muted-foreground">
              {row.daysWorked} day{row.daysWorked === 1 ? "" : "s"} · {row.entriesCount} {row.entriesCount === 1 ? "entry" : "entries"}
            </div>
            <span className={cn("inline-flex items-center text-[11px] font-medium px-1.5 h-5 rounded-md border", status.cls)}>
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {issues > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {row.openEntries > 0 && <span>{row.openEntries} open</span>}
          {row.openEntries > 0 && row.needsReview > 0 && <span>·</span>}
          {row.needsReview > 0 && <span>{row.needsReview} flagged</span>}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Review Sheet (read-only) ───────────────────────── */

function ReviewSheet({
  open, onOpenChange, row, period, entries,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: TimesheetWorkerRow | null;
  period: PayPeriod | undefined;
  entries: TimeEntryRow[];
}) {
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    const map = new Map<string, TimeEntryRow[]>();
    for (const en of entries) {
      let key = "";
      try { key = format(parseISO(en.clock_in), "yyyy-MM-dd"); } catch {}
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(en);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  if (!row) return null;

  const summary = `${row.emp.first_name} ${row.emp.last_name} · ${period ? `${format(parseISO(period.start_date), "MMM d")}–${format(parseISO(period.end_date), "MMM d")}` : ""} · ${fmtHours(row.totalMin)} · ${row.daysWorked} days`;

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(summary); toast.success("Summary copied"); }
    catch { toast.error("Couldn't copy"); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-3xl flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight leading-tight truncate">
                {row.emp.first_name} {row.emp.last_name}
              </h2>
              {period && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {format(parseISO(period.start_date), "MMM d", { locale: enUS })} – {format(parseISO(period.end_date), "MMM d, yyyy", { locale: enUS })}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <SummaryCard label="Hours" value={fmtHours(row.totalMin)} />
            <SummaryCard label="Days" value={row.daysWorked} />
            <SummaryCard label="Issues" value={row.openEntries + row.needsReview} accent={(row.openEntries + row.needsReview) > 0 ? "bad" : undefined} />
          </div>
        </div>

        {/* Day-by-day list */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4 space-y-2.5">
          {grouped.length === 0 ? (
            <EmptyState icon={CalendarRange} title="No entries" hint="No time entries in this period" />
          ) : grouped.map(([day, list]) => {
            const dayMin = list.reduce((s, en) => {
              if (!en.clock_out) return s;
              return s + Math.max(0, differenceInMinutes(parseISO(en.clock_out), parseISO(en.clock_in)) - (en.break_minutes ?? 0));
            }, 0);
            return (
              <div key={day} className="rounded-2xl border border-border/50 bg-card p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">
                    {(() => { try { return format(parseISO(day), "EEE, MMM d", { locale: enUS }); } catch { return day; } })()}
                  </div>
                  <div className="text-sm font-mono font-semibold tabular-nums">{fmtHours(dayMin)}</div>
                </div>
                <div className="space-y-2">
                  {list.map(en => (
                    <EntryTraceRow key={en.id} en={en} period={period} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] border-t border-border/40 bg-background/95 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 rounded-xl text-sm font-medium" onClick={handleCopy}>
            Copy summary
          </Button>
          <Button
            className="h-11 rounded-xl text-sm font-semibold"
            onClick={() => { onOpenChange(false); toast("Open from desktop for full review"); }}
          >
            Open full review
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────────────────── Shared ───────────────────────── */

function SummaryCard({ label, value, accent }: { label: string; value: number | string; accent?: "good" | "warn" | "bad" }) {
  const cls =
    accent === "good" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "warn" ? "text-amber-600 dark:text-amber-400" :
    accent === "bad"  ? "text-rose-600 dark:text-rose-400" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-card px-2.5 py-3 text-center shadow-sm">
      <div className={cn("text-xl font-semibold tabular-nums leading-none", cls)}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1.5 font-medium">{label}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">{hint}</p>
    </div>
  );
}
