import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";

export default function Accumulated() {
  const { employeeId } = useAuth();
  const [totals, setTotals] = useState({ base: 0, extras: 0, deductions: 0, final: 0, periodCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("base_total_pay").eq("employee_id", employeeId),
        supabase.from("movements").select("total_value, concepts(category)").eq("employee_id", employeeId),
      ]);

      const base = (bpRes.data ?? []).reduce((s, r) => s + (Number(r.base_total_pay) || 0), 0);
      let extras = 0, deductions = 0;
      (movRes.data ?? []).forEach((m: any) => {
        if (m.concepts?.category === "extra") extras += Number(m.total_value) || 0;
        else deductions += Number(m.total_value) || 0;
      });

      setTotals({
        base,
        extras,
        deductions,
        final: base + extras - deductions,
        periodCount: bpRes.data?.length ?? 0,
      });
      setLoading(false);
    }
    load();
  }, [employeeId]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Acumulado histórico</h1>
        <p className="page-subtitle">Tu total ganado a lo largo del tiempo</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="stat-card border-primary/30">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <DollarSign className="h-6 w-6 text-primary" />
            <CardTitle className="text-sm text-muted-foreground">Total acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-heading">${totals.final.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">{totals.periodCount} semanas procesadas</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="stat-card">
            <CardContent className="pt-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Base Connecteam</p>
                <p className="text-xl font-bold font-heading">${totals.base.toFixed(2)}</p>
              </div>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-earning">Extras acumulados</p>
                <p className="text-xl font-bold font-heading text-earning">+${totals.extras.toFixed(2)}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-earning" />
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-deduction">Deducciones acumuladas</p>
                <p className="text-xl font-bold font-heading text-deduction">−${totals.deductions.toFixed(2)}</p>
              </div>
              <TrendingDown className="h-5 w-5 text-deduction" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
