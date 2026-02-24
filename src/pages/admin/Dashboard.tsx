import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Users, DollarSign, FileSpreadsheet } from "lucide-react";

interface Stats {
  totalEmployees: number;
  activePeriod: string | null;
  periodStatus: string | null;
  totalImports: number;
  totalMovements: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalEmployees: 0,
    activePeriod: null,
    periodStatus: null,
    totalImports: 0,
    totalMovements: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [empRes, periodRes, impRes, movRes] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("pay_periods").select("*").order("start_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("imports").select("id", { count: "exact", head: true }),
        supabase.from("movements").select("id", { count: "exact", head: true }),
      ]);

      setStats({
        totalEmployees: empRes.count ?? 0,
        activePeriod: periodRes.data
          ? `${periodRes.data.start_date} → ${periodRes.data.end_date}`
          : null,
        periodStatus: periodRes.data?.status ?? null,
        totalImports: impRes.count ?? 0,
        totalMovements: movRes.count ?? 0,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  const cards = [
    {
      title: "Empleados activos",
      value: stats.totalEmployees,
      icon: Users,
      color: "text-primary",
    },
    {
      title: "Periodo actual",
      value: stats.activePeriod ?? "Sin periodos",
      subtitle: stats.periodStatus,
      icon: CalendarDays,
      color: "text-earning",
    },
    {
      title: "Importaciones",
      value: stats.totalImports,
      icon: FileSpreadsheet,
      color: "text-warning",
    },
    {
      title: "Novedades registradas",
      value: stats.totalMovements,
      icon: DollarSign,
      color: "text-deduction",
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Vista general de la nómina semanal</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card h-28 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Card key={card.title} className="stat-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className={`h-5 w-5 ${card.color}`} />
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
    </div>
  );
}
