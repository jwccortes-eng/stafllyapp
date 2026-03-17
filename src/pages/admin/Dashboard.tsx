import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays, Users, DollarSign, FileSpreadsheet,
  Upload, Tags, BarChart3, ArrowRight, TrendingUp,
  Zap, Clock, Sparkles, Megaphone, Pin, AlertTriangle,
  ChevronRight, Activity, ThumbsUp, Plus,
  Inbox, MapPin, Building2, MessageCircle, Crown, ExternalLink,
  ClipboardList, UserCheck, AlertCircle, CheckCircle2,
  Calendar, Timer, Shield, Receipt, Briefcase, Camera,
  Search, MoreVertical,
} from "lucide-react";
import { PeriodStatusBanner } from "@/components/ui/period-status-banner";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { usePayrollConfig, calculateOverdue, DAY_NAMES, type PeriodOverdueInfo } from "@/hooks/usePayrollConfig";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { format, parseISO, formatDistanceToNow, startOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";
import { DashboardWidgetSettings } from "@/components/DashboardWidgetSettings";
import { Badge } from "@/components/ui/badge";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { PendingReviewsWidget } from "@/components/reviews/PendingReviewsWidget";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ErrorBlock } from "@/components/ui/error-block";

/* ─── animated counter hook ─── */
function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round((target) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

/* ─── Sparkline Mini ─── */
function Sparkline({ data, color = "hsl(var(--primary))" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const chartData = data.map((v, i) => ({ v, i }));
  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Hero KPI Card (large, reference style) ─── */
function HeroKpiCard({ label, value, icon: Icon, color, onClick }: {
  label: string; value: string | number;
  icon: any; color: "primary" | "warning" | "earning";
  onClick?: () => void;
}) {
  const colorMap = {
    primary: { iconBg: "bg-primary/[0.1]", iconColor: "text-primary", valueColor: "text-primary" },
    warning: { iconBg: "bg-warning/[0.1]", iconColor: "text-warning", valueColor: "text-warning" },
    earning: { iconBg: "bg-earning/[0.1]", iconColor: "text-earning", valueColor: "text-earning" },
  };
  const c = colorMap[color];

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card rounded-2xl border border-border/40 p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center", c.iconBg)}>
          <Icon className={cn("h-5 w-5", c.iconColor)} />
        </div>
      </div>
      <p className={cn("text-3xl md:text-4xl font-bold font-heading tabular-nums leading-none", c.valueColor)}>
        {value}
      </p>
      <p className="text-sm text-muted-foreground font-medium mt-2">{label}</p>
    </div>
  );
}

/* ─── Smaller KPI Card ─── */
function KpiStatCard({ label, value, subtitle, icon: Icon, color, sparkData, onClick }: {
  label: string; value: string | number; subtitle: string;
  icon: any; color: "primary" | "warning" | "deduction" | "earning";
  sparkData?: number[];
  onClick?: () => void;
}) {
  const colorMap = {
    primary: { bg: "bg-primary/[0.08]", text: "text-primary", icon: "text-primary", ring: "ring-primary/10", spark: "hsl(var(--primary))" },
    warning: { bg: "bg-warning/[0.08]", text: "text-warning", icon: "text-warning", ring: "ring-warning/10", spark: "hsl(var(--warning))" },
    deduction: { bg: "bg-deduction/[0.08]", text: "text-deduction", icon: "text-deduction", ring: "ring-deduction/10", spark: "hsl(var(--destructive))" },
    earning: { bg: "bg-earning/[0.08]", text: "text-earning", icon: "text-earning", ring: "ring-earning/10", spark: "hsl(var(--earning))" },
  };
  const c = colorMap[color];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative bg-card rounded-2xl border border-border/40 p-5 shadow-xs transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 overflow-hidden",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center ring-1", c.bg, c.ring)}>
            <Icon className={cn("h-[18px] w-[18px]", c.icon)} />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} color={c.spark} />}
      </div>
      <p className={cn("text-2xl md:text-3xl font-bold font-heading tabular-nums leading-none", c.text)}>{value}</p>
      <p className="text-[11px] text-muted-foreground/70 mt-1.5">{subtitle}</p>
    </div>
  );
}

