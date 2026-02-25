import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, DollarSign, TrendingUp, TrendingDown } from "lucide-react";

interface ShiftRow {
  id: string;
  shift_start_date: string | null;
  shift_hours: number | null;
  hourly_rate_usd: number | null;
  daily_total_pay_usd: number | null;
  daily_total_hours: number | null;
  type: string | null;
  customer: string | null;
  job_code: string | null;
}

interface MovementRow {
  id: string;
  total_value: number;
  quantity: number | null;
  rate: number | null;
  note: string | null;
  concept_name: string;
  category: string;
}

interface BasePay {
  base_total_pay: number;
  total_work_hours: number | null;
  total_overtime: number | null;
  total_paid_hours: number | null;
  total_regular: number | null;
}

export default function EmployeePeriodDetail() {
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get("employeeId");
  const periodId = searchParams.get("periodId");

  const [employee, setEmployee] = useState<{ first_name: string; last_name: string } | null>(null);
  const [period, setPeriod] = useState<{ start_date: string; end_date: string } | null>(null);
  const [basePay, setBasePay] = useState<BasePay | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId || !periodId) return;

    async function load() {
      setLoading(true);

      const [empRes, periodRes, baseRes, shiftsRes, movRes] = await Promise.all([
        supabase.from("employees").select("first_name, last_name").eq("id", employeeId!).single(),
        supabase.from("pay_periods").select("start_date, end_date").eq("id", periodId!).single(),
        supabase.from("period_base_pay").select("base_total_pay, total_work_hours, total_overtime, total_paid_hours, total_regular").eq("employee_id", employeeId!).eq("period_id", periodId!).maybeSingle(),
        supabase.from("shifts").select("id, shift_start_date, shift_hours, hourly_rate_usd, daily_total_pay_usd, daily_total_hours, type, customer, job_code").eq("employee_id", employeeId!).eq("period_id", periodId!).order("shift_start_date"),
        supabase.from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)").eq("employee_id", employeeId!).eq("period_id", periodId!),
      ]);

      setEmployee(empRes.data);
      setPeriod(periodRes.data);
      setBasePay(baseRes.data as BasePay | null);
      setShifts((shiftsRes.data as ShiftRow[]) ?? []);
      setMovements(
        (movRes.data ?? []).map((m: any) => ({
          id: m.id,
          total_value: Number(m.total_value) || 0,
          quantity: m.quantity,
          rate: m.rate,
          note: m.note,
          concept_name: m.concepts?.name ?? "—",
          category: m.concepts?.category ?? "extra",
        }))
      );
      setLoading(false);
    }
    load();
  }, [employeeId, periodId]);

  if (!employeeId || !periodId) {
    return <div className="py-12 text-center text-muted-foreground">Parámetros inválidos</div>;
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Cargando detalle...</div>;
  }

  const extras = movements.filter(m => m.category === "extra");
  const deductions = movements.filter(m => m.category === "deduction");
  const extrasTotal = extras.reduce((s, m) => s + m.total_value, 0);
  const deductionsTotal = deductions.reduce((s, m) => s + m.total_value, 0);
  const base = basePay?.base_total_pay ?? 0;
  const finalTotal = base + extrasTotal - deductionsTotal;

  return (
    <div>
      <div className="page-header">
        <Link to={`/admin/summary?periodId=${periodId}`}>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver al resumen
          </Button>
        </Link>
        <h1 className="page-title flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          {employee?.first_name} {employee?.last_name}
        </h1>
        <p className="page-subtitle">
          Periodo: {period?.start_date} → {period?.end_date}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Pago base</p>
            <p className="text-xl font-bold font-mono">${base.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Extras</p>
            <p className="text-xl font-bold font-mono text-earning">+${extrasTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Deducciones</p>
            <p className="text-xl font-bold font-mono text-deduction">−${deductionsTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Total final</p>
            <p className="text-xl font-bold font-mono">${finalTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Base pay details */}
      {basePay && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">Resumen de horas</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground">Horas trabajadas:</span> <span className="font-mono font-medium">{basePay.total_work_hours?.toFixed(1) ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Horas regulares:</span> <span className="font-mono font-medium">{basePay.total_regular?.toFixed(1) ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Horas extra:</span> <span className="font-mono font-medium">{basePay.total_overtime?.toFixed(1) ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Horas pagadas:</span> <span className="font-mono font-medium">{basePay.total_paid_hours?.toFixed(1) ?? "—"}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shifts */}
      {shifts.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">Turnos ({shifts.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs text-right">Horas</TableHead>
                  <TableHead className="text-xs text-right">Tarifa/hr</TableHead>
                  <TableHead className="text-xs text-right">Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{s.shift_start_date ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.type ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.customer ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{s.shift_hours?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{s.hourly_rate_usd != null ? `$${s.hourly_rate_usd.toFixed(2)}` : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{s.daily_total_pay_usd != null ? `$${s.daily_total_pay_usd.toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Movements */}
      {movements.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Novedades ({movements.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Concepto</TableHead>
                  <TableHead className="text-xs text-center">Tipo</TableHead>
                  <TableHead className="text-xs text-right">Cantidad</TableHead>
                  <TableHead className="text-xs text-right">Tarifa</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs">Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm font-medium">{m.concept_name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={m.category === "extra" ? "default" : "destructive"} className="text-xs">
                        {m.category === "extra" ? "Extra" : "Deducción"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{m.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{m.rate != null ? `$${m.rate}` : "—"}</TableCell>
                    <TableCell className={`text-right font-mono text-xs font-bold ${m.category === "extra" ? "text-earning" : "text-deduction"}`}>
                      {m.category === "extra" ? "+" : "−"}${m.total_value.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-40 truncate">{m.note ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
