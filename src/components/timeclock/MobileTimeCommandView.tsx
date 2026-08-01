/**
 * MobileTimeCommandView — Mobile-only Time operations.
 *
 * Compact KPI strip + two primary modes:
 *  - Today / Live  (clocked-in workers, scheduled, missing, alerts)
 *  - Week          (per-worker rollup)
 *
 * Read-only. No payroll math. No writes. Time alerts open an action sheet
 * (Call / WhatsApp / Review in Time) — never navigate directly to worker profile.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OpsFilterBanner from "@/components/ops/OpsFilterBanner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  Clock, AlertTriangle, Activity, CalendarClock, CheckCircle2,
  RefreshCw, ChevronRight, MapPin, Phone, MessageCircle, ClipboardCheck,
  CalendarDays, Users,
} from "lucide-react";
import { format, differenceInMinutes, startOfWeek, endOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTimeClockFocus } from "@/hooks/useTimeClockFocus";
import { REVIEW_COPY } from "@/utils/reviewNavigationCopy";
import { MT, MT_EYEBROW, TAP_ICON, TAP_CHIP, FOCUS_RING } from "@/lib/mobile/mobile-scale";
import { StatusBadge } from "@/components/ui/status-badge";

const OPEN_ENTRY_WARN_HOURS = 12;
const OPEN_ENTRY_STALE_HOURS = 24;
const VERY_LONG_ENTRY_HOURS = 16;

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
  phone_number: string | null;
}

type AlertType = "stale_open" | "long_open" | "no_shift" | "very_long" | "needs_review";

interface AlertItem {
  type: AlertType;
  entry: TimeEntry;
  employee: Employee;
  minutes: number;
  reason: string;
}

type Mode = "today" | "week";

export default function MobileTimeCommandView() {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [scheduledToday, setScheduledToday] = useState<{ id: string; employee_id: string; shift_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [mode, setMode] = useState<Mode>("today");
  const [alertDetail, setAlertDetail] = useState<AlertItem | null>(null);

  // Sprint 5: hydrate mobile view from Ops Cockpit deep-link query params.
  // Supported: ?when=today|tomorrow, ?filter=open|stale|needs-review
  // Mobile has only two modes (today/week); "tomorrow" gracefully documents
  // via banner. Filters do NOT rewrite queries — they surface a banner and
  // steer the operator toward the alerts / live sections already visible.
  const filterParam = searchParams.get("filter");
  const whenParam = searchParams.get("when");
  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (whenParam === "today") parts.push("Hoy");
    else if (whenParam === "tomorrow") parts.push("Mañana (no soportado en móvil — mostrando hoy)");
    if (filterParam === "open") parts.push("Fichajes abiertos");
    else if (filterParam === "stale") parts.push("Alertas · fichajes largos");
    else if (filterParam === "needs-review") parts.push("Requieren revisión");
    return parts.join(" · ");
  }, [filterParam, whenParam]);
  const hasOpsFilter = Boolean(filterLabel);

  useEffect(() => {
    if (whenParam === "tomorrow") return; // mobile shows today; banner documents
    if (filterParam === "open" || filterParam === "stale" || filterParam === "needs-review") {
      setMode("today");
    }
  }, [filterParam, whenParam]);

  const clearOpsFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    next.delete("when");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Clear selected alert when tenant or tab changes so a stale worker/incidence
  // never lingers on screen after context switch.
  useEffect(() => { setAlertDetail(null); }, [selectedCompanyId, mode]);

  // ─── Sprint 13: historical date loader from ?date=YYYY-MM-DD ───
  const dateParam = searchParams.get("date");
  const parsedDateParam = useMemo(() => {
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return null;
    const d = new Date(`${dateParam}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }, [dateParam]);
  const viewDate = useMemo(() => {
    if (parsedDateParam) {
      const d = new Date(parsedDateParam);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return now;
  }, [parsedDateParam, now]);
  const todayKey = format(viewDate, "yyyy-MM-dd");
  const isToday = todayKey === format(now, "yyyy-MM-dd");

  const load = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const startOfDay = `${todayKey}T00:00:00`;
    const endOfDay = `${todayKey}T23:59:59`;
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString();

    const [empsRes, entriesRes, openOlderRes, weekRes, schedRes] = await Promise.all([
      supabase.from("employees")
        .select("id, first_name, last_name, avatar_url, employee_role, employer_identification, phone_number")
        .eq("company_id", selectedCompanyId).eq("is_active", true),
      supabase.from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, scheduled_shifts(id, title, start_time, end_time)")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", startOfDay).lte("clock_in", endOfDay)
        .order("clock_in", { ascending: false }),
      supabase.from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, scheduled_shifts(id, title, start_time, end_time)")
        .eq("company_id", selectedCompanyId)
        .is("clock_out", null).lt("clock_in", startOfDay),
      supabase.from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", weekStart).lte("clock_in", weekEnd),
      supabase.from("shift_assignments")
        .select("id, employee_id, shift_id, status, scheduled_shifts!inner(date)")
        .eq("company_id", selectedCompanyId)
        .eq("scheduled_shifts.date", todayKey)
        .neq("status", "rejected"),
    ]);

    setEmployees(((empsRes.data ?? []) as unknown) as Employee[]);
    const merged = [
      ...((entriesRes.data ?? []) as TimeEntry[]),
      ...((openOlderRes.data ?? []) as TimeEntry[]),
    ];
    const byId = new Map<string, TimeEntry>();
    merged.forEach(e => byId.set(e.id, e));
    setEntries(Array.from(byId.values()));
    setWeekEntries(((weekRes.data ?? []) as unknown) as TimeEntry[]);
    setScheduledToday(((schedRes.data ?? []) as any[]).map(r => ({
      id: r.id, employee_id: r.employee_id, shift_id: r.shift_id,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedCompanyId, todayKey]);

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const openEntries = useMemo(() => entries.filter(e => !e.clock_out), [entries]);
  const closedTodayEntries = useMemo(() => entries.filter(e => !!e.clock_out), [entries]);

  const liveRows = useMemo(() => {
    return openEntries
      .map(e => {
        const emp = empMap.get(e.employee_id);
        if (!emp) return null;
        const minutes = differenceInMinutes(now, new Date(e.clock_in));
        return { entry: e, employee: emp, minutes };
      })
      .filter((x): x is { entry: TimeEntry; employee: Employee; minutes: number } => !!x)
      .sort((a, b) => b.minutes - a.minutes);
  }, [openEntries, empMap, now]);

  const alerts = useMemo<AlertItem[]>(() => {
    const issues: AlertItem[] = [];
    if (isToday) {
      liveRows.forEach(r => {
        const hours = r.minutes / 60;
        if (hours >= OPEN_ENTRY_STALE_HOURS) {
          issues.push({ ...r, type: "stale_open", reason: `Fichaje abierto desde hace ${Math.round(hours)}h — posiblemente falta salida` });
        } else if (hours >= OPEN_ENTRY_WARN_HOURS) {
          issues.push({ ...r, type: "long_open", reason: `Fichaje abierto largo — ${Math.round(hours)}h` });
        } else if (!r.entry.shift_id && !r.entry.scheduled_shifts) {
          issues.push({ ...r, type: "no_shift", reason: "Fichaje sin turno programado vinculado" });
        }
      });
    }
    closedTodayEntries.forEach(e => {
      const emp = empMap.get(e.employee_id);
      if (!emp) return;
      const minutes = differenceInMinutes(new Date(e.clock_out!), new Date(e.clock_in));
      if (minutes / 60 >= VERY_LONG_ENTRY_HOURS) {
        issues.push({ type: "very_long", entry: e, employee: emp, minutes, reason: `Fichaje muy largo — ${Math.round(minutes / 60)}h` });
      }
      const status = (e.status ?? "").toLowerCase();
      if (status.includes("review") || status.includes("pending") || status.includes("late")) {
        issues.push({ type: "needs_review", entry: e, employee: emp, minutes, reason: `Estado: ${e.status}` });
      }
    });
    return issues;
  }, [liveRows, closedTodayEntries, empMap, isToday]);

  const clockedEmpIds = useMemo(() => new Set(openEntries.map(e => e.employee_id)), [openEntries]);
  const closedEmpIds = useMemo(() => new Set(closedTodayEntries.map(e => e.employee_id)), [closedTodayEntries]);
  const scheduledEmpIds = useMemo(() => new Set(scheduledToday.map(s => s.employee_id)), [scheduledToday]);

  const missing = useMemo(() => {
    return scheduledToday
      .filter(s => !clockedEmpIds.has(s.employee_id) && !closedEmpIds.has(s.employee_id))
      .map(s => empMap.get(s.employee_id))
      .filter((x): x is Employee => !!x);
  }, [scheduledToday, clockedEmpIds, closedEmpIds, empMap]);

  const kpis = {
    scheduled: scheduledEmpIds.size,
    clockedIn: openEntries.length,
    missing: missing.length,
    openClocks: openEntries.length,
    needsReview: alerts.length,
  };

  const weekRollup = useMemo(() => {
    const map = new Map<string, { employee: Employee; trackedMin: number; openCount: number; entries: number }>();
    weekEntries.forEach(e => {
      const emp = empMap.get(e.employee_id);
      if (!emp) return;
      let row = map.get(emp.id);
      if (!row) {
        row = { employee: emp, trackedMin: 0, openCount: 0, entries: 0 };
        map.set(emp.id, row);
      }
      row.entries += 1;
      if (e.clock_out) {
        row.trackedMin += differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0);
      } else {
        row.openCount += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.trackedMin - a.trackedMin);
  }, [weekEntries, empMap]);

  // ─── Sprint 12/36: Root-Cause Explorer + Shift Ops deep-link focus ───
  const loadedEntryIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const focusEntriesInput = useMemo(
    () => entries.map((e) => ({ id: e.id, employee_id: e.employee_id, shift_id: e.shift_id })),
    [entries],
  );
  const {
    focusEntryId, focusDate, focusShiftId, focusEmployeeId,
    entryPresent, hasFocus, originFromShiftOps, missingEntry,
  } = useTimeClockFocus({ loading, loadedEntryIds, entries: focusEntriesInput });

  useEffect(() => {
    if (focusEntryId || originFromShiftOps) setMode("today");
  }, [focusEntryId, originFromShiftOps]);


  if (!selectedCompanyId) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        Selecciona una empresa para cargar la asistencia.
      </div>
    );
  }

  if (loading && entries.length === 0) {
    return <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>;
  }

  return (
    <div className="space-y-4">
      <OpsFilterBanner
        active={hasOpsFilter}
        label={filterLabel}
        onClear={clearOpsFilter}
      />
      {originFromShiftOps && (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-3 py-2 text-[12px] flex items-start gap-2",
            missingEntry
              ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
              : "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          <span className="mt-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-current shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              Caso abierto desde Shift Ops. Revisa evidencia antes de cualquier corrección.
            </div>
            {missingEntry && (
              <div className="opacity-90 mt-0.5">
                Sin fichaje registrado — validar con evidencia.
              </div>
            )}
            <div className="opacity-80 truncate mt-0.5">
              {focusEmployeeId && (
                <>trabajador <code className="font-mono">{focusEmployeeId.slice(0, 8)}</code></>
              )}
              {focusShiftId && (
                <> · turno <code className="font-mono">{focusShiftId.slice(0, 8)}</code></>
              )}
            </div>
          </div>
        </div>
      )}
      {(hasFocus || !isToday) && (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-3 py-2 text-[12px] flex items-start gap-2",
            entryPresent || (!focusEntryId && !isToday)
              ? "border-primary/40 bg-primary/5 text-primary"
              : focusEntryId && !entryPresent
              ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
              : "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          <span className="mt-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-current shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {entryPresent
                ? REVIEW_COPY.bannerFromReview
                : focusEntryId
                ? REVIEW_COPY.notFoundInRange
                : !isToday
                ? REVIEW_COPY.viewingHistoricalDay
                : REVIEW_COPY.bannerFromReview}
            </div>
            <div className="opacity-80 truncate">
              Día <span className="font-mono">{todayKey}</span>
              {!isToday && <> · {REVIEW_COPY.viewingHistoricalDay.toLowerCase()}</>}
              {focusEntryId && <> · <code className="font-mono">{focusEntryId.slice(0, 8)}</code></>}
              {focusShiftId && <> · turno <code className="font-mono">{focusShiftId.slice(0, 8)}</code></>}
            </div>
            <div className="text-[12px] opacity-70 mt-0.5">{REVIEW_COPY.readOnlyNote}</div>
          </div>
          {!isToday && (
            <button
              type="button"
              className="text-[12px] font-semibold underline shrink-0"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("date");
                setSearchParams(next, { replace: true });
              }}
            >
              Hoy
            </button>
          )}
        </div>
      )}


      {/* Compact KPI strip — single row, scrollable on narrow */}
      <div className="grid grid-cols-5 gap-1.5">
        <Kpi label="Programados" value={kpis.scheduled} />
        <Kpi label="Fichados" value={kpis.clockedIn} tone="primary" />
        <Kpi label="Faltan" value={kpis.missing} tone={kpis.missing > 0 ? "danger" : "muted"} />
        <Kpi label="Abiertos" value={kpis.openClocks} />
        <Kpi label="Revisar" value={kpis.needsReview} tone={kpis.needsReview > 0 ? "warn" : "muted"} />
      </div>

      {/* Mode pills */}
      <div className="flex gap-1.5">
        <ModePill active={mode === "today"} onClick={() => setMode("today")} label="Hoy / En vivo" />
        <ModePill active={mode === "week"} onClick={() => setMode("week")} label="Semana" />
        <Button variant="ghost" size="icon" className={cn("h-11 w-11 ml-auto", FOCUS_RING)} onClick={load} aria-label="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Alerts (compact) */}
      {alerts.length > 0 && (
        <Card className="rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <div className="px-3.5 py-2.5 flex items-center gap-2 border-b border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {alerts.slice(0, 5).map(a => (
              <AlertRow key={`${a.type}-${a.entry.id}`} item={a} focused={focusEntryId === a.entry.id} onOpen={() => setAlertDetail(a)} />
            ))}
          </ul>
        </Card>
      )}

      {mode === "today" ? (
        <TodayView
          live={liveRows}
          missing={missing}
          closedToday={closedTodayEntries.length}
        />
      ) : (
        <WeekView rollup={weekRollup} />
      )}

      <p className="text-[12px] text-muted-foreground text-center">
        Solo lectura · Las horas programadas son contexto operativo — la nómina se calcula con fichajes reales.
      </p>

      <AlertDetailSheet
        item={alertDetail}
        onClose={() => setAlertDetail(null)}
        onReviewInTime={() => {
          setAlertDetail(null);
          // Land on full Time review screen on desktop.
          navigate("/app/reports");
        }}
        onOpenWorker={(id) => {
          setAlertDetail(null);
          navigate(`/app/people/${id}`);
        }}
      />
    </div>
  );
}

