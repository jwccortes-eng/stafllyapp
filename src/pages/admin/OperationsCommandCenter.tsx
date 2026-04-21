import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { format, addDays, isSameDay, differenceInMinutes, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSoundContext } from "@/hooks/useSound";

import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Loader2, Search, ChevronLeft, ChevronRight, Radio, Clock, AlertTriangle,
  Users, Car, Shield, Eye, CheckCircle2, XCircle, Phone, MessageSquare,
  MapPin, Building2, RefreshCw, Bell, Zap, UserPlus, Plus, Send,
  Activity, CalendarPlus, UserCheck, ArrowRight, Timer, CalendarIcon, LayoutGrid,
} from "lucide-react";
import { ReplacementSuggestionDialog } from "@/components/shifts/ReplacementSuggestionDialog";
import { OpsLiveMapPanel } from "@/components/operations/OpsLiveMapPanel";

// ─── Types ───
interface ShiftRow {
  id: string; title: string; date: string; start_time: string; end_time: string;
  status: string; slots: number; shift_code: string | null;
  client_id: string | null; location_id: string | null;
  shift_admin_id: string | null; driver_employee_id: string | null;
  transportation_required: boolean;
  client_name?: string; location_name?: string;
  assigned: number; confirmed: number; clocked_in: number; absent: number; pending: number;
  risk_level: "ok" | "warning" | "critical";
  admin_name?: string;
}

interface AlertRow {
  id: string; type: string; severity: string; description: string | null;
  employee_name: string; employee_id: string; employee_avatar?: string | null;
  shift_id: string | null; shift_title: string; client_name?: string;
  created_at: string; resolved_at: string | null; phone_number?: string | null;
  minutes_late?: number;
}

interface AssignmentRow {
  id: string; employee_id: string; status: string; assignment_role: string;
  first_name: string; last_name: string; phone_number: string | null;
  avatar_url: string | null;
  clocked_in: boolean; clock_in_time: string | null; confirmed_at: string | null;
}

interface ActivityEvent {
  id: string; type: string; title: string; body: string; created_at: string;
  employee_name?: string; employee_avatar?: string | null;
}

// ─── Constants ───
const RISK_STYLES = {
  ok: { bg: "bg-earning/10", text: "text-earning", label: "OK", dot: "bg-earning" },
  warning: { bg: "bg-warning/10", text: "text-warning", label: "Riesgo", dot: "bg-warning" },
  critical: { bg: "bg-destructive/10", text: "text-destructive", label: "Crítico", dot: "bg-destructive" },
};

const ALERT_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  no_show: { emoji: "❌", label: "No-show", color: "border-destructive/30 bg-destructive/[0.04]" },
  no_show_alert: { emoji: "❌", label: "No-show", color: "border-destructive/30 bg-destructive/[0.04]" },
  no_clockin: { emoji: "🚫", label: "Sin fichaje", color: "border-destructive/30 bg-destructive/[0.04]" },
  no_clockin_alert: { emoji: "🚫", label: "Sin fichaje", color: "border-warning/30 bg-warning/[0.04]" },
  no_confirmation: { emoji: "⏳", label: "Sin confirmar", color: "border-warning/30 bg-warning/[0.04]" },
  late_arrival: { emoji: "⏰", label: "Tardanza", color: "border-warning/30 bg-warning/[0.04]" },
  geofence_violation: { emoji: "📍", label: "Fuera de zona", color: "border-warning/30 bg-warning/[0.04]" },
  early_departure: { emoji: "🚪", label: "Salida temprana", color: "border-warning/30 bg-warning/[0.04]" },
};

