import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays, Users, DollarSign, FileSpreadsheet,
  Upload, Tags, BarChart3, ArrowRight, TrendingUp,
  Zap, Clock, Sparkles,
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";

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
  const { role, hasModuleAccess } = useAuth();
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
    fetchStats();
  }, [selectedCompanyId]);

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
              Dashboard
            </h1>
            <p className="text-sm opacity-80 mt-1">
              {selectedCompany?.name ?? "Selecciona una empresa"} · Nómina semanal
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
                stats.periodStatus === 'open' ? 'bg-white/25 text-white' : 'bg-white/15 text-white/80'
              }`}>
                {stats.periodStatus === 'open' ? '● Abierto' : '○ Cerrado'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
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
    </div>
  );
}