/* ───── subviews ───── */

function TodayView({ live, missing, closedToday }: {
  live: { entry: TimeEntry; employee: Employee; minutes: number }[];
  missing: Employee[];
  closedToday: number;
}) {
  return (
    <div className="space-y-3">
      <Section title="Fichados ahora" count={live.length} icon={Activity} tone="primary">
        {live.length === 0 ? (
          <Empty text="Nadie está fichado en este momento." />
        ) : (
          <ul className="divide-y divide-border/40">
            {live.map(r => (
              <li key={r.entry.id} data-entry-id={r.entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <EmployeeAvatar
                  avatarUrl={r.employee.avatar_url}
                  firstName={r.employee.first_name}
                  lastName={r.employee.last_name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {r.employee.first_name} {r.employee.last_name}
                  </div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    Desde {format(new Date(r.entry.clock_in), "p", { locale: enUS })}
                    {r.entry.scheduled_shifts && (
                      <> · <MapPin className="inline h-3 w-3" /> {r.entry.scheduled_shifts.title}</>
                    )}
                  </div>
                </div>
                <ContactButtons phone={r.employee.phone_number} />
                <div className="text-right ml-1">
                  <div className="text-xs font-bold tabular-nums">{formatDuration(r.minutes)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Programados sin llegar" count={missing.length} icon={AlertTriangle} tone={missing.length > 0 ? "danger" : "muted"}>
        {missing.length === 0 ? (
          <Empty text="Todo el equipo programado ya está fichado." />
        ) : (
          <ul className="divide-y divide-border/40">
            {missing.map(e => (
              <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <EmployeeAvatar avatarUrl={e.avatar_url} firstName={e.first_name} lastName={e.last_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{e.first_name} {e.last_name}</div>
                  <div className="text-[12px] text-muted-foreground">Programado hoy · sin fichaje</div>
                </div>
                <ContactButtons phone={e.phone_number} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="text-xs text-muted-foreground text-center pt-1">
        {closedToday} {closedToday === 1 ? "fichaje cerrado" : "fichajes cerrados"} hoy
      </div>
    </div>
  );
}

function WeekView({ rollup }: { rollup: { employee: Employee; trackedMin: number; openCount: number; entries: number }[] }) {
  if (rollup.length === 0) {
    return <Empty text="Aún no hay actividad esta semana." />;
  }
  return (
    <Card className="rounded-2xl border border-border/60 shadow-sm">
      <ul className="divide-y divide-border/40">
        {rollup.slice(0, 60).map(r => (
          <li key={r.employee.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <EmployeeAvatar avatarUrl={r.employee.avatar_url} firstName={r.employee.first_name} lastName={r.employee.last_name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{r.employee.first_name} {r.employee.last_name}</div>
              <div className="text-[12px] text-muted-foreground">
                {r.entries} {r.entries === 1 ? "fichaje" : "fichajes"}
                {r.openCount > 0 && <span className="text-amber-700 font-semibold"> · {r.openCount} {r.openCount === 1 ? "abierto" : "abiertos"}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold tabular-nums">{formatDuration(Math.max(0, r.trackedMin))}</div>
              <div className="text-[12px] uppercase tracking-wider text-muted-foreground">esta semana</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Section({ title, count, icon: Icon, tone, children }: {
  title: string; count: number; icon: any; tone: "primary" | "danger" | "warn" | "muted"; children: React.ReactNode;
}) {
  const toneCls = tone === "primary" ? "text-primary bg-primary/10"
    : tone === "danger" ? "text-rose-600 bg-rose-500/10"
    : tone === "warn" ? "text-amber-600 bg-amber-500/10"
    : "text-muted-foreground bg-muted";
  return (
    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border/40 flex items-center gap-2">
        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", toneCls)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-sm font-semibold">{title}</div>
        <Badge variant="outline" className="ml-auto text-[12px]">{count}</Badge>
      </div>
      {children}
    </Card>
  );
}

function ContactButtons({ phone }: { phone: string | null }) {
  const raw = (phone ?? "").replace(/[^+\d]/g, "");
  const wa = raw.replace(/^\+/, "");
  if (!raw) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      <a href={`tel:${raw}`} onClick={(e) => e.stopPropagation()}
        className={cn("h-11 w-11 inline-flex items-center justify-center rounded-lg bg-primary/10 text-primary active:scale-95", FOCUS_RING)}
        aria-label="Llamar"><Phone className="h-4 w-4" /></a>
      <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        className={cn("h-11 w-11 inline-flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 active:scale-95", FOCUS_RING)}
        aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-4 py-6 text-center">
      <CheckCircle2 className="h-5 w-5 mx-auto mb-1.5 text-emerald-600" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function ModePill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3.5 min-h-11 rounded-full text-sm font-medium transition-all", FOCUS_RING,
        active ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground"
      )}
    >
      {label}
    </button>
  );
}

function Kpi({ label, value, tone = "muted" }: { label: string; value: number | string; tone?: "primary" | "muted" | "warn" | "danger" }) {
  const toneCls = tone === "primary" ? "text-primary"
    : tone === "warn" ? "text-amber-600"
    : tone === "danger" ? "text-rose-600"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border/50 bg-card px-1.5 py-2 text-center">
      <div className={cn("text-base font-bold tabular-nums leading-tight", toneCls)}>{value}</div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight mt-0.5">{label}</div>
    </div>
  );
}

function AlertRow({ item, onOpen, focused = false }: { item: AlertItem; onOpen: () => void; focused?: boolean }) {
  const statusKey =
    item.type === "stale_open" ? "expired"
    : item.type === "long_open" || item.type === "very_long" ? "late"
    : item.type === "needs_review" ? "needs_review" : "missing";
  const label =
    item.type === "stale_open" ? "Vencido" :
    item.type === "long_open" ? "Largo" :
    item.type === "very_long" ? "Muy largo" :
    item.type === "needs_review" ? "Revisar" : "Sin turno";
  return (
    <li
      data-entry-id={item.entry.id}
      role="button"
      tabIndex={0}
      aria-label={`${item.employee.first_name} ${item.employee.last_name} — ${label}. Ver detalle`}
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5 min-h-[56px] active:bg-muted/40 cursor-pointer",
        FOCUS_RING,
        focused && "bg-primary/5 border-l-2 border-primary scroll-mt-24",
      )}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <EmployeeAvatar avatarUrl={item.employee.avatar_url} firstName={item.employee.first_name} lastName={item.employee.last_name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className={cn(MT.body, "font-semibold truncate")}>{item.employee.first_name} {item.employee.last_name}</div>
        <div className="text-[12px] text-muted-foreground truncate">{item.reason}</div>
      </div>
      {focused && <StatusBadge status="informational" label="Foco" size="sm" />}
      <StatusBadge status={statusKey} label={label} size="sm" />
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
    </li>
  );
}


function AlertDetailSheet({ item, onClose, onOpenWorker, onReviewInTime }: {
  item: AlertItem | null;
  onClose: () => void;
  onOpenWorker: (id: string) => void;
  onReviewInTime: () => void;
}) {
  const open = !!item;
  const labelMap: Record<AlertType, string> = {
    stale_open: "Fichaje abierto vencido",
    long_open: "Fichaje abierto largo",
    very_long: "Fichaje muy largo",
    needs_review: "Necesita revisión",
    no_shift: "Fichaje sin turno programado",
  };
  const phoneRaw = (item?.employee.phone_number ?? "").replace(/[^+\d]/g, "");
  const waPhone = phoneRaw.replace(/^\+/, "");
  const isCritical = item?.type === "stale_open" || item?.type === "very_long";
  const severityLabel = isCritical ? "Crítico" : "Revisión requerida";
  const severityCls = isCritical
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[92vh] flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 text-left border-b border-border/50">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className={cn("text-[12px] font-bold uppercase tracking-wider px-2 py-0.5", severityCls)}>
              <AlertTriangle className="h-3 w-3 mr-1" /> {severityLabel}
            </Badge>
            {item && !item.entry.clock_out && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                En vivo
              </span>
            )}
          </div>
          <SheetTitle className="text-lg font-bold font-heading leading-tight">
            {item ? labelMap[item.type] : "Alerta de tiempo"}
          </SheetTitle>
        </SheetHeader>
        {item && (
          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3">
              <EmployeeAvatar avatarUrl={item.employee.avatar_url} firstName={item.employee.first_name} lastName={item.employee.last_name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{item.employee.first_name} {item.employee.last_name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.employee.employer_identification != null && (
                    <span className="text-[12px] font-mono text-muted-foreground">#{item.employee.employer_identification}</span>
                  )}
                  <span className="text-[12px] text-muted-foreground truncate">{item.reason}</span>
                </div>
              </div>
            </div>

            <div className={cn(
              "rounded-2xl border p-4 text-center",
              isCritical ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"
            )}>
              <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> Tiempo transcurrido
              </div>
              <div className={cn(
                "text-3xl font-bold tabular-nums mt-1",
                isCritical ? "text-destructive" : "text-amber-700 dark:text-amber-300"
              )}>
                {formatDuration(item.minutes)}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1">
                desde {format(new Date(item.entry.clock_in), "PPp", { locale: enUS })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-card px-3 py-2">
                <div className="text-[12px] uppercase tracking-wider text-muted-foreground">Estado</div>
                <div className="text-sm font-semibold">{item.entry.clock_out ? "Cerrado" : "Abierto"}</div>
              </div>
              <div className="rounded-xl border border-border bg-card px-3 py-2 min-w-0">
                <div className="text-[12px] uppercase tracking-wider text-muted-foreground">Turno</div>
                <div className="text-sm font-semibold truncate">{item.entry.scheduled_shifts?.title ?? "Sin turno"}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3 text-xs">
              <div className="flex items-center gap-1.5 text-foreground font-semibold mb-1">
                <ClipboardCheck className="h-3.5 w-3.5 text-primary" /> Acción recomendada
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {item.type === "stale_open"
                  ? "Contacta a la persona para confirmar si ya no está trabajando, luego revisa el fichaje en el reloj."
                  : item.type === "very_long"
                  ? "Revisa el fichaje — la duración supera las 16h."
                  : item.type === "needs_review"
                  ? "Abre Aprobaciones para validar el fichaje."
                  : item.type === "no_shift"
                  ? "Vincula este fichaje a un turno programado si aplica."
                  : "Contacta a la persona y confirma si sigue trabajando."}
              </p>
            </div>

            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-xs">
              <div className="flex items-center gap-1.5 text-destructive font-semibold mb-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Seguridad de payroll
              </div>
              <ul className="text-foreground/80 leading-relaxed space-y-0.5 list-disc list-inside marker:text-destructive/60">
                <li>No enviar a payroll hasta revisar/cerrar este fichaje.</li>
                <li>Confirma con la persona antes de ajustar la salida.</li>
              </ul>
            </div>
          </div>
        )}
        {item && (
          <div className="border-t border-border/50 bg-background/95 backdrop-blur-md px-5 py-3 space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2 gap-2">
              {phoneRaw ? (
                <a href={`tel:${phoneRaw}`} onClick={() => setTimeout(onClose, 50)} className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.98]">
                  <Phone className="h-4 w-4" /> Llamar
                </a>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-muted text-muted-foreground text-sm font-medium opacity-60">
                  <Phone className="h-4 w-4" /> Sin teléfono
                </span>
              )}
              {waPhone ? (
                <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(onClose, 50)} className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-semibold active:scale-[0.98]">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-muted text-muted-foreground text-sm font-medium opacity-60">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </span>
              )}
            </div>
            <Button className="w-full h-11 rounded-xl text-sm font-semibold gap-2" onClick={onReviewInTime}>
              <ClipboardCheck className="h-4 w-4" /> Revisar en el reloj
            </Button>
            <button
              type="button"
              onClick={() => onOpenWorker(item.employee.id)}
              className="w-full h-9 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex items-center justify-center gap-1.5 transition"
            >
              <Users className="h-3.5 w-3.5" /> Ver perfil del worker
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums truncate ml-2">{value}</span>
    </div>
  );
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
