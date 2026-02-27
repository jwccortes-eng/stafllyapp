import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays, Users, DollarSign, FileSpreadsheet,
  Upload, Tags, BarChart3, ArrowRight, TrendingUp,
  Zap, Clock, Sparkles, Megaphone, Pin, AlertCircle,
  ChevronRight, Activity, ThumbsUp, AlertTriangle,
} from "lucide-react";
import { PeriodStatusBanner } from "@/components/ui/period-status-banner";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { usePayrollConfig, calculateOverdue, DAY_NAMES, type PeriodOverdueInfo } from "@/hooks/usePayrollConfig";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface Role {
  id: string;
  name: string;
  permissions: string[];
}

interface Module {
  id: string;
  name: string;
  roles: Role[];
}

interface Company {
  id: string;
  name: string;
  modules: Module[];
}

interface User {
  id: string;
  email: string;
  fullName: string;
  company: Company;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  session: any | null;
  isLoading: boolean;
  signIn: (data: any) => Promise<any>;
  signOut: () => Promise<void>;
  role: string | undefined;
  hasModuleAccess: (module: string, permission: string) => boolean;
  fullName: string | undefined;
}

interface CompanyContextType {
  selectedCompanyId: string | null;
  selectedCompany: Company | null;
  isModuleActive: (module: string) => boolean;
  isLoading: boolean;
  setCompany: (companyId: string) => void;
}

interface Stats {
  totalEmployees: number;
  activePeriod: string | null;
  periodStatus: string | null;
  totalImports: number;
  totalMovements: number;
  periodTotal: number;
  periodStartDate: string | null;
  periodEndDate: string | null;
}

interface PeriodChartData {
  label: string;
  base: number;
  extras: number;
  deducciones: number;
}

interface FeedAnnouncement {
  id: string;
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  published_at: string;
  media_urls: any[];
  reaction_count: number;
}

interface ActivityItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  details: any;
}

/* ─── animated counter hook ─── */
function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const from = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