export default function OperationsCommandCenter() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const { play } = useSoundContext();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [drawerAssignments, setDrawerAssignments] = useState<AssignmentRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{
    shiftId: string; shiftTitle: string; shiftDate: string;
    startTime: string; endTime: string; excludeIds: string[];
  } | null>(null);
  const [activeSection, setActiveSection] = useState("alerts");
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const prevAlertCountRef = useRef(0);

  const isToday = isSameDay(selectedDate, new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // ─── Load all data ───
  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const [shiftsRes, assignRes, entriesRes, alertsRes, clientsRes, locsRes, empsRes, notifRes] = await Promise.all([
      supabase.from("scheduled_shifts")
        .select("id, title, date, start_time, end_time, status, slots, shift_code, client_id, location_id, shift_admin_id, driver_employee_id, transportation_required")
        .eq("company_id", selectedCompanyId).eq("date", dateStr).is("deleted_at", null).order("start_time"),
      supabase.from("shift_assignments").select("id, shift_id, employee_id, status, assignment_role")
        .eq("company_id", selectedCompanyId),
      supabase.from("time_entries").select("id, employee_id, shift_id, clock_in, clock_out")
        .eq("company_id", selectedCompanyId).gte("clock_in", `${dateStr}T00:00:00`).lte("clock_in", `${dateStr}T23:59:59`),
      supabase.from("clock_alerts").select("id, type, severity, description, employee_id, shift_id, created_at, resolved_at")
        .eq("company_id", selectedCompanyId).is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId),
      supabase.from("locations").select("id, name").eq("company_id", selectedCompanyId),
      supabase.from("employees").select("id, first_name, last_name, avatar_url, phone_number")
        .eq("company_id", selectedCompanyId).eq("is_active", true),
      supabase.from("notifications").select("id, type, title, body, created_at, recipient_id, metadata")
        .eq("company_id", selectedCompanyId).gte("created_at", `${dateStr}T00:00:00`)
        .order("created_at", { ascending: false }).limit(30),
    ]);

    const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [c.id, c.name]));
    const locMap = new Map((locsRes.data ?? []).map((l: any) => [l.id, l.name]));
    const empMap = new Map((empsRes.data ?? []).map((e: any) => [e.id, e]));
    const allAssignments = assignRes.data ?? [];
    const allEntries = entriesRes.data ?? [];
    const now = new Date();

    // Build shift rows
    const shiftRows: ShiftRow[] = (shiftsRes.data ?? []).map((s: any) => {
      const sa = allAssignments.filter((a: any) => a.shift_id === s.id && !["rejected", "removed"].includes(a.status));
      const clockedIn = allEntries.filter((e: any) => e.shift_id === s.id && !e.clock_out).length;
      const confirmed = sa.filter((a: any) => a.status === "confirmed" || a.status === "accepted").length;
      const pending = sa.filter((a: any) => a.status === "pending").length;

      let risk_level: "ok" | "warning" | "critical" = "ok";
      const shiftStart = new Date(`${s.date}T${s.start_time}`);
      const minutesPast = (now.getTime() - shiftStart.getTime()) / 60000;

      if (sa.length < (s.slots ?? 1)) risk_level = "warning";
      if (minutesPast > 15 && clockedIn === 0 && sa.length > 0) risk_level = "critical";
      if (pending > 0 && minutesPast > 0) risk_level = "warning";
      if (sa.length === 0 && s.status === "published") risk_level = "critical";

      const adminEmp = s.shift_admin_id ? empMap.get(s.shift_admin_id) : null;

      return {
        ...s, client_name: s.client_id ? clientMap.get(s.client_id) : undefined,
        location_name: s.location_id ? locMap.get(s.location_id) : undefined,
        assigned: sa.length, confirmed, clocked_in: clockedIn,
        absent: Math.max(0, sa.length - clockedIn - pending), pending, risk_level,
        admin_name: adminEmp ? `${adminEmp.first_name} ${adminEmp.last_name}` : undefined,
      };
    });
    setShifts(shiftRows);

    // Build alert rows with employee info
    const shiftNameMap = new Map(shiftRows.map(s => [s.id, s]));
    setAlerts((alertsRes.data ?? []).map((a: any) => {
      const emp = empMap.get(a.employee_id);
      const shift = a.shift_id ? shiftNameMap.get(a.shift_id) : null;
      let minutesLate = 0;
      if (shift) {
        const shiftStart = new Date(`${shift.date}T${shift.start_time}`);
        minutesLate = Math.max(0, Math.floor((now.getTime() - shiftStart.getTime()) / 60000));
      }
      return {
        ...a,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "—",
        employee_avatar: emp?.avatar_url ?? null,
        phone_number: emp?.phone_number ?? null,
        shift_title: shift?.title ?? "—",
        client_name: shift?.client_name,
        minutes_late: minutesLate,
      };
    }));

    // Build activity feed from notifications
    setActivityFeed((notifRes.data ?? []).map((n: any) => {
      const empId = n.metadata?.employee_id;
      const emp = empId ? empMap.get(empId) : null;
      return {
        id: n.id, type: n.type, title: n.title, body: n.body, created_at: n.created_at,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : undefined,
        employee_avatar: emp?.avatar_url ?? null,
      };
    }));

    // Sound for new alerts
    const newAlertCount = (alertsRes.data ?? []).length;
    if (newAlertCount > prevAlertCountRef.current && prevAlertCountRef.current > 0) {
      play("alert");
    }
    prevAlertCountRef.current = newAlertCount;

    setLoading(false);
  }, [selectedCompanyId, dateStr, play]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Realtime subscriptions ───
  useEffect(() => {
    if (!selectedCompanyId) return;
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    const refresh = () => { loadData(); };

    const ch1 = supabase.channel("ops-pro-assign")
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_assignments", filter: `company_id=eq.${selectedCompanyId}` }, refresh)
      .subscribe();
    const ch2 = supabase.channel("ops-pro-clock")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_events", filter: `company_id=eq.${selectedCompanyId}` }, refresh)
      .subscribe();
    const ch3 = supabase.channel("ops-pro-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_alerts", filter: `company_id=eq.${selectedCompanyId}` }, refresh)
      .subscribe();
    const ch4 = supabase.channel("ops-pro-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `company_id=eq.${selectedCompanyId}` }, refresh)
      .subscribe();
    const ch5 = supabase.channel("ops-pro-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `company_id=eq.${selectedCompanyId}` }, () => {
        play("notification");
        refresh();
      })
      .subscribe();

    channelsRef.current = [ch1, ch2, ch3, ch4, ch5];
    return () => { channelsRef.current.forEach(ch => supabase.removeChannel(ch)); channelsRef.current = []; };
  }, [selectedCompanyId, loadData, play]);

  // ─── KPIs ───
  const totalActiveClocks = useMemo(() => shifts.reduce((n, s) => n + s.clocked_in, 0), [shifts]);
  const totalPending = useMemo(() => shifts.reduce((n, s) => n + s.pending, 0), [shifts]);
  const totalNoClockIn = useMemo(() => shifts.filter(s => {
    const ss = new Date(`${s.date}T${s.start_time}`);
    return new Date() > ss && s.clocked_in === 0 && s.assigned > 0;
  }).length, [shifts]);
  const criticalShifts = useMemo(() => shifts.filter(s => s.risk_level === "critical").length, [shifts]);
  const totalAlerts = alerts.length;

  // ─── Shift filters ───
  const filteredShifts = useMemo(() => {
    let list = shifts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.title.toLowerCase().includes(q) || s.client_name?.toLowerCase().includes(q) || s.location_name?.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") list = list.filter(s => s.risk_level === statusFilter);
    return list;
  }, [shifts, search, statusFilter]);

  const inProgressShifts = useMemo(() => {
    const now = new Date();
    return shifts.filter(s => {
      const start = new Date(`${s.date}T${s.start_time}`);
      const end = new Date(`${s.date}T${s.end_time}`);
      return now >= start && now <= end && s.assigned > 0;
    });
  }, [shifts]);

  const upcomingShifts = useMemo(() => {
    const now = new Date();
    return shifts.filter(s => new Date(`${s.date}T${s.start_time}`) > now);
  }, [shifts]);

  // ─── Drawer ───
  const selectedShift = useMemo(() => shifts.find(s => s.id === selectedShiftId), [shifts, selectedShiftId]);

  const loadDrawer = useCallback(async (shiftId: string) => {
    setSelectedShiftId(shiftId);
    setDrawerLoading(true);
    const [assignRes, entriesRes] = await Promise.all([
      supabase.from("shift_assignments").select("id, employee_id, status, assignment_role, employees(first_name, last_name, phone_number, avatar_url)")
        .eq("shift_id", shiftId) as any,
      supabase.from("time_entries").select("employee_id, clock_in").eq("shift_id", shiftId).is("clock_out", null),
    ]);
    const clockedSet = new Set((entriesRes.data ?? []).map((e: any) => e.employee_id));
    setDrawerAssignments((assignRes.data ?? []).map((a: any) => ({
      id: a.id, employee_id: a.employee_id, status: a.status, assignment_role: a.assignment_role,
      first_name: a.employees?.first_name ?? "—", last_name: a.employees?.last_name ?? "",
      phone_number: a.employees?.phone_number, avatar_url: a.employees?.avatar_url ?? null,
      clocked_in: clockedSet.has(a.employee_id),
      clock_in_time: (entriesRes.data ?? []).find((e: any) => e.employee_id === a.employee_id)?.clock_in ?? null,
      confirmed_at: null,
    })));
    setDrawerLoading(false);
  }, []);

  const resolveAlert = async (alertId: string) => {
    const { error } = await supabase.from("clock_alerts").update({ resolved_at: new Date().toISOString(), resolved_by: user?.id } as any).eq("id", alertId);
    if (error) toast.error(error.message);
    else { toast.success("Alerta resuelta"); setAlerts(prev => prev.filter(a => a.id !== alertId)); }
  };

  const openReplace = (s: ShiftRow) => {
    setReplaceTarget({
      shiftId: s.id, shiftTitle: s.title, shiftDate: s.date,
      startTime: s.start_time, endTime: s.end_time, excludeIds: [],
    });
  };

  // ─── Render helpers ───
  const empBadge = (status: string, clockedIn: boolean) => {
    if (clockedIn) return <Badge variant="success" className="text-[9px] gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-earning inline-block" />Fichado</Badge>;
    if (status === "confirmed" || status === "accepted") return <Badge variant="info" className="text-[9px]">Confirmado</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="text-[9px]">Rechazado</Badge>;
    return <Badge variant="warning" className="text-[9px]">Pendiente</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading flex items-center gap-2">
              Command Center
              {isToday && (
                <span className="flex items-center gap-1 text-[10px] text-earning font-bold bg-earning/10 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-earning animate-pulse" /> EN VIVO
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">Control operativo en tiempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(d => addDays(d, -1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={isToday ? "default" : "outline"} size="sm" className="h-8 text-xs min-w-[120px] gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5" />
                {isToday ? "Hoy" : format(selectedDate, "EEE d MMM", { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="p-2 border-t flex items-center justify-between">
                <Button variant="ghost" size="sm" className="text-xs h-7"
                  onClick={() => setSelectedDate(new Date())}>
                  Hoy
                </Button>
                <span className="text-[10px] text-muted-foreground pr-2">
                  {format(selectedDate, "PPP", { locale: es })}
                </span>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(d => addDays(d, 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadData}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <KpiCard value={totalActiveClocks} label="Fichajes activos" accent="earning" size="sm" icon={<Clock className="h-3.5 w-3.5 text-earning" />} />
        <KpiCard value={shifts.length} label="Turnos del día" accent="primary" size="sm" icon={<Zap className="h-3.5 w-3.5 text-primary" />} />
        <KpiCard value={totalPending} label="Sin confirmar" accent="warning" size="sm" icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />} />
        <KpiCard value={totalAlerts} label="Alertas activas" accent={totalAlerts > 0 ? "deduction" : "muted"} size="sm" icon={<Bell className="h-3.5 w-3.5 text-deduction" />} />
        <KpiCard value={criticalShifts} label="Turnos críticos" accent={criticalShifts > 0 ? "deduction" : "muted"} size="sm" icon={<XCircle className="h-3.5 w-3.5 text-deduction" />} />
      </div>

      {/* ─── Quick Actions Bar ─── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => navigate("/app/shifts")}>
          <CalendarPlus className="h-3.5 w-3.5" /> Crear turno
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => navigate("/app/invite-employees")}>
          <Send className="h-3.5 w-3.5" /> Invitar empleado
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => navigate("/app/timeclock")}>
          <Clock className="h-3.5 w-3.5" /> Time Clock
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => navigate("/app/live-map")}>
          <MapPin className="h-3.5 w-3.5" /> Live Map
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* ═══ LEFT: Main content (8 cols) ═══ */}
          <div className="xl:col-span-8 space-y-4">

            {/* ── A. LIVE ALERTS ── */}
            {alerts.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Alertas en vivo ({alerts.length})
                </h2>
                <div className="space-y-1.5">
                  {alerts.map(a => {
                    const cfg = ALERT_CONFIG[a.type] ?? { emoji: "⚠️", label: a.type, color: "border-border/30" };
                    return (
                      <div key={a.id} className={cn("rounded-xl border p-3 flex items-start gap-3", cfg.color)}>
                        {/* Avatar */}
                        <Avatar className="h-9 w-9 shrink-0">
                          {a.employee_avatar && <AvatarImage src={a.employee_avatar} />}
                          <AvatarFallback className="text-[10px] font-bold bg-destructive/10 text-destructive">
                            {a.employee_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold">{a.employee_name}</span>
                            <Badge variant={a.severity === "critical" ? "destructive" : "warning"} className="text-[8px] h-4">
                              {cfg.emoji} {cfg.label}
                            </Badge>
                            {a.minutes_late != null && a.minutes_late > 0 && (
                              <span className="text-[9px] text-destructive font-bold flex items-center gap-0.5">
                                <Timer className="h-2.5 w-2.5" /> +{a.minutes_late}min
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {a.shift_title}{a.client_name ? ` • ${a.client_name}` : ""}
                          </p>
                          <p className="text-[9px] text-muted-foreground/50">{format(new Date(a.created_at), "HH:mm")}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {a.phone_number && (
                            <a href={`https://wa.me/${a.phone_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                              className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors" title="WhatsApp">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                          )}
                          {a.shift_id && (
                            <Button size="sm" variant="default" className="h-7 text-[9px] gap-1 px-2" onClick={() => {
                              const s = shifts.find(sh => sh.id === a.shift_id);
                              if (s) openReplace(s);
                            }}>
                              <UserPlus className="h-3 w-3" /> Reemplazar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-[9px] px-2" onClick={() => resolveAlert(a.id)}>
                            <CheckCircle2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── B. IN-PROGRESS SHIFTS ── */}
            {inProgressShifts.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-earning flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" /> En progreso ({inProgressShifts.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {inProgressShifts.map(s => (
                    <ShiftCard key={s.id} shift={s} onClick={() => loadDrawer(s.id)} onReplace={() => openReplace(s)} variant="in-progress" />
                  ))}
                </div>
              </section>
            )}

            {/* ── C. ALL DAY SHIFTS ── */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-primary" /> Turnos del día ({filteredShifts.length})
                </h2>
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 h-7 w-40 text-xs" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-7 w-auto min-w-[80px] text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ok">✅ OK</SelectItem>
                      <SelectItem value="warning">⚠️ Riesgo</SelectItem>
                      <SelectItem value="critical">🔴 Crítico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredShifts.length === 0 ? (
                <div className="rounded-2xl border border-border/30 bg-card p-8 text-center text-sm text-muted-foreground">
                  No hay turnos para esta fecha
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredShifts.map(s => (
                    <ShiftCard key={s.id} shift={s} onClick={() => loadDrawer(s.id)} onReplace={() => openReplace(s)} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ═══ RIGHT: Activity Feed (4 cols) ═══ */}
          <div className="xl:col-span-4 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Actividad en tiempo real
            </h2>
            <ScrollArea className="h-[600px] rounded-2xl border border-border/30 bg-card">
              {activityFeed.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Sin actividad hoy</div>
              ) : (
                <div className="divide-y divide-border/20">
                  {activityFeed.map(ev => (
                    <div key={ev.id} className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-muted/20 transition-colors">
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        {ev.employee_avatar && <AvatarImage src={ev.employee_avatar} />}
                        <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                          {ev.employee_name ? ev.employee_name.split(" ").map(n => n[0]).join("").slice(0, 2) : "📢"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold truncate">{ev.title}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{ev.body}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{format(new Date(ev.created_at), "HH:mm")}</p>
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
            <SheetTitle className="flex items-center gap-2 text-sm">
              {selectedShift?.title}
              {selectedShift && (
                <Badge variant="outline" className={cn("text-[9px]", RISK_STYLES[selectedShift.risk_level].text)}>
                  {RISK_STYLES[selectedShift.risk_level].label}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {drawerLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <ScrollArea className="h-[calc(100vh-120px)] mt-4">
              <div className="space-y-4 pr-2">
                {selectedShift && (
                  <div className="grid grid-cols-2 gap-2">
                    <InfoCell label="Horario" value={`${selectedShift.start_time.slice(0, 5)} – ${selectedShift.end_time.slice(0, 5)}`} />
                    <InfoCell label="Plazas" value={`${selectedShift.assigned} / ${selectedShift.slots ?? 1}`} />
                    {selectedShift.client_name && <InfoCell label="Cliente" value={selectedShift.client_name} />}
                    {selectedShift.location_name && <InfoCell label="Ubicación" value={selectedShift.location_name} />}
                    {selectedShift.admin_name && <InfoCell label="Admin" value={selectedShift.admin_name} />}
                  </div>
                )}

                <Separator />

                <h3 className="text-xs font-bold flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Equipo ({drawerAssignments.length})</h3>
                <div className="space-y-1">
                  {drawerAssignments.map(a => (
                    <div key={a.id} className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                      a.clocked_in ? "bg-earning/[0.05]" : a.status === "rejected" ? "bg-destructive/[0.05]" : "bg-muted/20",
                    )}>
                      <Avatar className="h-8 w-8">
                        {a.avatar_url && <AvatarImage src={a.avatar_url} />}
                        <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                          {a.first_name[0]}{a.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{a.first_name} {a.last_name}</p>
                        {a.clocked_in && a.clock_in_time && (
                          <span className="text-[9px] text-earning">Fichó {format(new Date(a.clock_in_time), "HH:mm")}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {a.assignment_role === "shift_admin" && <Badge variant="info" className="text-[8px]">🛡️</Badge>}
                        {a.assignment_role === "driver" && <Badge variant="warning" className="text-[8px]">🚗</Badge>}
                        {empBadge(a.status, a.clocked_in)}
                      </div>
                      {a.phone_number && (
                        <a href={`https://wa.me/${a.phone_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                          className="shrink-0 rounded-lg p-1.5 hover:bg-muted/50">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                <Separator />

                {selectedShift && (
                  <Button size="sm" className="w-full gap-2 text-xs" onClick={() => openReplace(selectedShift)}>
                    <UserPlus className="h-3.5 w-3.5" /> Buscar reemplazo
                  </Button>
                )}
                <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => { setSelectedShiftId(null); navigate(`/app/shift-ops?id=${selectedShiftId}`); }}>
                  <Eye className="h-3.5 w-3.5" /> Abrir operaciones del turno
                </Button>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      {/* Replacement dialog */}
      {replaceTarget && selectedCompanyId && (
        <ReplacementSuggestionDialog
          open={!!replaceTarget}
          onOpenChange={o => { if (!o) setReplaceTarget(null); }}
          shiftId={replaceTarget.shiftId} shiftTitle={replaceTarget.shiftTitle}
          shiftDate={replaceTarget.shiftDate} shiftStartTime={replaceTarget.startTime}
          shiftEndTime={replaceTarget.endTime} companyId={selectedCompanyId}
          excludeEmployeeIds={replaceTarget.excludeIds}
          onAssigned={() => { loadData(); if (selectedShiftId) loadDrawer(selectedShiftId); }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───

function ShiftCard({ shift: s, onClick, onReplace, variant }: {
  shift: ShiftRow; onClick: () => void; onReplace: () => void; variant?: "in-progress";
}) {
  const risk = RISK_STYLES[s.risk_level];
  const isInProgress = variant === "in-progress";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left transition-all hover:shadow-md active:scale-[0.995]",
        s.risk_level === "critical" && "border-destructive/25",
        s.risk_level === "warning" && "border-warning/25",
        isInProgress && "border-earning/20 bg-earning/[0.02]",
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Risk dot */}
        <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", risk.dot)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold truncate">{s.title}</p>
            {s.shift_code && <span className="text-[9px] text-muted-foreground/50">#{String(s.shift_code).padStart(4, "0")}</span>}
            <Badge variant="outline" className={cn("text-[8px] h-4", risk.text)}>{risk.label}</Badge>
          </div>

          <div className="flex items-center gap-2.5 mt-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5 font-medium tabular-nums">
              <Clock className="h-2.5 w-2.5" />{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
            </span>
            {s.client_name && <span className="flex items-center gap-0.5 truncate"><Building2 className="h-2.5 w-2.5" />{s.client_name}</span>}
            {s.location_name && <span className="flex items-center gap-0.5 truncate"><MapPin className="h-2.5 w-2.5" />{s.location_name}</span>}
          </div>

          {/* Staff stats */}
          <div className="flex items-center gap-2 mt-1.5">
            <StatChip value={s.assigned} max={s.slots ?? 1} label="asignados" color="muted" />
            <StatChip value={s.clocked_in} label="fichados" color="earning" />
            {s.pending > 0 && <StatChip value={s.pending} label="pend." color="warning" />}
            {s.transportation_required && (
              <Car className={cn("h-3.5 w-3.5", s.driver_employee_id ? "text-earning" : "text-destructive")} />
            )}
            {s.admin_name && (
              <span className="text-[9px] text-primary/70 flex items-center gap-0.5 ml-auto truncate max-w-[100px]">
                <Shield className="h-2.5 w-2.5" />{s.admin_name.split(" ")[0]}
              </span>
            )}
          </div>
        </div>

        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mt-1" />
      </div>
    </button>
  );
}

function StatChip({ value, max, label, color }: { value: number; max?: number; label: string; color: string }) {
  const colors = {
    earning: "text-earning",
    warning: "text-warning",
    deduction: "text-destructive",
    muted: "text-foreground",
  };
  return (
    <span className={cn("text-[9px] font-medium", colors[color as keyof typeof colors] ?? "text-foreground")}>
      <span className="font-bold tabular-nums">{value}</span>
      {max != null && <span className="text-muted-foreground/40">/{max}</span>}
      <span className="text-muted-foreground/60 ml-0.5">{label}</span>
    </span>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/30 p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold truncate">{value}</p>
    </div>
  );
}
