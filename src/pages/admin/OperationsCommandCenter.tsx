import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { format, addDays, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/ui/page-header";
import {
  Loader2, Search, ChevronLeft, ChevronRight, Radio, Clock, AlertTriangle,
  Users, Car, Shield, Eye, CheckCircle2, XCircle, Phone, MessageSquare,
  UserCheck, MapPin, Building2, RefreshCw, Bell, Zap, UserPlus,
} from "lucide-react";
import { ReplacementSuggestionDialog } from "@/components/shifts/ReplacementSuggestionDialog";

// ─── Types ───
interface ShiftRow {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  slots: number;
  shift_code: string | null;
  client_id: string | null;
  location_id: string | null;
  shift_admin_id: string | null;
  driver_employee_id: string | null;
  transportation_required: boolean;
  client_name?: string;
  location_name?: string;
  assigned: number;
  confirmed: number;
  clocked_in: number;
  absent: number;
  pending: number;
  risk_level: "ok" | "warning" | "critical";
}

interface AlertRow {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  employee_name: string;
  employee_id: string;
  shift_id: string | null;
  shift_title: string;
  created_at: string;
  resolved_at: string | null;
}

interface AssignmentRow {
  id: string;
  employee_id: string;
  status: string;
  assignment_role: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  clocked_in: boolean;
  clock_in_time: string | null;
  confirmed_at: string | null;
}

// ─── Helpers ───
const RISK_STYLES = {
  ok: { bg: "bg-earning/10", text: "text-earning", label: "OK" },
  warning: { bg: "bg-warning/10", text: "text-warning", label: "⚠️ Riesgo" },
  critical: { bg: "bg-destructive/10", text: "text-destructive", label: "🔴 Crítico" },
};

const ALERT_ICONS: Record<string, string> = {
  no_confirmation: "⏳",
  no_clockin: "🚫",
  late_arrival: "⏰",
  geofence_violation: "📍",
  no_clockin_alert: "🚫",
  no_show_alert: "❌",
  early_departure: "🚪",
};

export default function OperationsCommandCenter() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [drawerAssignments, setDrawerAssignments] = useState<AssignmentRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{ shiftId: string; shiftTitle: string; shiftDate: string; startTime: string; endTime: string; excludeIds: string[] } | null>(null);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const isToday = isSameDay(selectedDate, new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // ─── Load shifts + alerts ───
  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const [shiftsRes, assignRes, entriesRes, confirmRes, alertsRes, clientsRes, locsRes] = await Promise.all([
      supabase.from("scheduled_shifts").select("id, title, date, start_time, end_time, status, slots, shift_code, client_id, location_id, shift_admin_id, driver_employee_id, transportation_required")
        .eq("company_id", selectedCompanyId).eq("date", dateStr).is("deleted_at", null).order("start_time"),
      supabase.from("shift_assignments").select("id, shift_id, employee_id, status, assignment_role")
        .eq("company_id", selectedCompanyId),
      supabase.from("time_entries").select("id, employee_id, shift_id, clock_in, clock_out")
        .eq("company_id", selectedCompanyId).gte("clock_in", `${dateStr}T00:00:00`).lte("clock_in", `${dateStr}T23:59:59`),
      supabase.from("shift_attendance_confirmations").select("shift_id, employee_id, confirmed_at")
        .eq("company_id", selectedCompanyId),
      supabase.from("clock_alerts").select("id, type, severity, description, employee_id, shift_id, created_at, resolved_at")
        .eq("company_id", selectedCompanyId).is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId),
      supabase.from("locations").select("id, name").eq("company_id", selectedCompanyId),
    ]);

    const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
    const locMap = new Map((locsRes.data ?? []).map(l => [l.id, l.name]));
    const allAssignments = assignRes.data ?? [];
    const allEntries = entriesRes.data ?? [];
    const allConfirms = confirmRes.data ?? [];

    // Build shift rows
    const shiftRows: ShiftRow[] = (shiftsRes.data ?? []).map((s: any) => {
      const sa = allAssignments.filter(a => (a as any).shift_id === s.id && !["rejected", "removed"].includes((a as any).status));
      const clockedIn = allEntries.filter(e => (e as any).shift_id === s.id && !(e as any).clock_out).length;
      const confirmed = sa.filter(a => (a as any).status === "confirmed").length;
      const pending = sa.filter(a => (a as any).status === "pending").length;
      const absent = sa.length - clockedIn - pending;

      let risk_level: "ok" | "warning" | "critical" = "ok";
      const now = new Date();
      const shiftStart = new Date(`${s.date}T${s.start_time}`);
      const minutesPast = (now.getTime() - shiftStart.getTime()) / 60000;

      if (sa.length < (s.slots ?? 1)) risk_level = "warning";
      if (minutesPast > 15 && clockedIn === 0 && sa.length > 0) risk_level = "critical";
      if (pending > 0 && minutesPast > 0) risk_level = "warning";
      if (sa.length === 0 && s.status === "published") risk_level = "critical";

      return {
        ...s,
        client_name: s.client_id ? clientMap.get(s.client_id) : undefined,
        location_name: s.location_id ? locMap.get(s.location_id) : undefined,
        assigned: sa.length,
        confirmed,
        clocked_in: clockedIn,
        absent: Math.max(0, absent),
        pending,
        risk_level,
      };
    });

    setShifts(shiftRows);

    // Build alert rows with employee names
    const alertEmpIds = [...new Set((alertsRes.data ?? []).map((a: any) => a.employee_id))];
    let empNameMap = new Map<string, string>();
    if (alertEmpIds.length > 0) {
      const { data: emps } = await supabase.from("employees").select("id, first_name, last_name").in("id", alertEmpIds);
      (emps ?? []).forEach((e: any) => empNameMap.set(e.id, `${e.first_name} ${e.last_name}`));
    }

    const shiftNameMap = new Map(shiftRows.map(s => [s.id, s.title]));

    setAlerts((alertsRes.data ?? []).map((a: any) => ({
      ...a,
      employee_name: empNameMap.get(a.employee_id) ?? "—",
      shift_title: a.shift_id ? (shiftNameMap.get(a.shift_id) ?? "—") : "—",
    })));

    setLoading(false);
  }, [selectedCompanyId, dateStr]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Realtime subscriptions ───
  useEffect(() => {
    if (!selectedCompanyId) return;

    // Clean up previous channels
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    const handleChange = () => { loadData(); };

    const ch1 = supabase.channel("ops-assignments")
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_assignments", filter: `company_id=eq.${selectedCompanyId}` }, handleChange)
      .subscribe();

    const ch2 = supabase.channel("ops-clock-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_events", filter: `company_id=eq.${selectedCompanyId}` }, handleChange)
      .subscribe();

    const ch3 = supabase.channel("ops-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_alerts", filter: `company_id=eq.${selectedCompanyId}` }, handleChange)
      .subscribe();

    const ch4 = supabase.channel("ops-time-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `company_id=eq.${selectedCompanyId}` }, handleChange)
      .subscribe();

    channelsRef.current = [ch1, ch2, ch3, ch4];

    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [selectedCompanyId, loadData]);

  // ─── KPIs ───
  const totalActiveClocks = useMemo(() => shifts.reduce((n, s) => n + s.clocked_in, 0), [shifts]);
  const totalPending = useMemo(() => shifts.reduce((n, s) => n + s.pending, 0), [shifts]);
  const totalNoClockIn = useMemo(() => shifts.filter(s => {
    const shiftStart = new Date(`${s.date}T${s.start_time}`);
    return new Date() > shiftStart && s.clocked_in === 0 && s.assigned > 0;
  }).length, [shifts]);
  const totalAlerts = alerts.length;
  const transportIssues = useMemo(() => shifts.filter(s => s.transportation_required && !s.driver_employee_id && s.assigned > 0).length, [shifts]);

  // ─── Filters ───
  const clients = useMemo(() => [...new Set(shifts.map(s => s.client_name).filter(Boolean) as string[])].sort(), [shifts]);

  const filteredShifts = useMemo(() => {
    let list = shifts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.title.toLowerCase().includes(q) || s.client_name?.toLowerCase().includes(q) || s.location_name?.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      if (statusFilter === "critical") list = list.filter(s => s.risk_level === "critical");
      else if (statusFilter === "warning") list = list.filter(s => s.risk_level === "warning");
      else if (statusFilter === "ok") list = list.filter(s => s.risk_level === "ok");
    }
    if (clientFilter !== "all") list = list.filter(s => s.client_name === clientFilter);
    return list;
  }, [shifts, search, statusFilter, clientFilter]);

  // ─── Drawer: shift detail ───
  const selectedShift = useMemo(() => shifts.find(s => s.id === selectedShiftId), [shifts, selectedShiftId]);

  const loadDrawer = useCallback(async (shiftId: string) => {
    setSelectedShiftId(shiftId);
    setDrawerLoading(true);

    const [assignRes, entriesRes] = await Promise.all([
      supabase.from("shift_assignments").select("id, employee_id, status, assignment_role, employees(first_name, last_name, phone_number)")
        .eq("shift_id", shiftId) as any,
      supabase.from("time_entries").select("employee_id, clock_in").eq("shift_id", shiftId).is("clock_out", null),
    ]);

    const clockedSet = new Set((entriesRes.data ?? []).map((e: any) => e.employee_id));

    setDrawerAssignments((assignRes.data ?? []).map((a: any) => ({
      id: a.id,
      employee_id: a.employee_id,
      status: a.status,
      assignment_role: a.assignment_role,
      first_name: a.employees?.first_name ?? "—",
      last_name: a.employees?.last_name ?? "",
      phone_number: a.employees?.phone_number,
      clocked_in: clockedSet.has(a.employee_id),
      clock_in_time: (entriesRes.data ?? []).find((e: any) => e.employee_id === a.employee_id)?.clock_in ?? null,
      confirmed_at: null,
    })));
    setDrawerLoading(false);
  }, []);

  // ─── Resolve alert ───
  const resolveAlert = async (alertId: string) => {
    const { error } = await supabase.from("clock_alerts").update({ resolved_at: new Date().toISOString(), resolved_by: user?.id } as any).eq("id", alertId);
    if (error) toast.error(error.message);
    else {
      toast.success("Alerta resuelta");
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    }
  };

  // ─── Employee state badge ───
  const empStateBadge = (a: AssignmentRow) => {
    if (a.clocked_in) return <Badge variant="success" className="text-[9px]">🟢 Fichado</Badge>;
    if (a.status === "confirmed") return <Badge variant="info" className="text-[9px]">✅ Confirmado</Badge>;
    if (a.status === "rejected") return <Badge variant="destructive" className="text-[9px]">❌ Rechazado</Badge>;
    return <Badge variant="warning" className="text-[9px]">⏳ Pendiente</Badge>;
  };

  const roleBadge = (role: string) => {
    if (role === "shift_admin" || role === "shift_lead") return <Badge variant="info" className="text-[9px]">🛡️ Admin</Badge>;
    if (role === "driver") return <Badge variant="warning" className="text-[9px]">🚗 Driver</Badge>;
    return null;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Operations Command Center" subtitle="Control de turnos en tiempo real" icon={Radio} variant="4" />

      {/* ─── Date nav + filters ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(d => addDays(d, -1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button variant={isToday ? "default" : "outline"} size="sm" className="h-9 text-xs min-w-[100px]" onClick={() => setSelectedDate(new Date())}>
            {isToday ? "📡 Hoy" : format(selectedDate, "EEE d MMM", { locale: es })}
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(d => addDays(d, 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>

        <div className="relative flex-1 max-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar turno..." className="pl-9 h-9" />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ok">✅ OK</SelectItem>
            <SelectItem value="warning">⚠️ Riesgo</SelectItem>
            <SelectItem value="critical">🔴 Crítico</SelectItem>
          </SelectContent>
        </Select>

        {clients.length > 0 && (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[130px] text-xs">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos clientes</SelectItem>
              {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Button variant="ghost" size="icon" className="h-9 w-9 ml-auto" onClick={loadData} title="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>

        {isToday && (
          <div className="flex items-center gap-1.5 text-[10px] text-earning font-medium">
            <Radio className="h-3 w-3 animate-pulse" /> EN VIVO
          </div>
        )}
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard value={totalActiveClocks} label="Fichajes activos" accent="earning" icon={<Clock className="h-4 w-4 text-earning" />} />
        <KpiCard value={totalPending} label="Confirmaciones pendientes" accent="warning" icon={<Users className="h-4 w-4 text-warning" />} />
        <KpiCard value={totalNoClockIn} label="Sin fichaje" accent="deduction" icon={<XCircle className="h-4 w-4 text-deduction" />} />
        <KpiCard value={totalAlerts} label="Alertas activas" accent={totalAlerts > 0 ? "warning" : "muted"} icon={<AlertTriangle className="h-4 w-4 text-warning" />} />
        <KpiCard value={transportIssues} label="Sin conductor" accent={transportIssues > 0 ? "deduction" : "muted"} icon={<Car className="h-4 w-4 text-deduction" />} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* ─── Shift Table (2/3) ─── */}
          <div className="xl:col-span-2 space-y-2">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Turnos ({filteredShifts.length})
            </h2>

            {filteredShifts.length === 0 ? (
              <div className="rounded-2xl border border-border/30 bg-card p-8 text-center text-sm text-muted-foreground">
                No hay turnos para esta fecha
              </div>
            ) : (
              <div className="space-y-2">
                {filteredShifts.map(s => {
                  const risk = RISK_STYLES[s.risk_level];
                  return (
                    <button
                      key={s.id}
                      onClick={() => loadDrawer(s.id)}
                      className={cn(
                        "w-full rounded-2xl border bg-card p-3 text-left transition-all hover:shadow-md hover:scale-[1.005] active:scale-[0.995]",
                        s.risk_level === "critical" && "border-destructive/30",
                        s.risk_level === "warning" && "border-warning/30",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Risk indicator */}
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", risk.bg)}>
                          {s.risk_level === "ok" ? <CheckCircle2 className={cn("h-5 w-5", risk.text)} /> :
                           s.risk_level === "warning" ? <AlertTriangle className={cn("h-5 w-5", risk.text)} /> :
                           <XCircle className={cn("h-5 w-5", risk.text)} />}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{s.title}</p>
                            {s.shift_code && <span className="text-[10px] text-muted-foreground">#{String(s.shift_code).padStart(4, "0")}</span>}
                            <Badge variant="outline" className={cn("text-[9px]", risk.text)}>{risk.label}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                            {s.client_name && <span className="flex items-center gap-1 truncate"><Building2 className="h-3 w-3" />{s.client_name}</span>}
                            {s.location_name && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{s.location_name}</span>}
                          </div>
                        </div>

                        {/* Stats chips */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="rounded-lg bg-muted/40 px-2 py-1 text-center">
                            <p className="text-xs font-bold tabular-nums">{s.assigned}/{s.slots ?? 1}</p>
                            <p className="text-[9px] text-muted-foreground">Asignados</p>
                          </div>
                          <div className="rounded-lg bg-earning/10 px-2 py-1 text-center">
                            <p className="text-xs font-bold tabular-nums text-earning">{s.clocked_in}</p>
                            <p className="text-[9px] text-muted-foreground">Fichados</p>
                          </div>
                          {s.pending > 0 && (
                            <div className="rounded-lg bg-warning/10 px-2 py-1 text-center">
                              <p className="text-xs font-bold tabular-nums text-warning">{s.pending}</p>
                              <p className="text-[9px] text-muted-foreground">Pend.</p>
                            </div>
                          )}
                          {s.transportation_required && (
                            <Car className={cn("h-4 w-4", s.driver_employee_id ? "text-earning" : "text-destructive")} />
                          )}
                          {s.shift_admin_id && <Shield className="h-4 w-4 text-primary" />}
                        </div>

                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Alerts Panel (1/3) ─── */}
          <div className="space-y-2">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Bell className="h-4 w-4 text-warning" /> Alertas ({alerts.length})
            </h2>

            <ScrollArea className="h-[500px]">
              {alerts.length === 0 ? (
                <div className="rounded-2xl border border-border/30 bg-card p-6 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-earning" />
                  Sin alertas activas
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {alerts.map(a => (
                    <div key={a.id} className={cn(
                      "rounded-xl border p-3 space-y-1.5",
                      a.severity === "critical" ? "border-destructive/30 bg-destructive/[0.03]" : "border-warning/30 bg-warning/[0.03]",
                    )}>
                      <div className="flex items-start gap-2">
                        <span className="text-base">{ALERT_ICONS[a.type] ?? "⚠️"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">{a.employee_name}</p>
                          <p className="text-[10px] text-muted-foreground">{a.shift_title} • {a.type.replace(/_/g, " ")}</p>
                          {a.description && <p className="text-[10px] text-muted-foreground mt-0.5">{a.description}</p>}
                          <p className="text-[9px] text-muted-foreground/60 mt-1">{format(new Date(a.created_at), "HH:mm", { locale: es })}</p>
                        </div>
                        <Badge variant={a.severity === "critical" ? "destructive" : "warning"} className="text-[9px] shrink-0">
                          {a.severity}
                        </Badge>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => resolveAlert(a.id)}>
                          <CheckCircle2 className="h-3 w-3" /> Resolver
                        </Button>
                        {(a.type === "no_show" || a.type === "no_show_alert") && a.shift_id && (
                          <Button size="sm" variant="default" className="h-7 text-[10px] gap-1" onClick={() => {
                            const s = shifts.find(sh => sh.id === a.shift_id);
                            if (s) {
                              const assignedIds = (alertsRes => drawerAssignments.map(da => da.employee_id))();
                              setReplaceTarget({
                                shiftId: s.id, shiftTitle: s.title, shiftDate: s.date,
                                startTime: s.start_time, endTime: s.end_time,
                                excludeIds: [],
                              });
                            }
                          }}>
                            <UserPlus className="h-3 w-3" /> Reemplazar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => a.shift_id && navigate(`/app/shift-ops?id=${a.shift_id}`)}>
                          <Eye className="h-3 w-3" /> Ver turno
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}

      {/* ─── Shift Detail Drawer ─── */}
      <Sheet open={!!selectedShiftId} onOpenChange={open => { if (!open) setSelectedShiftId(null); }}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedShift?.title}
              {selectedShift && <Badge variant="outline" className="text-[9px]">{RISK_STYLES[selectedShift.risk_level].label}</Badge>}
            </SheetTitle>
          </SheetHeader>

          {drawerLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <ScrollArea className="h-[calc(100vh-120px)] mt-4">
              <div className="space-y-4 pr-2">
                {/* Shift meta */}
                {selectedShift && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Horario</p>
                      <p className="text-sm font-semibold">{selectedShift.start_time.slice(0, 5)} – {selectedShift.end_time.slice(0, 5)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Plazas</p>
                      <p className="text-sm font-semibold">{selectedShift.assigned} / {selectedShift.slots ?? 1}</p>
                    </div>
                    {selectedShift.client_name && (
                      <div className="rounded-xl bg-muted/30 p-2.5">
                        <p className="text-[10px] text-muted-foreground">Cliente</p>
                        <p className="text-sm font-semibold truncate">{selectedShift.client_name}</p>
                      </div>
                    )}
                    {selectedShift.location_name && (
                      <div className="rounded-xl bg-muted/30 p-2.5">
                        <p className="text-[10px] text-muted-foreground">Ubicación</p>
                        <p className="text-sm font-semibold truncate">{selectedShift.location_name}</p>
                      </div>
                    )}
                  </div>
                )}

                <Separator />

                {/* Employee list */}
                <h3 className="text-xs font-bold flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Equipo ({drawerAssignments.length})</h3>
                <div className="space-y-1.5">
                  {drawerAssignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Sin asignaciones</p>
                  ) : drawerAssignments.map(a => (
                    <div key={a.id} className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                      a.clocked_in ? "bg-earning/[0.05]" : a.status === "rejected" ? "bg-destructive/[0.05]" : "bg-muted/20",
                    )}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                          {a.first_name[0]}{a.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{a.first_name} {a.last_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {a.clocked_in && a.clock_in_time && (
                            <span className="text-[9px] text-earning">Fichó {format(new Date(a.clock_in_time), "HH:mm")}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {roleBadge(a.assignment_role)}
                        {empStateBadge(a)}
                      </div>
                      {a.phone_number && (
                        <a href={`https://wa.me/${a.phone_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                          className="shrink-0 rounded-lg p-1.5 hover:bg-muted/50 transition-colors">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Quick action */}
                <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => { setSelectedShiftId(null); navigate(`/app/shift-ops?id=${selectedShiftId}`); }}>
                  <Eye className="h-3.5 w-3.5" /> Abrir centro de operaciones del turno
                </Button>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
