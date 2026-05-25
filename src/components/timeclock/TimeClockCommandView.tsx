/**
 * TimeClockCommandView — Centro de Mando de Tiempo (read-only Phase 1).
 *
 * Layout:
 *  - Premium header (rendered by parent page)
 *  - KPI Command Strip (above the fold)
 *  - Smart Time Alerts (above the fold; collapses to "Todo está en calma")
 *  - Tabs: En vivo · Alertas · Hoy · Semana · Aprobaciones · Kiosk · All workers
 *
 * Strictly read-only:
 *  - No writes
 *  - No payroll math
 *  - Scheduled shifts shown as operational context only, never as pay
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  Clock, AlertTriangle, Users, Activity, CalendarClock, CheckCircle2,
  Search, RefreshCw, ChevronRight, MapPin, Monitor, Copy, ArrowRight,
  CalendarDays, ClipboardCheck, Radio, Phone, MessageCircle,
} from "lucide-react";
import { format, differenceInMinutes, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import StaflyCalmProcessingBanner from "@/components/common/StaflyCalmProcessingBanner";
import { APP_BASE_URL } from "@/lib/app-url";
import { cn } from "@/lib/utils";

// ─── thresholds ──────────────────────────────────────────────
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

type AlertItem = {
  type: "stale_open" | "long_open" | "no_shift" | "very_long" | "needs_review";
  entry: TimeEntry;
  employee: Employee;
  minutes: number;
  reason: string;
};

export default function TimeClockCommandView() {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("live");
  const [tabAutoSet, setTabAutoSet] = useState(false);
  const [alertDetail, setAlertDetail] = useState<AlertItem | null>(null);

  const openWorker = (id: string) => navigate(`/app/people/${id}`);
  const openAlert = (item: AlertItem) => setAlertDetail(item);

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
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString();

    const empsP = supabase
      .from("employees")
      .select("id, first_name, last_name, avatar_url, employee_role, employer_identification, phone_number")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true);

    const entriesTodayP = supabase
      .from("time_entries")
      .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, scheduled_shifts(id, title, start_time, end_time)")
      .eq("company_id", selectedCompanyId)
      .gte("clock_in", startOfDay)
      .lte("clock_in", endOfDay)
      .order("clock_in", { ascending: false });

    const openOlderP = supabase
      .from("time_entries")
      .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, scheduled_shifts(id, title, start_time, end_time)")
      .eq("company_id", selectedCompanyId)
      .is("clock_out", null)
      .lt("clock_in", startOfDay);

    const weekP = supabase
      .from("time_entries")
      .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status")
      .eq("company_id", selectedCompanyId)
      .gte("clock_in", weekStart)
      .lte("clock_in", weekEnd);

    const [empsRes, entriesRes, openOlderRes, weekRes] = await Promise.all([
      empsP, entriesTodayP, openOlderP, weekP,
    ]);
    setEmployees(((empsRes.data ?? []) as unknown) as Employee[]);

    const merged = [
      ...((entriesRes.data ?? []) as TimeEntry[]),
      ...((openOlderRes.data ?? []) as TimeEntry[]),
    ];
    const byId = new Map<string, TimeEntry>();
    merged.forEach((e) => byId.set(e.id, e));
    setEntries(Array.from(byId.values()));
    setWeekEntries(((weekRes.data ?? []) as unknown) as TimeEntry[]);
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

  const alerts = useMemo<AlertItem[]>(() => {
    const issues: AlertItem[] = [];
    liveRows.forEach((r) => {
      const hours = r.minutes / 60;
      if (hours >= OPEN_ENTRY_STALE_HOURS) {
        issues.push({ ...r, type: "stale_open", reason: `Fichaje abierto desde hace ${Math.round(hours)}h — posiblemente falta salida` });
      } else if (hours >= OPEN_ENTRY_WARN_HOURS) {
        issues.push({ ...r, type: "long_open", reason: `Fichaje abierto largo — ${Math.round(hours)}h` });
      } else if (!r.entry.shift_id && !r.entry.scheduled_shifts) {
        issues.push({ ...r, type: "no_shift", reason: "Fichaje sin turno programado vinculado" });
      }
    });
    closedTodayEntries.forEach((e) => {
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
  }, [liveRows, closedTodayEntries, empMap]);

  const approvals = useMemo<AlertItem[]>(() => {
    return alerts.filter((a) => a.type === "stale_open" || a.type === "needs_review" || a.type === "very_long");
  }, [alerts]);

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

  // Today's window
  const todayStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);
  const todayEnd = useMemo(() => {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [now]);

  /**
   * Tracked minutes attributable to TODAY.
   * - Closed: overlap of [clock_in, clock_out] with [todayStart, todayEnd]
   * - Open started today: overlap of [clock_in, min(now, todayEnd)] with today
   * - Open started before today: 0 (treated as stale alert, not today's hours)
   */
  const getTrackedMinutesToday = (e: TimeEntry): number => {
    if (!e.clock_in) return 0;
    const ci = new Date(e.clock_in);
    let endRef: Date;
    if (e.clock_out) {
      endRef = new Date(e.clock_out);
    } else {
      if (ci < todayStart) return 0; // stale open clock — excluded
      endRef = now < todayEnd ? now : todayEnd;
    }
    const startMs = Math.max(ci.getTime(), todayStart.getTime());
    const endMs = Math.min(endRef.getTime(), todayEnd.getTime());
    if (endMs <= startMs) return 0;
    const rawMin = Math.floor((endMs - startMs) / 60000);
    const breakMin = Math.max(0, Math.min(e.break_minutes ?? 0, rawMin));
    return Math.max(0, rawMin - breakMin);
  };

  // Today rollup grouped by worker
  const todayRollup = useMemo(() => {
    const map = new Map<string, { employee: Employee; entries: TimeEntry[]; trackedMin: number; firstIn: Date | null; lastOut: Date | null; hasOpen: boolean }>();
    entries.forEach((e) => {
      const emp = empMap.get(e.employee_id);
      if (!emp) return;
      let row = map.get(emp.id);
      if (!row) {
        row = { employee: emp, entries: [], trackedMin: 0, firstIn: null, lastOut: null, hasOpen: false };
        map.set(emp.id, row);
      }
      row.entries.push(e);
      const ci = new Date(e.clock_in);
      if (!row.firstIn || ci < row.firstIn) row.firstIn = ci;
      if (e.clock_out) {
        const co = new Date(e.clock_out);
        if (!row.lastOut || co > row.lastOut) row.lastOut = co;
      } else {
        row.hasOpen = true;
      }
      row.trackedMin += getTrackedMinutesToday(e);
    });
    return Array.from(map.values()).sort((a, b) => b.trackedMin - a.trackedMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, empMap, now, todayStart, todayEnd]);

  // Week rollup
  const weekRollup = useMemo(() => {
    const map = new Map<string, { employee: Employee; trackedMin: number; openCount: number; entries: number }>();
    weekEntries.forEach((e) => {
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

  const kpis = useMemo(() => {
    const lateOrReview = entries.filter((e) => {
      const s = (e.status ?? "").toLowerCase();
      return s.includes("review") || s.includes("late") || s.includes("pending");
    }).length;
    const totalMinutesToday = todayRollup.reduce((s, r) => s + r.trackedMin, 0);
    return {
      clockedIn: openEntries.length,
      openClocks: openEntries.length,
      missingClockOut: alerts.filter((x) => x.type === "stale_open").length,
      lateReview: lateOrReview,
      todayEntries: entries.length,
      totalMinutesToday,
    };
  }, [openEntries, alerts, entries, todayRollup]);

  // ─── smart default tab (only first time after data loads) ─
  useEffect(() => {
    if (loading || tabAutoSet) return;
    if (alerts.length > 0) setActiveTab("alerts");
    else if (liveRows.length > 0) setActiveTab("live");
    else setActiveTab("today");
    setTabAutoSet(true);
  }, [loading, alerts.length, liveRows.length, tabAutoSet]);

  // ─── render ──────────────────────────────────────────────
  if (!selectedCompanyId) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        Select a company to load attendance.
      </div>
    );
  }

  if (loading && entries.length === 0) {
    return <TimeCommandSkeleton />;
  }

  return (
    <div className="space-y-5">
      {/* ─── KPI Command Strip ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Activity} tone="primary" label="Fichados ahora" value={kpis.clockedIn} />
        <KpiCard icon={Clock} tone="muted" label="Fichajes abiertos" value={kpis.openClocks} />
        <KpiCard
          icon={AlertTriangle}
          tone={kpis.missingClockOut > 0 ? "danger" : "muted"}
          label="Falta salida"
          value={kpis.missingClockOut}
        />
        <KpiCard
          icon={CalendarClock}
          tone={kpis.lateReview > 0 ? "warning" : "muted"}
          label="Necesita revisión"
          value={kpis.lateReview}
        />
        <KpiCard icon={Users} tone="muted" label="Fichajes de hoy" value={kpis.todayEntries} />
        <KpiCard
          icon={ClipboardCheck}
          tone="muted"
          label="Horas registradas hoy"
          value={formatHoursShort(kpis.totalMinutesToday)}
        />
      </div>

      {/* ─── Smart Time Alerts ─────────────────────────────── */}
      <Card className="border border-border/60 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center",
              alerts.length > 0 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"
            )}>
              {alerts.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold tracking-tight">Alertas de tiempo</h3>
              <p className="text-xs text-muted-foreground">
                {alerts.length > 0
                  ? `${alerts.length} item${alerts.length === 1 ? "" : "s"} para revisar`
                  : "Todo en orden · no hay incidencias abiertas"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </Button>
        </div>
        {alerts.length === 0 ? (
          <CalmEmpty
            title="Todo está en calma"
            description="No hay entradas abiertas que requieran atención."
            actions={[
              { label: "Abrir kiosk", onClick: () => navigate("/app/kiosk"), icon: Monitor },
              { label: "Ver hoy", onClick: () => setActiveTab("today"), icon: CalendarDays },
            ]}
          />
        ) : (
          <ul className="divide-y divide-border/40">
            {alerts.slice(0, 8).map((item) => (
              <AlertRow key={`${item.type}-${item.entry.id}`} item={item} onOpen={() => openAlert(item)} />
            ))}
          </ul>
        )}
      </Card>

      {/* ─── Tabs ──────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1">
          <TabsTrigger value="live" className="gap-1.5 text-xs">
            <Radio className="h-3.5 w-3.5" /> En vivo
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" /> Alertas
            {alerts.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-700">
                {alerts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="today" className="gap-1.5 text-xs">
            <CalendarDays className="h-3.5 w-3.5" /> Hoy
          </TabsTrigger>
          <TabsTrigger value="week" className="gap-1.5 text-xs">
            <CalendarClock className="h-3.5 w-3.5" /> Semana
          </TabsTrigger>
          <TabsTrigger value="approvals" className="gap-1.5 text-xs">
            <ClipboardCheck className="h-3.5 w-3.5" /> Aprobaciones
            {approvals.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500/20 px-1 text-[10px] font-bold text-rose-700">
                {approvals.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="kiosk" className="gap-1.5 text-xs">
            <Monitor className="h-3.5 w-3.5" /> Kiosk
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" /> Todo el equipo
          </TabsTrigger>
        </TabsList>

        {/* En vivo */}
        <TabsContent value="live" className="mt-4">
          <Card className="border border-border/60 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-semibold tracking-tight">Ahora en vivo</h3>
                  <p className="text-xs text-muted-foreground">
                    {liveRows.length} {liveRows.length === 1 ? "persona fichada" : "personas fichadas"} en este momento
                  </p>
                </div>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar persona, rol o ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
            {filteredLive.length === 0 ? (
              <CalmEmpty
                title={liveRows.length === 0 ? "Nadie está fichado ahora mismo." : "No hay coincidencias para tu búsqueda."}
                description={liveRows.length === 0 ? "Cuando alguien fiche desde el kiosk o el portal, aparecerá aquí en tiempo real." : undefined}
                actions={liveRows.length === 0 ? [
                  { label: "Abrir kiosk", onClick: () => navigate("/app/kiosk"), icon: Monitor },
                  { label: "Ver hoy", onClick: () => setActiveTab("today"), icon: CalendarDays },
                ] : []}
              />
            ) : (
              <ul className="divide-y divide-border/40">
                {filteredLive.map((r) => (
                  <LiveRow key={r.entry.id} row={r} onOpen={() => openWorker(r.employee.id)} />
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Alertas */}
        <TabsContent value="alerts" className="mt-4">
          <Card className="border border-border/60 rounded-2xl shadow-sm">
            <div className="px-5 py-4 border-b border-border/50">
              <h3 className="font-heading text-base font-semibold tracking-tight">Alertas detalladas</h3>
              <p className="text-xs text-muted-foreground">
                Todas las anomalías de fichaje detectadas hoy.
              </p>
            </div>
            {alerts.length === 0 ? (
              <CalmEmpty
                title="Todo está en calma"
                description="No hay entradas abiertas que requieran atención."
              />
            ) : (
              <ul className="divide-y divide-border/40">
                {alerts.map((item) => (
                  <AlertRow key={`${item.type}-${item.entry.id}`} item={item} onOpen={() => openAlert(item)} />
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Hoy */}
        <TabsContent value="today" className="mt-4">
          <Card className="border border-border/60 rounded-2xl shadow-sm">
            <div className="px-5 py-4 border-b border-border/50">
              <h3 className="font-heading text-base font-semibold tracking-tight">Hoy</h3>
              <p className="text-xs text-muted-foreground">
                {todayRollup.length} {todayRollup.length === 1 ? "persona" : "personas"} con actividad — primera entrada / última salida / total registrado.
              </p>
            </div>
            {todayRollup.length === 0 ? (
              <CalmEmpty title="Sin actividad hoy" description="Aún no hay fichajes registrados para hoy." />
            ) : (
              <ul className="divide-y divide-border/40">
                {todayRollup.map((r) => (
                  <li
                    key={r.employee.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 cursor-pointer transition"
                    onClick={() => openWorker(r.employee.id)}
                  >
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
                      <div className="text-xs text-muted-foreground">
                        {r.firstIn ? `Entró ${format(r.firstIn, "p", { locale: enUS })}` : "—"}
                        {" · "}
                        {r.lastOut ? `Salió ${format(r.lastOut, "p", { locale: enUS })}` : r.hasOpen ? "Sigue abierto" : "—"}
                        {" · "}
                        {r.entries.length} {r.entries.length === 1 ? "fichaje" : "fichajes"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums">{formatDuration(Math.max(0, r.trackedMin))}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">registrado</div>
                    </div>
                    {r.hasOpen && (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Abierto</Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Semana */}
        <TabsContent value="week" className="mt-4">
          <Card className="border border-border/60 rounded-2xl shadow-sm">
            <div className="px-5 py-4 border-b border-border/50">
              <h3 className="font-heading text-base font-semibold tracking-tight">Esta semana</h3>
              <p className="text-xs text-muted-foreground">
                Resumen semanal por persona — total registrado e incidencias abiertas. Solo lectura.
              </p>
            </div>
            {weekRollup.length === 0 ? (
              <CalmEmpty title="Sin actividad esta semana" />
            ) : (
              <ul className="divide-y divide-border/40">
                {weekRollup.slice(0, 50).map((r) => (
                  <li
                    key={r.employee.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 cursor-pointer transition"
                    onClick={() => openWorker(r.employee.id)}
                  >
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
                      <div className="text-xs text-muted-foreground">
                        {r.entries} {r.entries === 1 ? "fichaje" : "fichajes"}
                        {r.openCount > 0 && (
                          <> · <span className="text-amber-700 font-semibold">{r.openCount} {r.openCount === 1 ? "abierto" : "abiertos"}</span></>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums">{formatDuration(Math.max(0, r.trackedMin))}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">esta semana</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Aprobaciones */}
        <TabsContent value="approvals" className="mt-4">
          <Card className="border border-border/60 rounded-2xl shadow-sm">
            <div className="px-5 py-4 border-b border-border/50">
              <h3 className="font-heading text-base font-semibold tracking-tight">Listo para revisar</h3>
              <p className="text-xs text-muted-foreground">
                Fichajes marcados para revisión, falta de salida y muy largos. Solo lectura — abre el perfil para resolver.
              </p>
            </div>
            {approvals.length === 0 ? (
              <CalmEmpty title="Sin aprobaciones pendientes" description="No hay fichajes que requieran revisión del admin." />
            ) : (
              <ul className="divide-y divide-border/40">
                {approvals.map((item) => (
                  <AlertRow key={`${item.type}-${item.entry.id}`} item={item} onOpen={() => openAlert(item)} />
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Kiosk */}
        <TabsContent value="kiosk" className="mt-4">
          <Card className="border border-border/60 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight">Kiosk</h3>
                <p className="text-xs text-muted-foreground">
                  Acceso rápido al modo kiosk para fichajes en sitio.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-4 mb-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">URL del kiosk</div>
              <code className="text-xs font-mono break-all">{`${APP_BASE_URL}/kiosk`}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-9 text-xs gap-1.5" onClick={() => navigate("/app/kiosk")}>
                <Monitor className="h-3.5 w-3.5" /> Abrir kiosk
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(`${APP_BASE_URL}/kiosk`);
                  toast.success("URL del kiosk copiada");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copiar URL
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* All workers */}
        <TabsContent value="all" className="mt-4">
          <Card className="border border-border/60 rounded-2xl shadow-sm p-8 flex flex-col items-center text-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="font-heading text-lg font-semibold tracking-tight">Directorio del equipo</h3>
              <p className="text-sm text-muted-foreground">
                El reloj se enfoca en asistencia en vivo y excepciones. Para navegar el equipo completo con búsqueda,
                filtros, perfiles y calidad de datos, usa el módulo Equipo.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" className="h-9 text-xs gap-1.5" onClick={() => navigate("/app/employees")}>
                Abrir equipo <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => setActiveTab("today")}>
                <CalendarDays className="h-3.5 w-3.5" /> Ver hoy
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => setActiveTab("live")}>
                <Radio className="h-3.5 w-3.5" /> Volver a En vivo
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground">
        Read-only · Time clock can show scheduled shift as context but never as payment.
      </p>

      <AlertDetailSheet
        item={alertDetail}
        onClose={() => setAlertDetail(null)}
        onReviewInTime={() => {
          setAlertDetail(null);
          setActiveTab("approvals");
        }}
        onOpenWorker={(id) => {
          setAlertDetail(null);
          openWorker(id);
        }}
      />
    </div>
  );
}

// ─── Alert detail sheet ──────────────────────────────────
function AlertDetailSheet({
  item,
  onClose,
  onOpenWorker,
  onReviewInTime,
}: {
  item: AlertItem | null;
  onClose: () => void;
  onOpenWorker: (id: string) => void;
  onReviewInTime: () => void;
}) {
  const open = !!item;
  const labelMap: Record<AlertItem["type"], string> = {
    stale_open: "Stale open clock",
    long_open: "Long open clock",
    very_long: "Very long entry",
    needs_review: "Needs review",
    no_shift: "Clock without scheduled shift",
  };
  const phoneRaw = (item?.employee.phone_number ?? "").replace(/[^+\d]/g, "");
  const waPhone = phoneRaw.replace(/^\+/, "");
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[85vh] flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 text-left">
          <SheetTitle className="text-base font-bold font-heading">
            {item ? labelMap[item.type] : "Time alert"}
          </SheetTitle>
        </SheetHeader>
        {item && (
          <div className="px-5 pb-5 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-3">
              <EmployeeAvatar
                avatarUrl={item.employee.avatar_url}
                firstName={item.employee.first_name}
                lastName={item.employee.last_name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">
                  {item.employee.first_name} {item.employee.last_name}
                </div>
                {item.employee.employer_identification != null && (
                  <div className="text-[11px] font-mono text-muted-foreground">
                    #{item.employee.employer_identification}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card divide-y divide-border/50">
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Issue</span>
                <span className="font-medium text-foreground">{item.reason}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Clock-in</span>
                <span className="font-medium text-foreground tabular-nums">
                  {format(new Date(item.entry.clock_in), "PPp", { locale: enUS })}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Elapsed</span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatDuration(item.minutes)}
                </span>
              </div>
              {item.entry.scheduled_shifts && (
                <div className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Shift</span>
                  <span className="font-medium text-foreground truncate ml-2">
                    {item.entry.scheduled_shifts.title}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-foreground">
                  {item.entry.clock_out ? "Closed" : "Open"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
              <strong className="block font-semibold mb-0.5">Suggested action</strong>
              {item.type === "stale_open"
                ? "Reach out to confirm the worker is no longer on shift, then review the entry in Time."
                : item.type === "very_long"
                ? "Review the entry for accuracy — duration exceeds 16h."
                : item.type === "needs_review"
                ? "Open Approvals in Time to validate the entry."
                : item.type === "no_shift"
                ? "Link this clock to a scheduled shift if needed."
                : "Reach out to the worker and confirm whether they are still working."}
            </div>

            {/* Primary actions: contact + review in Time */}
            <div className="grid grid-cols-2 gap-2">
              {phoneRaw ? (
                <a
                  href={`tel:${phoneRaw}`}
                  className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-primary/10 text-primary text-sm font-medium active:scale-[0.98] transition"
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-muted text-muted-foreground text-sm font-medium opacity-60">
                  <Phone className="h-4 w-4" /> No phone
                </span>
              )}
              {waPhone ? (
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-medium active:scale-[0.98] transition"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-muted text-muted-foreground text-sm font-medium opacity-60">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </span>
              )}
            </div>

            <Button
              className="w-full h-11 rounded-xl text-sm font-semibold gap-2"
              onClick={onReviewInTime}
            >
              <ClipboardCheck className="h-4 w-4" /> Review in Time
            </Button>

            {/* Secondary: worker profile */}
            <Button
              variant="ghost"
              className="w-full h-10 rounded-xl text-xs text-muted-foreground gap-2"
              onClick={() => onOpenWorker(item.employee.id)}
            >
              <Users className="h-3.5 w-3.5" /> View worker profile
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}


// ─── helpers ──────────────────────────────────────────────
function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatHoursShort(minutes: number) {
  const h = minutes / 60;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
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

function CalmEmpty({
  title,
  description,
  actions = [],
}: {
  title: string;
  description?: string;
  actions?: { label: string; onClick: () => void; icon?: React.ComponentType<{ className?: string }> }[];
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions.map((a) => (
            <Button key={a.label} variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={a.onClick}>
              {a.icon && <a.icon className="h-3.5 w-3.5" />}
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ item, onOpen }: { item: AlertItem; onOpen: () => void }) {
  const toneCls =
    item.type === "stale_open"
      ? "bg-rose-500/10 text-rose-700 border-rose-500/30"
      : item.type === "long_open" || item.type === "very_long"
      ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
      : item.type === "needs_review"
      ? "bg-violet-500/10 text-violet-700 border-violet-500/30"
      : "bg-sky-500/10 text-sky-700 border-sky-500/30";
  const label =
    item.type === "stale_open" ? "Stale" :
    item.type === "long_open" ? "Long" :
    item.type === "very_long" ? "Very long" :
    item.type === "needs_review" ? "Review" : "No shift";
  return (
    <li
      className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 cursor-pointer transition"
      onClick={onOpen}
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
      <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase tracking-wider", toneCls)}>
        {label}
      </Badge>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </li>
  );
}

function LiveRow({
  row,
  onOpen,
}: {
  row: { entry: TimeEntry; employee: Employee; minutes: number };
  onOpen: () => void;
}) {
  const sched = row.entry.scheduled_shifts;
  return (
    <li
      className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 cursor-pointer transition"
      onClick={onOpen}
    >
      <EmployeeAvatar
        avatarUrl={row.employee.avatar_url}
        firstName={row.employee.first_name}
        lastName={row.employee.last_name}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">
            {row.employee.first_name} {row.employee.last_name}
          </span>
          {row.employee.employee_role && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              · {row.employee.employee_role}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Since {format(new Date(row.entry.clock_in), "p", { locale: enUS })}
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
        <div className="text-sm font-bold tabular-nums">{formatDuration(row.minutes)}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">elapsed</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </li>
  );
}

// ─── inline skeleton (NO blue splash) ─────────────────────
function TimeCommandSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="rounded-2xl border border-border/60 shadow-sm p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                <div className="h-4 w-10 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="border border-border/60 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-3 w-32 rounded bg-muted animate-pulse" />
              <div className="h-2 w-48 rounded bg-muted animate-pulse" />
            </div>
          </div>
          <StaflyCalmProcessingBanner
            variant="inline"
            title="Sincronizando asistencia"
            message="Estamos organizando el estado del reloj en tiempo real."
          />
        </div>
        <div className="divide-y divide-border/40">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                <div className="h-2 w-56 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-5 w-12 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
