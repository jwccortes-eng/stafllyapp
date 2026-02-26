import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays, Users, DollarSign, FileSpreadsheet,
  Upload, Tags, BarChart3, ArrowRight, TrendingUp,
  Zap, Clock, Sparkles, Megaphone, Pin, AlertCircle,
  MessageCircle, ChevronRight, Activity, Heart, ThumbsUp,
  AlertTriangle,
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { usePayrollConfig, calculateOverdue, DAY_NAMES, type PeriodOverdueInfo } from "@/hooks/usePayrollConfig";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

export default function AdminDashboard() {
  const { selectedCompanyId, selectedCompany, isModuleActive } = useCompany();
  const { role, hasModuleAccess, fullName } = useAuth();
  const { config: payrollConfig, currentWeek } = usePayrollConfig();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalEmployees: 0,
    activePeriod: null,
    periodStatus: null,
    totalImports: 0,
    totalMovements: 0,
    periodTotal: 0,
    periodStartDate: null,
    periodEndDate: null,
  });
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<PeriodChartData[]>([]);
  const [feedAnnouncements, setFeedAnnouncements] = useState<FeedAnnouncement[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [overdueInfos, setOverdueInfos] = useState<PeriodOverdueInfo[]>([]);
  const [periodSummary, setPeriodSummary] = useState({ open: 0, closed: 0, published: 0 });

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
          .from("period_base_pay")
          .select("base_total_pay")
          .eq("period_id", periodRes.data.id);
        periodTotal = (basePays ?? []).reduce((s, bp) => s + Number(bp.base_total_pay || 0), 0);
      }

      setStats({
        totalEmployees: empRes.count ?? 0,
        activePeriod: periodRes.data
          ? `${periodRes.data.start_date} → ${periodRes.data.end_date}`
          : null,
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
      // Get last 8 periods
      const { data: periods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date")
        .eq("company_id", selectedCompanyId!)
        .order("start_date", { ascending: true })
        .limit(8);

      if (!periods || periods.length === 0) { setChartData([]); return; }

      const periodIds = periods.map(p => p.id);

      const [baseRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").in("period_id", periodIds),
        supabase.from("movements").select("period_id, total_value, concept_id, concepts(category)").in("period_id", periodIds),
      ]);

      const chart: PeriodChartData[] = periods.map(p => {
        const base = (baseRes.data ?? [])
          .filter(bp => bp.period_id === p.id)
          .reduce((s, bp) => s + Number(bp.base_total_pay || 0), 0);

        const extras = (movRes.data ?? [])
          .filter((m: any) => m.period_id === p.id && m.concepts?.category === "extra")
          .reduce((s, m) => s + Number(m.total_value || 0), 0);

        const deducciones = (movRes.data ?? [])
          .filter((m: any) => m.period_id === p.id && m.concepts?.category === "deduction")
          .reduce((s, m) => s + Math.abs(Number(m.total_value || 0)), 0);

        const startDate = parseISO(p.start_date);
        const label = format(startDate, "dd MMM", { locale: es });

        return { label, base: Math.round(base), extras: Math.round(extras), deducciones: Math.round(deducciones) };
      });

      setChartData(chart);
    }

    async function fetchFeed() {
      const [annRes, actRes] = await Promise.all([
        supabase.from("announcements")
          .select("id, title, body, priority, pinned, published_at, media_urls")
          .eq("company_id", selectedCompanyId!)
          .not("published_at", "is", null)
          .is("deleted_at", null)
          .order("published_at", { ascending: false })
          .limit(5),
        supabase.from("activity_log")
          .select("id, action, entity_type, entity_id, created_at, details")
          .eq("company_id", selectedCompanyId!)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      const anns = (annRes.data ?? []) as any[];
      // Get reaction counts
      if (anns.length > 0) {
        const annIds = anns.map(a => a.id);
        const { data: reactions } = await supabase
          .from("announcement_reactions")
          .select("announcement_id")
          .in("announcement_id", annIds);
        
        const countMap: Record<string, number> = {};
        (reactions ?? []).forEach(r => {
          countMap[r.announcement_id] = (countMap[r.announcement_id] || 0) + 1;
        });
        
        setFeedAnnouncements(anns.map(a => ({
          ...a,
          media_urls: Array.isArray(a.media_urls) ? a.media_urls : [],
          reaction_count: countMap[a.id] || 0,
        })));
      } else {
        setFeedAnnouncements([]);
      }

      setActivityItems((actRes.data ?? []) as ActivityItem[]);
    }

    fetchStats();
    fetchChartData();
    fetchFeed();

    // Fetch all periods for overdue detection
    async function fetchOverdueInfo() {
      const { data: allPeriods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date, status")
        .eq("company_id", selectedCompanyId!)
        .order("start_date", { ascending: false })
        .limit(20);

      if (allPeriods && allPeriods.length > 0) {
        const infos = allPeriods.map(p => calculateOverdue(p, payrollConfig));
        setOverdueInfos(infos.filter(i => i.isOverdue));
        setPeriodSummary({
          open: allPeriods.filter(p => p.status === "open").length,
          closed: allPeriods.filter(p => p.status === "closed").length,
          published: allPeriods.filter(p => p.status === "published").length,
        });
      }
    }
    fetchOverdueInfo();
  }, [selectedCompanyId, payrollConfig]);

  /* period progress */
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

  /* animated numbers */
  const animEmployees = useAnimatedNumber(stats.totalEmployees);
  const animMovements = useAnimatedNumber(stats.totalMovements);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const quickActions = [
    { label: "Importar horas", icon: Upload, to: "/admin/import", module: "import", description: "Sube el archivo de Connecteam", accent: "from-primary to-primary/70" },
    { label: "Agregar novedad", icon: DollarSign, to: "/admin/movements", module: "movements", description: "Extras, deducciones y ajustes", accent: "from-warning to-warning/70" },
    { label: "Ver resumen", icon: FileSpreadsheet, to: "/admin/summary", module: "summary", description: "Resumen del periodo actual", accent: "from-earning to-earning/70" },
    { label: "Empleados", icon: Users, to: "/admin/employees", module: "employees", description: "Gestión de empleados", accent: "from-primary to-primary/70" },
    { label: "Conceptos", icon: Tags, to: "/admin/concepts", module: "concepts", description: "Configura conceptos de pago", accent: "from-deduction to-deduction/70" },
    { label: "Reportes", icon: BarChart3, to: "/admin/reports", module: "reports", description: "Genera y guarda reportes", accent: "from-primary to-primary/70" },
  ].filter(a => canAccess(a.module));

  /* ─── render ─── */
  return (
    <div className="space-y-8">
      {/* ── Hero greeting ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-6 md:p-8 text-primary-foreground">
        {/* decorative blobs */}
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-white/5 blur-xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 opacity-80" />
              <span className="text-sm font-medium opacity-80">{greeting}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight">
              {fullName ? `${greeting}, ${fullName}` : "Dashboard"}
            </h1>
            <p className="text-sm opacity-80 mt-1">
              {selectedCompany?.name ?? "Selecciona una empresa"} · Nómina semanal ({DAY_NAMES[payrollConfig.payroll_week_start_day].slice(0, 3)} → {DAY_NAMES[payrollConfig.expected_close_day].slice(0, 3)})
            </p>
          </div>

          {/* period mini-card */}
          {stats.activePeriod && (
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/20 min-w-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 opacity-80" />
                <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Periodo activo</span>
              </div>
              <p className="text-sm font-semibold">{stats.activePeriod}</p>
              <div className="mt-2 flex items-center gap-2">
                <Progress value={periodProgress} className="h-1.5 flex-1 bg-white/20 [&>div]:bg-white" />
                <span className="text-[11px] font-medium opacity-80">{periodProgress}%</span>
              </div>
              <span className={`text-[11px] mt-1 inline-block px-2 py-0.5 rounded-full font-medium ${
                stats.periodStatus === 'open'
                  ? 'bg-earning/30 text-white'
                  : stats.periodStatus === 'closed'
                    ? 'bg-warning/30 text-white'
                    : 'bg-white/25 text-white'
              }`}>
                {stats.periodStatus === 'open' ? '● Abierto' : stats.periodStatus === 'closed' ? '● Cerrado' : '● Publicado'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Overdue Banner ── */}
      {overdueInfos.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-sm font-bold text-destructive">
              {overdueInfos.length} periodo{overdueInfos.length > 1 ? "s" : ""} con atraso
            </h3>
          </div>
          <div className="space-y-2">
            {overdueInfos.map(info => (
              <div
                key={info.periodId}
                className="flex items-center justify-between bg-card rounded-xl px-4 py-2.5 border border-destructive/10 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate("/admin/periods")}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="destructive" className="text-[10px]">
                    {info.overdueDays}d atraso
                  </Badge>
                  <span className="text-sm font-medium">{info.startDate} → {info.endDate}</span>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{info.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Period Status Summary ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="gap-1.5 text-xs py-1 px-3 border-earning/30 text-earning">
          <span className="h-1.5 w-1.5 rounded-full bg-earning" />
          {periodSummary.open} abierto{periodSummary.open !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="outline" className="gap-1.5 text-xs py-1 px-3 border-warning/30 text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {periodSummary.closed} cerrado{periodSummary.closed !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="outline" className="gap-1.5 text-xs py-1 px-3 border-primary/30 text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {periodSummary.published} publicado{periodSummary.published !== 1 ? "s" : ""}
        </Badge>
      </div>


      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-muted rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Employees */}
          <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-primary/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empleados</span>
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold font-heading text-foreground">{animEmployees}</p>
              <p className="text-xs text-muted-foreground mt-1">activos en nómina</p>
            </div>
          </div>

          {/* Period total */}
          <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-warning/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pago base</span>
                <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center group-hover:bg-warning/20 transition-colors">
                  <DollarSign className="h-5 w-5 text-warning" />
                </div>
              </div>
              <p className="text-3xl font-bold font-heading text-foreground">
                ${stats.periodTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">periodo actual</p>
            </div>
          </div>

          {/* Movements */}
          <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-deduction/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Novedades</span>
                <div className="h-10 w-10 rounded-xl bg-deduction/10 flex items-center justify-center group-hover:bg-deduction/20 transition-colors">
                  <FileSpreadsheet className="h-5 w-5 text-deduction" />
                </div>
              </div>
              <p className="text-3xl font-bold font-heading text-foreground">{animMovements}</p>
              <p className="text-xs text-muted-foreground mt-1">registradas en total</p>
            </div>
          </div>

          {/* Imports */}
          <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-earning/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Importaciones</span>
                <div className="h-10 w-10 rounded-xl bg-earning/10 flex items-center justify-center group-hover:bg-earning/20 transition-colors">
                  <TrendingUp className="h-5 w-5 text-earning" />
                </div>
              </div>
              <p className="text-3xl font-bold font-heading text-foreground">{stats.totalImports}</p>
              <p className="text-xs text-muted-foreground mt-1">archivos procesados</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Trend Chart ── */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold font-heading">Tendencia de pagos por periodo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))", fontSize: 12 }}
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

      {/* ── Quick Actions ── */}
      {quickActions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-warning" />
            <h2 className="text-base font-semibold font-heading">Accesos rápidos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map((action, i) => (
              <button
                key={action.to}
                onClick={() => navigate(action.to)}
                className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-left overflow-hidden"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* gradient strip on hover */}
                <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${action.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-l-2xl`} />

                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${action.accent} flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300`}>
                  <action.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{action.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Social Feed: Two columns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Announcements Feed */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold font-heading">Feed de comunicados</h2>
            </div>
            <Link to="/admin/announcements" className="text-xs text-primary font-medium hover:underline">
              Ver todos
            </Link>
          </div>

          {feedAnnouncements.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No hay comunicados publicados</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {feedAnnouncements.map(a => {
                const mediaList = a.media_urls.filter(Boolean);
                const isVideo = (url: string) => /\.(mp4|webm|mov)(\\?|$)/i.test(url);
                return (
                  <Card key={a.id} className={cn(
                    "rounded-2xl overflow-hidden transition-all hover:shadow-md",
                    a.pinned && "ring-1 ring-primary/20",
                    a.priority === "urgent" && "border-destructive/30"
                  )}>
                    {a.priority === "urgent" && (
                      <div className="bg-destructive/10 px-4 py-1.5 flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-[11px] font-bold text-destructive uppercase tracking-wider">Urgente</span>
                      </div>
                    )}
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {a.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                            <h3 className="text-sm font-semibold">{a.title}</h3>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(parseISO(a.published_at), { addSuffix: true, locale: es })}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-foreground/80 line-clamp-2">{a.body}</p>
                      
                      {/* Media thumbnails */}
                      {mediaList.length > 0 && (
                        <div className="flex gap-2">
                          {mediaList.slice(0, 3).map((url: string, i: number) => (
                            <div key={i} className="h-16 w-16 rounded-lg overflow-hidden bg-muted shrink-0">
                              {isVideo(url) ? (
                                <div className="h-full w-full flex items-center justify-center bg-muted">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                </div>
                              ) : (
                                <img src={url} alt="" className="h-full w-full object-cover" />
                              )}
                            </div>
                          ))}
                          {mediaList.length > 3 && (
                            <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                              +{mediaList.length - 3}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reactions summary */}
                      <div className="flex items-center gap-3 pt-1">
                        {a.reaction_count > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ThumbsUp className="h-3 w-3" />
                            {a.reaction_count} reacciones
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-warning" />
              <h2 className="text-base font-semibold font-heading">Actividad reciente</h2>
            </div>
            <Link to="/admin/activity" className="text-xs text-primary font-medium hover:underline">
              Ver todo
            </Link>
          </div>

          <Card className="rounded-2xl">
            <CardContent className="p-0">
              {activityItems.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Activity className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Sin actividad reciente</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
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
                    const actionLabel = actionLabels[item.action] || item.action;
                    const entityLabel = entityLabels[item.entity_type] || item.entity_type;

                    return (
                      <div key={item.id} className="px-4 py-3 hover:bg-accent/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Activity className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground">
                              <span className="font-medium capitalize">{actionLabel}</span>
                              {" "}un{" "}
                              <span className="font-medium">{entityLabel}</span>
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
