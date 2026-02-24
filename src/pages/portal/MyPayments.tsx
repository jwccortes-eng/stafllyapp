import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { ChevronRight, DollarSign } from "lucide-react";

interface PaymentRow {
  period_id: string;
  start_date: string;
  end_date: string;
  base_total_pay: number;
  extras_total: number;
  deductions_total: number;
  total_final_pay: number;
}

export default function MyPayments() {
  const { employeeId } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      // Get base pays
      const { data: basePays } = await supabase
        .from("period_base_pay")
        .select("period_id, base_total_pay, pay_periods(start_date, end_date)")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      // Get movements
      const { data: movements } = await supabase
        .from("movements")
        .select("period_id, total_value, concepts(category)")
        .eq("employee_id", employeeId);

      const periodMap = new Map<string, PaymentRow>();

      (basePays ?? []).forEach((bp: any) => {
        periodMap.set(bp.period_id, {
          period_id: bp.period_id,
          start_date: bp.pay_periods?.start_date ?? "",
          end_date: bp.pay_periods?.end_date ?? "",
          base_total_pay: Number(bp.base_total_pay) || 0,
          extras_total: 0,
          deductions_total: 0,
          total_final_pay: 0,
        });
      });

      (movements ?? []).forEach((m: any) => {
        const row = periodMap.get(m.period_id);
        if (!row) return;
        if (m.concepts?.category === "extra") {
          row.extras_total += Number(m.total_value) || 0;
        } else {
          row.deductions_total += Number(m.total_value) || 0;
        }
      });

      periodMap.forEach(row => {
        row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total;
      });

      setPayments(Array.from(periodMap.values()));
      setLoading(false);
    }
    load();
  }, [employeeId]);

  const accumulated = payments.reduce((s, r) => s + r.total_final_pay, 0);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mis Pagos</h1>
        <p className="page-subtitle">Resumen semanal de tu nómina</p>
      </div>

      <Card className="stat-card mb-6">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <DollarSign className="h-6 w-6 text-primary" />
          <CardTitle className="text-sm text-muted-foreground">Acumulado total</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-heading">${accumulated.toFixed(2)}</div>
        </CardContent>
      </Card>

      <div className="data-table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Semana</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Extras</TableHead>
              <TableHead className="text-right">Deducciones</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay pagos registrados</TableCell></TableRow>
            ) : (
              payments.map(p => (
                <TableRow key={p.period_id}>
                  <TableCell className="font-medium">{p.start_date} → {p.end_date}</TableCell>
                  <TableCell className="text-right font-mono">${p.base_total_pay.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-earning">+${p.extras_total.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-deduction">−${p.deductions_total.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">${p.total_final_pay.toFixed(2)}</TableCell>
                  <TableCell>
                    <Link to={`/portal/week/${p.period_id}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
