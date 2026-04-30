/**
 * TimeClockCommandView — premium read-only command panel for /app/timeclock.
 *
 * Sections (in order):
 *  1. KPI row (clocked-in now, open entries, missing clock-out, late, today entries)
 *  2. Needs Attention (open entries > N hours, no clock-out, no shift match)
 *  3. Live Now (compact list of currently clocked-in workers)
 *
 * Strictly read-only:
 *  - No writes
 *  - No payroll math
 *  - No scheduled-hours-as-pay assumptions
 *  - All queries scoped by selectedCompanyId
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  Clock, AlertTriangle, Users, Activity, CalendarClock, CheckCircle2,
  Search, RefreshCw, ChevronRight, MapPin,
} from "lucide-react";
import { format, differenceInMinutes, formatDistanceToNowStrict } from "date-fns";
import { enUS } from "date-fns/locale";
import StaflyCalmProcessingBanner from "@/components/common/StaflyCalmProcessingBanner";
import { cn } from "@/lib/utils";

// ─── threshold for "open too long" ─────────────────────────
const OPEN_ENTRY_WARN_HOURS = 12;

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number | null;
  status: string | null;
  scheduled_shifts?: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  employee_role: string | null;
  employer_identification: number | string | null;
}

export default function TimeClockCommandView() {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [search, setSearch] = useState("");
  const [, setSelectedEmpId] = useState<string | null>(null);

  // live tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const todayKey = format(now, "yyyy-MM-dd");

  const load = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const startOfDay = `${todayKey}T00:00:00`;
    const endOfDay = `${todayKey}T23:59:59`;

    // 1) employees scoped to company
    const empsP = supabase
      .from("employees")
      .select("id, first_name, last_name, avatar_url, employee_role, employer_identification")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true);

    // 2) today's entries
    const entriesTodayP = supabase
      .from("time_entries")
      .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, scheduled_shifts(id, title, start_time, end_time)")
      .eq("company_id", selectedCompanyId)
      .gte("clock_in", startOfDay)
      .lte("clock_in", endOfDay)
      .order("clock_in", { ascending: false });

    // 3) any still-open entry (could be from yesterday)
    const openOlderP = supabase
      .from("time_entries")
      .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, scheduled_shifts(id, title, start_time, end_time)")
      .eq("company_id", selectedCompanyId)
      .is("clock_out", null)
      .lt("clock_in", startOfDay);

    const [empsRes, entriesRes, openOlderRes] = await Promise.all([empsP, entriesTodayP, openOlderP]);
    setEmployees(((empsRes.data ?? []) as unknown) as Employee[]);

    // merge: today's entries + open ones from before today
    const merged = [
      ...((entriesRes.data ?? []) as TimeEntry[]),
      ...((openOlderRes.data ?? []) as TimeEntry[]),
    ];
    // dedupe by id
    const byId = new Map<string, TimeEntry>();
    merged.forEach((e) => byId.set(e.id, e));
    setEntries(Array.from(byId.values()));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, todayKey]);

  // ─── derived ─────────────────────────────────────────────
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const openEntries = useMemo(() => entries.filter((e) => !e.clock_out), [entries]);
  const closedTodayEntries = useMemo(() => entries.filter((e) => !!e.clock_out), [entries]);

  const liveRows = useMemo(() => {
    return openEntries
      .map((e) => {
        const emp = empMap.get(e.employee_id);
        if (!emp) return null;
        const minutes = differenceInMinutes(now, new Date(e.clock_in));
        return { entry: e, employee: emp, minutes };
      })
      .filter((x): x is { entry: TimeEntry; employee: Employee; minutes: number } => !!x)
      .sort((a, b) => b.minutes - a.minutes);
  }, [openEntries, empMap, now]);

  const needsAttention = useMemo(() => {
    const issues: { type: "long_open" | "no_shift" | "stale_open"; entry: TimeEntry; employee: Employee; minutes: number; reason: string }[] = [];
    liveRows.forEach((r) => {
      const hours = r.minutes / 60;
      if (hours >= 24) {
        issues.push({ ...r, type: "stale_open", reason: `Open clock for ${Math.round(hours)}h — likely missing clock-out` });
      } else if (hours >= OPEN_ENTRY_WARN_HOURS) {
        issues.push({ ...r, type: "long_open", reason: `Long open clock — ${Math.round(hours)}h` });
      } else if (!r.entry.shift_id && !r.entry.scheduled_shifts) {
        issues.push({ ...r, type: "no_shift", reason: "Open clock not linked to a scheduled shift" });
      }
    });
    return issues;
  }, [liveRows]);

  const filteredLive = useMemo(() => {
    if (!search.trim()) return liveRows;
    const q = search.trim().toLowerCase();
    return liveRows.filter((r) => {
      const name = `${r.employee.first_name} ${r.employee.last_name}`.toLowerCase();
      return (
        name.includes(q) ||
        (r.employee.employee_role ?? "").toLowerCase().includes(q) ||
        String(r.employee.employer_identification ?? "").includes(q)
      );
    });
  }, [liveRows, search]);

  const kpis = useMemo(() => {
    const lateOrReview = entries.filter((e) => (e.status ?? "").toLowerCase().includes("review") || (e.status ?? "").toLowerCase().includes("late")).length;
    return {
      clockedIn: openEntries.length,
      missingClockOut: needsAttention.filter((x) => x.type === "stale_open").length,
      lateReview: lateOrReview,
      todayEntries: entries.length,
      closedToday: closedTodayEntries.length,
    };
  }, [openEntries, needsAttention, entries, closedTodayEntries]);

  // ─── render ──────────────────────────────────────────────
  if (!selectedCompanyId) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        Select a company to load attendance.
      </div>
    );
  }

  if (loading && entries.length === 0) {
    return (
      <StaflyCalmProcessingBanner
        title="Sincronizando asistencia"
        message="Estamos organizando el estado del reloj en tiempo real. Todo está bien."
        footerNote="Solo lectura · No modificamos time entries."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* ─── KPI Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon={Activity} tone="primary" label="Clocked in now" value={kpis.clockedIn} />
        <KpiCard icon={Clock} tone="muted" label="Open entries" value={openEntries.length} />
        <KpiCard
          icon={AlertTriangle}
          tone={kpis.missingClockOut > 0 ? "danger" : "muted"}
          label="Missing clock-out"
          value={kpis.missingClockOut}
        />
        <KpiCard
          icon={CalendarClock}
          tone={kpis.lateReview > 0 ? "warning" : "muted"}
          label="Needs review"
          value={kpis.lateReview}
        />
        <KpiCard icon={Users} tone="muted" label="Today entries" value={kpis.todayEntries} />
      </div>

      {/* ─── Needs Attention ───────────────────────────────── */}
      <Card className="border border-border/60 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center",
              needsAttention.length > 0 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"
            )}>
              {needsAttention.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold tracking-tight">Needs attention</h3>
              <p className="text-xs text-muted-foreground">
                {needsAttention.length > 0
                  ? `${needsAttention.length} item${needsAttention.length === 1 ? "" : "s"} to review`
                  : "All clear · no open issues right now"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        {needsAttention.length === 0 ? (
          <EmptyClear />
        ) : (
          <ul className="divide-y divide-border/40">
            {needsAttention.slice(0, 8).map((item) => (
              <li
                key={item.entry.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 cursor-pointer transition"
                onClick={() => setSelectedEmpId(item.employee.id)}
              >
                <EmployeeAvatar
                  avatarUrl={item.employee.avatar_url}
                  firstName={item.employee.first_name}
                  lastName={item.employee.last_name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">
                      {item.employee.first_name} {item.employee.last_name}
                    </span>
                    {item.employee.employer_identification != null && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        #{item.employee.employer_identification}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{item.reason}</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    item.type === "stale_open"
                      ? "bg-rose-500/10 text-rose-700 border-rose-500/30"
                      : item.type === "long_open"
                      ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                      : "bg-sky-500/10 text-sky-700 border-sky-500/30",
                  )}
                >
                  {item.type === "stale_open" ? "Stale" : item.type === "long_open" ? "Long" : "No shift"}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ─── Live Now ──────────────────────────────────────── */}
      <Card className="border border-border/60 rounded-2xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold tracking-tight">Live now</h3>
              <p className="text-xs text-muted-foreground">
                {liveRows.length} worker{liveRows.length === 1 ? "" : "s"} currently clocked in
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search worker, role, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
        {filteredLive.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {liveRows.length === 0 ? "No one is clocked in right now." : "No matches for your search."}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {filteredLive.map((r) => {
              const sched = r.entry.scheduled_shifts;
              return (
                <li
                  key={r.entry.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 cursor-pointer transition"
                  onClick={() => setSelectedEmpId(r.employee.id)}
                >
                  <EmployeeAvatar
                    avatarUrl={r.employee.avatar_url}
                    firstName={r.employee.first_name}
                    lastName={r.employee.last_name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">
                        {r.employee.first_name} {r.employee.last_name}
                      </span>
                      {r.employee.employee_role && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                          · {r.employee.employee_role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Since {format(new Date(r.entry.clock_in), "p", { locale: enUS })}
                      </span>
                      {sched && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3" />
                          {sched.title}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums">
                      {formatDuration(r.minutes)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      elapsed
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Read-only · Time clock can show scheduled shift as context but never as payment.
      </p>

    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────
function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone?: "primary" | "muted" | "warning" | "danger";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "warning"
      ? "bg-amber-500/10 text-amber-600"
      : tone === "danger"
      ? "bg-rose-500/10 text-rose-600"
      : "bg-muted text-muted-foreground";
  return (
    <Card className="rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-2.5">
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", toneCls)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
          <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function EmptyClear() {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold">Todo está en calma</p>
      <p className="text-xs text-muted-foreground">No hay entradas abiertas que requieran atención.</p>
    </div>
  );
}