/* ─── Weekly Shift Preview Card ─── */
function WeeklyShiftPreview({ companyId, navigate }: { companyId: string; navigate: (to: string) => void }) {
  const [weekShifts, setWeekShifts] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 0 }), []);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    if (!companyId) return;
    const startStr = format(weekDays[0], "yyyy-MM-dd");
    const endStr = format(weekDays[6], "yyyy-MM-dd");

    async function fetchWeek() {
      const [shiftsRes, empRes] = await Promise.all([
        supabase.from("scheduled_shifts").select("id, date, start_time, end_time, title, client_id, status")
          .eq("company_id", companyId).gte("date", startStr).lte("date", endStr).is("deleted_at", null)
          .order("start_time"),
        supabase.from("employees").select("id, first_name, last_name").eq("company_id", companyId).eq("is_active", true),
      ]);
      
      const shifts = shiftsRes.data ?? [];
      setWeekShifts(shifts);
      setEmployees(empRes.data ?? []);

      if (shifts.length > 0) {
        const shiftIds = shifts.map(s => s.id);
        const { data: assigns } = await supabase.from("shift_assignments")
          .select("id, shift_id, employee_id, status")
          .in("shift_id", shiftIds);
        setAssignments(assigns ?? []);
      }
    }
    fetchWeek();
  }, [companyId]);

  const SHIFT_COLORS = [
    "bg-green-100 text-green-700 border-green-200",
    "bg-blue-100 text-blue-700 border-blue-200",
    "bg-purple-100 text-purple-700 border-purple-200",
    "bg-pink-100 text-pink-700 border-pink-200",
    "bg-yellow-100 text-yellow-700 border-yellow-200",
    "bg-orange-100 text-orange-700 border-orange-200",
    "bg-teal-100 text-teal-700 border-teal-200",
    "bg-indigo-100 text-indigo-700 border-indigo-200",
    "bg-red-100 text-red-700 border-red-200",
    "bg-cyan-100 text-cyan-700 border-cyan-200",
  ];

  const employeeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((emp, i) => {
      map.set(emp.id, SHIFT_COLORS[i % SHIFT_COLORS.length]);
    });
    return map;
  }, [employees]);

  const getEmployeeName = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    return emp ? emp.first_name : "—";
  };

  // Group by date → list of assigned employees
  const dayData = weekDays.map(day => {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayShifts = weekShifts.filter(s => s.date === dateStr);
    const dayAssigns = dayShifts.flatMap(s => 
      assignments.filter(a => a.shift_id === s.id).map(a => ({
        ...a,
        shiftTitle: s.title,
        startTime: s.start_time,
      }))
    );
    return { date: day, dateStr, shifts: dayShifts, assigns: dayAssigns };
  });

  return (
    <Card className="rounded-2xl shadow-sm border-border/40 overflow-hidden">
      <CardHeader className="pb-3 px-6 pt-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold font-heading">Weekly Shift</CardTitle>
          <div className="flex items-center gap-2">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <Search className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
            <button 
              onClick={() => navigate("/app/shifts")}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-5">
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-px min-w-[600px]">
            {/* Day headers */}
            {dayData.map(d => (
              <div key={d.dateStr} className="text-center pb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {format(d.date, "EEE", { locale: es })}
                </p>
                <p className="text-sm font-bold text-foreground mt-0.5">{format(d.date, "d")}</p>
              </div>
            ))}

            {/* Shift cells */}
            {dayData.map(d => (
              <div key={`cells-${d.dateStr}`} className="space-y-1.5 px-0.5 min-h-[120px]">
                {d.assigns.length === 0 && d.shifts.length === 0 ? (
                  <div className="h-full" />
                ) : (
                  d.assigns.slice(0, 4).map(a => {
                    const colorClasses = employeeColorMap.get(a.employee_id) || SHIFT_COLORS[0];
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-[11px] font-medium border truncate cursor-pointer hover:opacity-80 transition-opacity",
                          colorClasses
                        )}
                        onClick={() => navigate("/app/shifts")}
                      >
                        {getEmployeeName(a.employee_id)}
                      </div>
                    );
                  })
                )}
                {d.assigns.length > 4 && (
                  <p className="text-[10px] text-muted-foreground text-center font-medium">
                    +{d.assigns.length - 4} más
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Quick Action ─── */
function QuickAction({ label, description, icon: Icon, to, accent, navigate }: {
  label: string; description: string; icon: any; to: string; accent: string; navigate: (to: string) => void;
}) {
  return (
    <button
      onClick={() => navigate(to)}
      className="group flex items-center gap-3.5 p-3.5 rounded-2xl border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm transition-all duration-200 text-left active:scale-[0.98]"
    >
      <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-2xs transition-transform duration-200 group-hover:scale-105", accent)}>
        <Icon className="h-[18px] w-[18px] text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground/70 truncate">{description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}

/* ─── Activity Item ─── */
function ActivityRow({ item }: { item: any }) {
  const actionLabels: Record<string, string> = {
    create: "creó", update: "actualizó", delete: "eliminó",
    insert: "agregó", import: "importó", publish: "publicó",
  };
  const entityLabels: Record<string, string> = {
    employee: "empleado", movement: "novedad", period: "periodo",
    concept: "concepto", shift: "turno", announcement: "anuncio",
    import: "importación", client: "cliente", location: "ubicación",
  };
  const iconMap: Record<string, any> = {
    employee: Users, movement: DollarSign, period: CalendarDays,
    shift: Clock, announcement: Megaphone, import: Upload,
    client: Building2, location: MapPin, concept: Tags,
  };
  const IconComp = iconMap[item.entity_type] || Activity;

  return (
    <div className="px-4 py-3 hover:bg-accent/20 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-lg bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
          <IconComp className="h-3 w-3 text-primary/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-foreground leading-relaxed">
            <span className="font-semibold capitalize">{actionLabels[item.action] || item.action}</span>
            {" "}un{" "}
            <span className="font-medium">{entityLabels[item.entity_type] || item.entity_type}</span>
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true, locale: es })}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════ */

export default function AdminDashboard() {
  const { selectedCompanyId, selectedCompany, isModuleActive, companies, setSelectedCompanyId } = useCompany();
  const { role, hasModuleAccess, fullName } = useAuth();
  const { config: payrollConfig, currentWeek } = usePayrollConfig();
  const navigate = useNavigate();
  const { widgets, enabledWidgets, toggleWidget, moveWidget, resetWidgets } = useDashboardWidgets();

  const [stats, setStats] = useState({
    totalEmployees: 0, activePeriod: null as string | null, periodStatus: null as string | null,
    totalImports: 0, totalMovements: 0, periodTotal: 0,
    periodStartDate: null as string | null, periodEndDate: null as string | null,
    pendingTickets: 0,
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [feedAnnouncements, setFeedAnnouncements] = useState<any[]>([]);
  const [activityItems, setActivityItems] = useState<any[]>([]);
  const [overdueInfos, setOverdueInfos] = useState<PeriodOverdueInfo[]>([]);
  const [periodSummary, setPeriodSummary] = useState({ open: 0, closed: 0, published: 0, paid: 0 });
  const [sparkEmployees, setSparkEmployees] = useState<number[]>([]);
  const [sparkPayments, setSparkPayments] = useState<number[]>([]);
  const [pendingCounts, setPendingCounts] = useState({ shiftRequests: 0, pendingMovements: 0, openTickets: 0, pendingAttendance: 0 });
  const [todaySummary, setTodaySummary] = useState({ shiftsToday: 0, assignedToday: 0, clockedIn: 0, openEntries: 0 });
  const [commercialKpis, setCommercialKpis] = useState({ activeClients: 0, openRequests: 0, unpaidInvoices: 0, overdueInvoices: 0, unpaidTotal: 0, overdueTotal: 0 });
  const [missingPhotoCount, setMissingPhotoCount] = useState(0);
  const [totalHoursWorked, setTotalHoursWorked] = useState(0);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setFetchError(false);
    async function fetchStats() {
      try {
      const [empRes, periodRes, impRes, movRes, ticketsRes] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true).eq("company_id", selectedCompanyId!),
        supabase.from("pay_periods").select("*").eq("company_id", selectedCompanyId!)
          .lte("start_date", new Date().toISOString().slice(0, 10))
          .order("start_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("imports").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!),
        supabase.from("movements").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!),
        supabase.from("employee_tickets").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).in("status", ["new", "in_progress"]),
      ]);

      let periodTotal = 0;
      if (periodRes.data) {
        const { data: basePays } = await supabase
          .from("period_base_pay").select("base_total_pay, total_hours").eq("period_id", periodRes.data.id);
        periodTotal = (basePays ?? []).reduce((s, bp) => s + Number(bp.base_total_pay || 0), 0);
        const hours = (basePays ?? []).reduce((s, bp) => s + Number(bp.total_hours || 0), 0);
        setTotalHoursWorked(Math.round(hours * 10) / 10);
      }

      setStats({
        totalEmployees: empRes.count ?? 0,
        activePeriod: periodRes.data ? `${periodRes.data.start_date} → ${periodRes.data.end_date}` : null,
        periodStatus: periodRes.data?.status ?? null,
        totalImports: impRes.count ?? 0,
        totalMovements: movRes.count ?? 0,
        periodTotal: Math.round(periodTotal * 100) / 100,
        periodStartDate: periodRes.data?.start_date ?? null,
        periodEndDate: periodRes.data?.end_date ?? null,
        pendingTickets: ticketsRes.count ?? 0,
      });
      setLoading(false);
      } catch (err) {
        console.error("Dashboard fetchStats error:", err);
        setFetchError(true);
        setLoading(false);
      }
    }

    async function fetchChartData() {
      const { data: periods } = await supabase
        .from("pay_periods").select("id, start_date, end_date")
        .eq("company_id", selectedCompanyId!).order("start_date", { ascending: true }).limit(8);
      if (!periods || periods.length === 0) { setChartData([]); setSparkPayments([]); return; }

      const periodIds = periods.map(p => p.id);
      const [baseRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").in("period_id", periodIds),
        supabase.from("movements").select("period_id, total_value, concept_id, concepts(category)").in("period_id", periodIds),
      ]);

      const mapped = periods.map(p => {
        const base = (baseRes.data ?? []).filter(bp => bp.period_id === p.id).reduce((s, bp) => s + Number(bp.base_total_pay || 0), 0);
        const extras = (movRes.data ?? []).filter((m: any) => m.period_id === p.id && m.concepts?.category === "extra").reduce((s, m) => s + Number(m.total_value || 0), 0);
        const deducciones = (movRes.data ?? []).filter((m: any) => m.period_id === p.id && m.concepts?.category === "deduction").reduce((s, m) => s + Math.abs(Number(m.total_value || 0)), 0);
        return { label: format(parseISO(p.start_date), "dd MMM", { locale: es }), base: Math.round(base), extras: Math.round(extras), deducciones: Math.round(deducciones) };
      });
      setChartData(mapped);
      setSparkPayments(mapped.map(d => d.base + d.extras));
    }

    async function fetchFeed() {
      const [annRes, actRes] = await Promise.all([
        supabase.from("announcements").select("id, title, body, priority, pinned, published_at, media_urls")
          .eq("company_id", selectedCompanyId!).not("published_at", "is", null).is("deleted_at", null)
          .order("published_at", { ascending: false }).limit(5),
        supabase.from("activity_log").select("id, action, entity_type, entity_id, created_at, details")
          .eq("company_id", selectedCompanyId!).order("created_at", { ascending: false }).limit(10),
      ]);

      const anns = (annRes.data ?? []) as any[];
      if (anns.length > 0) {
        const annIds = anns.map(a => a.id);
        const { data: reactions } = await supabase.from("announcement_reactions").select("announcement_id").in("announcement_id", annIds);
        const countMap: Record<string, number> = {};
        (reactions ?? []).forEach(r => { countMap[r.announcement_id] = (countMap[r.announcement_id] || 0) + 1; });
        setFeedAnnouncements(anns.map(a => ({ ...a, media_urls: Array.isArray(a.media_urls) ? a.media_urls : [], reaction_count: countMap[a.id] || 0 })));
      } else {
        setFeedAnnouncements([]);
      }
      setActivityItems(actRes.data ?? []);
    }

    fetchStats();
    fetchChartData();
    fetchFeed();

    // Fetch pending request counts
    async function fetchPendingCounts() {
      const today = new Date().toISOString().split("T")[0];
      const [shiftReqRes, movRes, ticketRes, attRes] = await Promise.all([
        supabase.from("shift_requests").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).eq("status", "pending"),
        supabase.from("movements").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).eq("approval_status", "pending"),
        supabase.from("employee_tickets").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).in("status", ["new", "in_progress"]),
        supabase.from("shift_attendance_confirmations").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).eq("status", "pending"),
      ]);
      setPendingCounts({
        shiftRequests: shiftReqRes.count ?? 0,
        pendingMovements: movRes.count ?? 0,
        openTickets: ticketRes.count ?? 0,
        pendingAttendance: attRes.count ?? 0,
      });
    }
    fetchPendingCounts();

    // Fetch employees missing profile photo
    async function fetchMissingPhotos() {
      const { count } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true)
        .is("avatar_url", null);
      setMissingPhotoCount(count ?? 0);
    }
    fetchMissingPhotos();

    // Fetch today summary
    async function fetchTodaySummary() {
      const today = new Date().toISOString().split("T")[0];
      const [shiftsRes, assignRes, clockRes] = await Promise.all([
        supabase.from("scheduled_shifts").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).eq("date", today).is("deleted_at", null),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).eq("status", "confirmed")
          .in("shift_id", (await supabase.from("scheduled_shifts").select("id").eq("company_id", selectedCompanyId!).eq("date", today).is("deleted_at", null)).data?.map(s => s.id) ?? []),
        supabase.from("time_entries" as any).select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).is("clock_out" as any, null),
      ]);
      setTodaySummary({
        shiftsToday: shiftsRes.count ?? 0,
        assignedToday: assignRes.count ?? 0,
        clockedIn: 0,
        openEntries: clockRes.count ?? 0,
      });
    }
    fetchTodaySummary();

    // Fetch commercial KPIs
    async function fetchCommercialKpis() {
      const [clientsRes, reqRes, invRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).is("deleted_at", null).eq("status", "active"),
        supabase.from("staffing_requests").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!).not("status", "in", '("completed","cancelled","rejected")'),
        supabase.from("invoices").select("id, status, grand_total").eq("company_id", selectedCompanyId!),
      ]);
      const invoices = invRes.data ?? [];
      const unpaid = invoices.filter(i => ["issued","sent","viewed","overdue"].includes(i.status));
      const overdue = invoices.filter(i => i.status === "overdue");
      setCommercialKpis({
        activeClients: clientsRes.count ?? 0,
        openRequests: reqRes.count ?? 0,
        unpaidInvoices: unpaid.length,
        overdueInvoices: overdue.length,
        unpaidTotal: unpaid.reduce((s, i) => s + (i.grand_total || 0), 0),
        overdueTotal: overdue.reduce((s, i) => s + (i.grand_total || 0), 0),
      });
    }
    fetchCommercialKpis();

    supabase.from("employees").select("created_at")
      .eq("company_id", selectedCompanyId!).eq("is_active", true)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const months: Record<string, number> = {};
        data.forEach(e => {
          const m = format(parseISO(e.created_at), "yyyy-MM");
          months[m] = (months[m] || 0) + 1;
        });
        const keys = Object.keys(months).sort().slice(-6);
        let cum = data.filter(e => format(parseISO(e.created_at), "yyyy-MM") < (keys[0] || "")).length;
        setSparkEmployees(keys.map(k => { cum += months[k]; return cum; }));
      });

    async function fetchOverdueInfo() {
      const { data: allPeriods } = await supabase.from("pay_periods")
        .select("id, start_date, end_date, status, paid_at, published_at")
        .eq("company_id", selectedCompanyId!).order("start_date", { ascending: false }).limit(20);
      if (allPeriods && allPeriods.length > 0) {
        const infos = allPeriods.map(p => calculateOverdue(p, payrollConfig));
        setOverdueInfos(infos.filter(i => i.isOverdue));
        setPeriodSummary({
          open: allPeriods.filter(p => p.status === "open").length,
          closed: allPeriods.filter(p => p.status === "closed").length,
          published: allPeriods.filter(p => !!p.published_at).length,
          paid: allPeriods.filter(p => !!(p as any).paid_at).length,
        });
      }
    }
    fetchOverdueInfo();
  }, [selectedCompanyId, payrollConfig]);

  const periodProgress = useMemo(() => {
    if (!stats.periodStartDate || !stats.periodEndDate) return 0;
    const start = new Date(stats.periodStartDate).getTime();
    const end = new Date(stats.periodEndDate).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.round(((now - start) / (end - start)) * 100);
  }, [stats.periodStartDate, stats.periodEndDate]);

  const canAccess = (module: string) => {
    if (!isModuleActive(module)) return false;
    if (role === 'developer' || role === 'owner' || role === 'admin') return true;
    if (role === 'manager' || role === 'supervisor') return hasModuleAccess(module, 'view');
    return false;
  };

  const animEmployees = useAnimatedNumber(stats.totalEmployees);
  const animMovements = useAnimatedNumber(stats.totalMovements);
  const animHours = useAnimatedNumber(totalHoursWorked);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const quickActions = [
    { label: "Importar horas", icon: Upload, to: "/app/import", module: "import", description: "Sube el archivo de Connecteam", accent: "from-primary to-primary/70" },
    { label: "Agregar novedad", icon: DollarSign, to: "/app/movements", module: "movements", description: "Extras, deducciones y ajustes", accent: "from-warning to-warning/70" },
    { label: "Ver resumen", icon: FileSpreadsheet, to: "/app/summary", module: "summary", description: "Resumen del periodo actual", accent: "from-earning to-earning/70" },
    { label: "Empleados", icon: Users, to: "/app/employees", module: "employees", description: "Gestión de empleados", accent: "from-primary to-primary/70" },
    { label: "Conceptos", icon: Tags, to: "/app/concepts", module: "concepts", description: "Configura conceptos de pago", accent: "from-deduction to-deduction/70" },
    { label: "Reportes", icon: BarChart3, to: "/app/reports", module: "reports", description: "Genera y guarda reportes", accent: "from-primary to-primary/70" },
  ].filter(a => canAccess(a.module));

  const statusColor = stats.periodStatus === 'open' ? 'earning' : stats.periodStatus === 'closed' ? 'warning' : 'primary';
  const statusLabel = stats.periodStatus === 'open' ? 'Abierto' : stats.periodStatus === 'closed' ? 'Cerrado' : 'Publicado';

  /* ─── Widget renderers ─── */
  const isWidgetEnabled = (id: string) => enabledWidgets.some(w => w.id === id);

  const widgetRenderers: Record<string, () => React.ReactNode> = {
    period_banner: () => (
      <PeriodStatusBanner
        open={periodSummary.open}
        closed={periodSummary.closed}
        published={periodSummary.published}
        paid={periodSummary.paid}
        overdueCount={overdueInfos.length}
        overdueDays={overdueInfos.length > 0 ? Math.max(...overdueInfos.map(i => i.overdueDays)) : undefined}
        onOverdueClick={overdueInfos.length > 0 ? () => navigate("/app/periods") : undefined}
      />
    ),
    kpis: () => loading ? (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-36 animate-pulse bg-muted/50 rounded-2xl" />)}
      </div>
    ) : (
      <>
        {/* Hero KPI row — 3 large cards like reference */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <HeroKpiCard
            label="Hours Worked"
            value={animHours || animEmployees}
            icon={Clock}
            color="primary"
            onClick={() => navigate("/app/timeclock")}
          />
          <HeroKpiCard
            label="Employees Scheduled"
            value={`${animEmployees}`}
            icon={Users}
            color="earning"
            onClick={() => navigate("/app/employees")}
          />
          <HeroKpiCard
            label="Payroll Total"
            value={`$${stats.periodTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
            icon={DollarSign}
            color="warning"
            onClick={() => navigate("/app/summary")}
          />
        </div>
      </>
    ),
    weekly_shifts: () => selectedCompanyId ? (
      <WeeklyShiftPreview companyId={selectedCompanyId} navigate={navigate} />
    ) : null,
    quick_actions: () => quickActions.length > 0 ? (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-3.5 w-3.5 text-warning" />
          <h2 className="text-sm font-semibold font-heading text-foreground">Accesos rápidos</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {quickActions.map((action) => (
            <QuickAction key={action.to} {...action} navigate={navigate} />
          ))}
        </div>
      </div>
    ) : null,
    pending_requests: () => {
      const totalPending = pendingCounts.shiftRequests + pendingCounts.pendingMovements + pendingCounts.openTickets + pendingCounts.pendingAttendance + missingPhotoCount;
      const items = [
        { label: "Solicitudes de turno", count: pendingCounts.shiftRequests, icon: ClipboardList, color: "text-primary", bg: "bg-primary/[0.08]", to: "/app/shift-requests" },
        { label: "Novedades pendientes", count: pendingCounts.pendingMovements, icon: DollarSign, color: "text-warning", bg: "bg-warning/[0.08]", to: "/app/movements" },
        { label: "Tickets abiertos", count: pendingCounts.openTickets, icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/[0.08]", to: "/app/requests" },
        { label: "Asistencia sin confirmar", count: pendingCounts.pendingAttendance, icon: UserCheck, color: "text-earning", bg: "bg-earning/[0.08]", to: "/app/shifts" },
        { label: "Sin foto de perfil", count: missingPhotoCount, icon: Camera, color: "text-warning", bg: "bg-warning/[0.08]", to: "/app/employees" },
      ];
      return (
        <Card className="rounded-2xl shadow-sm border-border/40 overflow-hidden">
          <CardHeader className="pb-3 px-5 pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-destructive/[0.08] flex items-center justify-center">
                  <Inbox className="h-3.5 w-3.5 text-destructive" />
                </div>
                <CardTitle className="text-sm font-semibold font-heading">Pendientes</CardTitle>
                {totalPending > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-5 px-1.5 rounded-full animate-pulse">
                    {totalPending}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {totalPending === 0 ? (
              <div className="text-center py-6">
                <div className="h-10 w-10 rounded-xl bg-earning/[0.08] flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="h-4 w-4 text-earning" />
                </div>
                <p className="text-xs font-medium text-earning">¡Todo al día!</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">No hay solicitudes pendientes</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {items.map(item => (
                  <button
                    key={item.to}
                    onClick={() => navigate(item.to)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border border-border/40 transition-all hover:shadow-sm hover:border-primary/20 text-left",
                      item.count === 0 && "opacity-50"
                    )}
                  >
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", item.bg)}>
                      <item.icon className={cn("h-4 w-4", item.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-lg font-bold tabular-nums leading-none", item.count > 0 ? item.color : "text-muted-foreground")}>{item.count}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{item.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    },
    commercial_kpis: () => (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-semibold font-heading text-foreground">Comercial</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiStatCard label="Clientes activos" value={commercialKpis.activeClients} subtitle="empresas operando" icon={Building2} color="primary" onClick={() => navigate("/app/clients")} />
          <KpiStatCard label="Solicitudes abiertas" value={commercialKpis.openRequests} subtitle="en pipeline" icon={ClipboardList} color="warning" onClick={() => navigate("/app/staffing-requests")} />
          <KpiStatCard label="Por cobrar" value={`$${commercialKpis.unpaidTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} subtitle={`${commercialKpis.unpaidInvoices} facturas`} icon={Receipt} color="earning" onClick={() => navigate("/app/invoices")} />
          <KpiStatCard label="Vencido" value={`$${commercialKpis.overdueTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} subtitle={`${commercialKpis.overdueInvoices} facturas`} icon={AlertTriangle} color="deduction" onClick={() => navigate("/app/invoices")} />
        </div>
      </div>
    ),
    today_summary: () => {
      const todayStr = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
      return (
        <Card className="rounded-2xl shadow-sm border-border/40 overflow-hidden">
          <CardHeader className="pb-3 px-5 pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="h-7 w-7 rounded-lg bg-primary/[0.08] flex items-center justify-center">
                   <Calendar className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold font-heading">Hoy</CardTitle>
                  <p className="text-[10px] text-muted-foreground/60 capitalize">{todayStr}</p>
                </div>
              </div>
              <Link to="/app/today" className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5 group">
                Ver detalle <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center p-3 rounded-xl bg-primary/[0.04] border border-border/30">
                <Clock className="h-4 w-4 text-primary mb-1.5" />
                <p className="text-xl font-bold text-primary tabular-nums">{todaySummary.shiftsToday}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Turnos</p>
              </div>
              <div className="flex flex-col items-center p-3 rounded-xl bg-earning/[0.04] border border-border/30">
                <UserCheck className="h-4 w-4 text-earning mb-1.5" />
                <p className="text-xl font-bold text-earning tabular-nums">{todaySummary.assignedToday}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Asignados</p>
              </div>
              <div className="flex flex-col items-center p-3 rounded-xl bg-warning/[0.04] border border-border/30">
                <Timer className="h-4 w-4 text-warning mb-1.5" />
                <p className="text-xl font-bold text-warning tabular-nums">{todaySummary.openEntries}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Fichados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    },
    chart: () => chartData.length > 0 ? (
      <Card className="rounded-2xl shadow-sm border-border/40 overflow-hidden">
        <CardHeader className="pb-2 px-5 pt-5">
          <div className="flex items-center gap-2">
             <div className="h-7 w-7 rounded-lg bg-primary/[0.08] flex items-center justify-center">
               <TrendingUp className="h-3.5 w-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold font-heading">Tendencia de pagos</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-4">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v.toLocaleString()}`} axisLine={false} tickLine={false} />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                    fontSize: 11,
                    boxShadow: "var(--shadow-md)",
                    padding: "8px 12px",
                  }}
                  formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name === "base" ? "Base" : name === "extras" ? "Extras" : "Deducciones"]}
                />
                <Bar dataKey="base" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="base" />
                <Bar dataKey="extras" fill="hsl(var(--earning))" radius={[6, 6, 0, 0]} name="extras" />
                <Bar dataKey="deducciones" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} name="deducciones" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    ) : null,
    announcements: () => (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
             <div className="h-7 w-7 rounded-lg bg-primary/[0.08] flex items-center justify-center">
               <Megaphone className="h-3.5 w-3.5 text-primary" />
            </div>
            <h2 className="text-sm font-semibold font-heading">Comunicados</h2>
          </div>
          <Link to="/app/announcements" className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5 group">
            Ver todos <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        {feedAnnouncements.length === 0 ? (
          <Card className="rounded-2xl shadow-sm border-border/40">
            <CardContent className="py-12 text-center text-muted-foreground">
              <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Megaphone className="h-5 w-5 opacity-30" />
              </div>
              <p className="text-xs font-medium">No hay comunicados publicados</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Los comunicados aparecerán aquí</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {feedAnnouncements.map(a => {
              const mediaList = a.media_urls.filter(Boolean);
              return (
                <Card key={a.id} className={cn(
                  "rounded-xl shadow-2xs overflow-hidden transition-all hover:shadow-xs border-border/40",
                  a.pinned && "border-primary/20",
                  a.priority === "urgent" && "border-destructive/30"
                )}>
                  {a.priority === "urgent" && (
                    <div className="bg-destructive/[0.06] px-4 py-1.5 flex items-center gap-1.5 border-b border-destructive/10">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Urgente</span>
                    </div>
                  )}
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {a.pinned && <Pin className="h-2.5 w-2.5 text-primary shrink-0" />}
                          <h3 className="text-[13px] font-semibold text-foreground leading-snug">{a.title}</h3>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {formatDistanceToNow(parseISO(a.published_at), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-foreground/70 line-clamp-2 leading-relaxed">{a.body}</p>
                    {mediaList.length > 0 && (
                      <div className="flex gap-1.5">
                        {mediaList.slice(0, 3).map((url: string, i: number) => (
                          <div key={i} className="h-14 w-14 rounded-lg overflow-hidden bg-muted/50 shrink-0 ring-1 ring-border/30">
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </div>
                        ))}
                        {mediaList.length > 3 && (
                          <div className="h-14 w-14 rounded-lg bg-muted/40 flex items-center justify-center text-[10px] font-semibold text-muted-foreground ring-1 ring-border/30">
                            +{mediaList.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                    {a.reaction_count > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 pt-0.5">
                        <ThumbsUp className="h-2.5 w-2.5" />
                        {a.reaction_count} reacciones
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    ),
    activity: () => (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
             <div className="h-7 w-7 rounded-lg bg-warning/[0.08] flex items-center justify-center">
               <Activity className="h-3.5 w-3.5 text-warning" />
            </div>
            <h2 className="text-sm font-semibold font-heading">Actividad reciente</h2>
          </div>
          <Link to="/app/activity" className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5 group">
            Ver todo <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <Card className="rounded-2xl shadow-sm border-border/40">
          <CardContent className="p-0">
            {activityItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-2">
                  <Activity className="h-4 w-4 opacity-30" />
                </div>
                <p className="text-[11px] font-medium">Sin actividad reciente</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {activityItems.map(item => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    ),
  };

  /* ─── Determine layout: announcements + activity side-by-side when both enabled ─── */
  const bothFeedAndActivity = isWidgetEnabled("announcements") && isWidgetEnabled("activity");

  if (loading && !stats.totalEmployees) {
    return <PageSkeleton variant="cards" />;
  }

  if (fetchError) {
    return <ErrorBlock title="Error al cargar el dashboard" message="No pudimos cargar los datos. Verifica tu conexión e intenta de nuevo." onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      {/* ── Compact greeting + settings ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-0.5">
            <Sparkles className="h-3.5 w-3.5 text-primary/50" />
            {greeting}
          </p>
          <h1 className="text-xl md:text-2xl font-bold font-heading tracking-tight text-foreground">
            {fullName || "Dashboard"}
          </h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-1.5">
            <span>{selectedCompany?.name ?? "Selecciona una empresa"}</span>
            {stats.activePeriod && (
              <>
                <span className="text-border">·</span>
                <span className="tabular-nums">{DAY_NAMES[payrollConfig.payroll_week_start_day].slice(0, 3)} → {DAY_NAMES[payrollConfig.expected_close_day].slice(0, 3)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardWidgetSettings
            widgets={widgets}
            toggleWidget={toggleWidget}
            moveWidget={moveWidget}
            resetWidgets={resetWidgets}
          />
          {stats.activePeriod && (
            <div className="hidden md:flex flex-col gap-2 min-w-[200px] p-3.5 rounded-xl border border-border/40 bg-card shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Periodo</span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1",
                  statusColor === 'earning' && "bg-earning/10 text-earning",
                  statusColor === 'warning' && "bg-warning/10 text-warning",
                  statusColor === 'primary' && "bg-primary/10 text-primary",
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", `bg-${statusColor}`)} />
                  {statusLabel}
                </span>
              </div>
              <p className="text-[12px] font-semibold text-foreground tabular-nums">{stats.activePeriod}</p>
              <div className="flex items-center gap-2">
                <Progress value={periodProgress} className="h-1.5 flex-1 bg-muted/60 [&>div]:bg-primary [&>div]:rounded-full rounded-full" />
                <span className="text-[10px] text-muted-foreground/60 tabular-nums font-medium">{periodProgress}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Onboarding Checklist ── */}
      <OnboardingChecklist />

      {/* ── Pending Reviews ── */}
      <PendingReviewsWidget />

      {/* ── Owner: Company Cards ── */}
      {(role === 'developer' || role === 'owner') && companies.length > 1 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Crown className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold font-heading text-foreground">Empresas</h2>
            <Badge variant="outline" className="text-[10px] ml-1">{companies.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {companies.map(c => {
              const isSelected = c.id === selectedCompanyId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCompanyId(c.id)}
                  className={cn(
                    "text-left p-4 rounded-2xl border transition-all duration-200 group active:scale-[0.98]",
                    isSelected
                      ? "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20 shadow-sm"
                      : "border-border/40 bg-card hover:border-primary/20 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.slug}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">Activa</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                    <span className={cn("text-[10px] font-medium", c.is_active ? "text-earning" : "text-muted-foreground")}>
                      {c.is_active ? "● Activa" : "○ Inactiva"}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary ml-auto transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Render widgets in user-defined order ── */}
      {enabledWidgets.map(w => {
        // Special handling: announcements + activity render together in a grid
        if (w.id === "announcements" && bothFeedAndActivity) {
          return (
            <div key="feed-activity-grid" className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3">{widgetRenderers.announcements()}</div>
              <div className="lg:col-span-2">{widgetRenderers.activity()}</div>
            </div>
          );
        }
        // Skip activity if it's rendered within the announcements grid
        if (w.id === "activity" && bothFeedAndActivity) return null;

        const renderer = widgetRenderers[w.id];
        if (!renderer) return null;
        const content = renderer();
        if (!content) return null;
        return <div key={w.id}>{content}</div>;
      })}

      {/* ── Weekly Shifts (always show after KPIs if not in widget list) ── */}
      {!isWidgetEnabled("weekly_shifts") && selectedCompanyId && (
        <WeeklyShiftPreview companyId={selectedCompanyId} navigate={navigate} />
      )}
    </div>
  );
}
