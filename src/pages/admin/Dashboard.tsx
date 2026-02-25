import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Users, DollarSign, FileSpreadsheet, Upload, Tags, BarChart3, ArrowRight } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";

interface Stats {
  totalEmployees: number;
  activePeriod: string | null;
  periodStatus: string | null;
  totalImports: number;
  totalMovements: number;
  periodTotal: number;
}

export default function AdminDashboard() {
  const { selectedCompanyId, isModuleActive } = useCompany();
  const { role, hasModuleAccess } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalEmployees: 0,
    activePeriod: null,
    periodStatus: null,
    totalImports: 0,
    totalMovements: 0,
    periodTotal: 0,
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
      });
      setLoading(false);
    }
    fetchStats();
  }, [selectedCompanyId]);

  const canAccess = (module: string) => {
    if (!isModuleActive(module)) return false;
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(module, 'view');
    return false;
  };

  const kpis = [
    {
      title: "Empleados activos",
      value: stats.totalEmployees,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Periodo actual",
      value: stats.activePeriod ?? "Sin periodos",
      subtitle: stats.periodStatus,
      icon: CalendarDays,
      color: "text-earning",
      bgColor: "bg-earning/10",
    },
    {
      title: "Pago base periodo",
      value: stats.periodTotal ? `$${stats.periodTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$0.00",
      icon: DollarSign,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Novedades registradas",
      value: stats.totalMovements,
      icon: FileSpreadsheet,
      color: "text-deduction",
      bgColor: "bg-deduction/10",
    },
  ];

  const quickActions = [
    { label: "Importar horas", icon: Upload, to: "/admin/import", module: "import", description: "Sube el archivo de Connecteam" },
    { label: "Agregar novedad", icon: DollarSign, to: "/admin/movements", module: "movements", description: "Extras, deducciones y ajustes" },
    { label: "Ver resumen", icon: FileSpreadsheet, to: "/admin/summary", module: "summary", description: "Resumen del periodo actual" },
    { label: "Empleados", icon: Users, to: "/admin/employees", module: "employees", description: "Gestión de empleados" },
    { label: "Conceptos", icon: Tags, to: "/admin/concepts", module: "concepts", description: "Configura conceptos de pago" },
    { label: "Reportes", icon: BarChart3, to: "/admin/reports", module: "reports", description: "Genera y guarda reportes" },
  ].filter(a => canAccess(a.module));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Vista general de la nómina semanal</p>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((card) => (
            <Card key={card.title} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`h-9 w-9 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-heading">{card.value}</div>
                {card.subtitle && (
                  <span className={`text-xs mt-1 inline-block px-2 py-0.5 rounded-full ${
                    card.subtitle === 'open' ? 'bg-earning-bg text-earning' : 'bg-muted text-muted-foreground'
                  }`}>
                    {card.subtitle === 'open' ? 'Abierto' : 'Cerrado'}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-semibold font-heading mb-4">Accesos rápidos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.to}
                onClick={() => navigate(action.to)}
                className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all text-left"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