/* ─── Stat Card ─── */
function StatCard({ label, value, subtitle, icon: Icon, color }: {
  label: string; value: string | number; subtitle: string;
  icon: any; color: "primary" | "warning" | "deduction" | "earning";
}) {
  const colorMap = {
    primary: { bg: "bg-primary/8", text: "text-primary", icon: "text-primary" },
    warning: { bg: "bg-warning/8", text: "text-warning", icon: "text-warning" },
    deduction: { bg: "bg-deduction/8", text: "text-deduction", icon: "text-deduction" },
    earning: { bg: "bg-earning/8", text: "text-earning", icon: "text-earning" },
  };
  const c = colorMap[color];

  return (
    <div className="stat-card group">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", c.bg)}>
          <Icon className={cn("h-4.5 w-4.5", c.icon)} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-2xl md:text-3xl font-bold font-heading tabular-nums", c.text)}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

/* ─── Quick Action ─── */
function QuickAction({ label, description, icon: Icon, to, accent, index, navigate }: {
  label: string; description: string; icon: any; to: string; accent: string; index: number; navigate: (to: string) => void;
}) {
  return (
    <button
      onClick={() => navigate(to)}
      className="group flex items-center gap-3.5 p-3.5 rounded-xl border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all duration-200 text-left press-scale"
    >
      <div className={cn("h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 shadow-2xs", accent)}>
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}

export default function AdminDashboard() {
  const { selectedCompanyId, selectedCompany, isModuleActive } = useCompany();
  const { role, hasModuleAccess, fullName } = useAuth();
  const { config: payrollConfig, currentWeek } = usePayrollConfig();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalEmployees: 0, activePeriod: null, periodStatus: null,
    totalImports: 0, totalMovements: 0, periodTotal: 0,
    periodStartDate: null, periodEndDate: null,
  });
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<PeriodChartData[]>([]);
  const [feedAnnouncements, setFeedAnnouncements] = useState<FeedAnnouncement[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [overdueInfos, setOverdueInfos] = useState<PeriodOverdueInfo[]>([]);
  const [periodSummary, setPeriodSummary] = useState({ open: 0, closed: 0, published: 0, paid: 0 });

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    async function fetchStats() {
      const [empRes, periodRes, impRes, movRes] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true).eq("company_id", selectedCompanyId!),
        supabase.from("pay_periods").select("*").eq("company_id", selectedCompanyId!).order("start_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("imports").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!),
        supabase.from("movements").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!),
      ]);

      let periodTotal = 0;
      if (periodRes.data) {
        const { data: basePays } = await supabase
          .from("period_base_pay").select("base_total_pay").eq("period_id", periodRes.data.id);
        periodTotal = (basePays ?? []).reduce((s, bp) => s + Number(bp.base_total_pay || 0), 0);
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
      });
      setLoading(false);
    }

    async function fetchChartData() {
      const { data: periods } = await supabase
        .from("pay_periods").select("id, start_date, end_date")
        .eq("company_id", selectedCompanyId!).order("start_date", { ascending: true }).limit(8);
      if (!periods || periods.length === 0) { setChartData([]); return; }

      const periodIds = periods.map(p => p.id);
      const [baseRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").in("period_id", periodIds),
        supabase.from("movements").select("period_id, total_value, concept_id, concepts(category)").in("period_id", periodIds),
      ]);

      setChartData(periods.map(p => {
        const base = (baseRes.data ?? []).filter(bp => bp.period_id === p.id).reduce((s, bp) => s + Number(bp.base_total_pay || 0), 0);
        const extras = (movRes.data ?? []).filter((m: any) => m.period_id === p.id && m.concepts?.category === "extra").reduce((s, m) => s + Number(m.total_value || 0), 0);
        const deducciones = (movRes.data ?? []).filter((m: any) => m.period_id === p.id && m.concepts?.category === "deduction").reduce((s, m) => s + Math.abs(Number(m.total_value || 0)), 0);
        return { label: format(parseISO(p.start_date), "dd MMM", { locale: es }), base: Math.round(base), extras: Math.round(extras), deducciones: Math.round(deducciones) };
      }));
    }

    async function fetchFeed() {
      const [annRes, actRes] = await Promise.all([
        supabase.from("announcements").select("id, title, body, priority, pinned, published_at, media_urls")
          .eq("company_id", selectedCompanyId!).not("published_at", "is", null).is("deleted_at", null)
          .order("published_at", { ascending: false }).limit(5),
        supabase.from("activity_log").select("id, action, entity_type, entity_id, created_at, details")
          .eq("company_id", selectedCompanyId!).order("created_at", { ascending: false }).limit(8),
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
      setActivityItems((actRes.data ?? []) as ActivityItem[]);
    }

    fetchStats();
    fetchChartData();
    fetchFeed();

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
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(module, 'view');
    return false;
  };

  const animEmployees = useAnimatedNumber(stats.totalEmployees);
  const animMovements = useAnimatedNumber(stats.totalMovements);

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

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative rounded-2xl border border-border bg-card p-5 md:p-7 overflow-hidden">
        {/* Subtle decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-warning/[0.02]" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary/60" />
              {greeting}
            </p>
            <h1 className="text-xl md:text-2xl font-bold font-heading tracking-tight mt-1 text-foreground">
              {fullName || "Dashboard"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedCompany?.name ?? "Selecciona una empresa"} · {DAY_NAMES[payrollConfig.payroll_week_start_day].slice(0, 3)} → {DAY_NAMES[payrollConfig.expected_close_day].slice(0, 3)}
            </p>
          </div>

          {/* Period pill */}
          {stats.activePeriod && (
            <div className="flex flex-col gap-2 min-w-[200px] p-3.5 rounded-xl border border-border bg-background/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Periodo</span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1",
                  statusColor === 'earning' && "bg-earning/10 text-earning",
                  statusColor === 'warning' && "bg-warning/10 text-warning",
                  statusColor === 'primary' && "bg-primary/10 text-primary",
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", `bg-${statusColor}`)} />
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs font-semibold text-foreground tabular-nums">{stats.activePeriod}</p>
              <div className="flex items-center gap-2">
                <Progress value={periodProgress} className="h-1 flex-1 bg-muted [&>div]:bg-primary" />
                <span className="text-[10px] text-muted-foreground tabular-nums">{periodProgress}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Period Status Banner ── */}
      <PeriodStatusBanner
        open={periodSummary.open}
        closed={periodSummary.closed}
        published={periodSummary.published}
        paid={periodSummary.paid}
        overdueCount={overdueInfos.length}
        overdueDays={overdueInfos.length > 0 ? Math.max(...overdueInfos.map(i => i.overdueDays)) : undefined}
        onOverdueClick={overdueInfos.length > 0 ? () => navigate("/app/periods") : undefined}
      />

      {/* ── KPIs ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 animate-pulse bg-muted rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Empleados" value={animEmployees} subtitle="activos en nómina" icon={Users} color="primary" />
          <StatCard label="Pago base" value={`$${stats.periodTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} subtitle="periodo actual" icon={DollarSign} color="warning" />
          <StatCard label="Novedades" value={animMovements} subtitle="registradas en total" icon={FileSpreadsheet} color="deduction" />
          <StatCard label="Importaciones" value={stats.totalImports} subtitle="archivos procesados" icon={TrendingUp} color="earning" />
        </div>
      )}

      {/* ── Quick Actions ── */}
      {quickActions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-3.5 w-3.5 text-warning" />
            <h2 className="text-sm font-semibold font-heading text-foreground">Accesos rápidos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {quickActions.map((action, i) => (
              <QuickAction key={action.to} {...action} index={i} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* ── Chart ── */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl shadow-2xs">
          <CardHeader className="pb-2 px-5 pt-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <CardTitle className="text-sm font-semibold font-heading">Tendencia de pagos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v.toLocaleString()}`} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))", fontSize: 11, boxShadow: "var(--shadow-md)" }}
                    formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name === "base" ? "Base" : name === "extras" ? "Extras" : "Deducciones"]}
                  />
                  <Bar dataKey="base" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="base" />
                  <Bar dataKey="extras" fill="hsl(var(--earning))" radius={[4, 4, 0, 0]} name="extras" />
                  <Bar dataKey="deducciones" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="deducciones" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Feed + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Announcements */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-sm font-semibold font-heading">Comunicados</h2>
            </div>
            <Link to="/app/announcements" className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {feedAnnouncements.length === 0 ? (
            <Card className="rounded-2xl shadow-2xs">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Megaphone className="h-7 w-7 mx-auto mb-2 opacity-20" />
                <p className="text-xs">No hay comunicados publicados</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {feedAnnouncements.map(a => {
                const mediaList = a.media_urls.filter(Boolean);
                return (
                  <Card key={a.id} className={cn(
                    "rounded-xl shadow-2xs overflow-hidden transition-all hover:shadow-xs",
                    a.pinned && "border-primary/15",
                    a.priority === "urgent" && "border-destructive/25"
                  )}>
                    {a.priority === "urgent" && (
                      <div className="bg-destructive/8 px-4 py-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                        <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Urgente</span>
                      </div>
                    )}
                    <CardContent className="p-3.5 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {a.pinned && <Pin className="h-2.5 w-2.5 text-primary shrink-0" />}
                            <h3 className="text-[13px] font-semibold text-foreground leading-snug">{a.title}</h3>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDistanceToNow(parseISO(a.published_at), { addSuffix: true, locale: es })}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-foreground/75 line-clamp-2 leading-relaxed">{a.body}</p>

                      {mediaList.length > 0 && (
                        <div className="flex gap-1.5">
                          {mediaList.slice(0, 3).map((url: string, i: number) => (
                            <div key={i} className="h-14 w-14 rounded-lg overflow-hidden bg-muted shrink-0">
                              <img src={url} alt="" className="h-full w-full object-cover" />
                            </div>
                          ))}
                          {mediaList.length > 3 && (
                            <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                              +{mediaList.length - 3}
                            </div>
                          )}
                        </div>
                      )}

                      {a.reaction_count > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
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

        {/* Activity */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-warning" />
              <h2 className="text-sm font-semibold font-heading">Actividad reciente</h2>
            </div>
            <Link to="/app/activity" className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5">
              Ver todo <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <Card className="rounded-2xl shadow-2xs">
            <CardContent className="p-0">
              {activityItems.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Activity className="h-6 w-6 mx-auto mb-2 opacity-20" />
                  <p className="text-[11px]">Sin actividad reciente</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {activityItems.map(item => {
                    const actionLabels: Record<string, string> = {
                      create: "creó", update: "actualizó", delete: "eliminó",
                      insert: "agregó", import: "importó", publish: "publicó",
                    };
                    const entityLabels: Record<string, string> = {
                      employee: "empleado", movement: "novedad", period: "periodo",
                      concept: "concepto", shift: "turno", announcement: "anuncio",
                      import: "importación", client: "cliente", location: "ubicación",
                    };

                    return (
                      <div key={item.id} className="px-3.5 py-2.5 hover:bg-accent/30 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className="h-6 w-6 rounded-full bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                            <Activity className="h-3 w-3 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-foreground">
                              <span className="font-medium capitalize">{actionLabels[item.action] || item.action}</span>
                              {" "}un{" "}
                              <span className="font-medium">{entityLabels[item.entity_type] || item.entity_type}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true, locale: es })}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

