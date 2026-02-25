import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MovementDetail {
  id: string;
  concept_name: string;
  category: string;
  quantity: number | null;
  rate: number | null;
  total_value: number;
  note: string | null;
}

export default function WeekDetail() {
  const { periodId } = useParams();
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const [basePay, setBasePay] = useState(0);
  const [movements, setMovements] = useState<MovementDetail[]>([]);
  const [periodLabel, setPeriodLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId || !periodId) return;
    async function load() {
      // Check if period is published
      const { data: periodData } = await supabase
        .from("pay_periods")
        .select("start_date, end_date, published_at")
        .eq("id", periodId)
        .maybeSingle();

      if (!periodData?.published_at) {
        navigate("/portal");
        return;
      }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("base_total_pay").eq("employee_id", employeeId).eq("period_id", periodId).maybeSingle(),
        supabase.from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)").eq("employee_id", employeeId).eq("period_id", periodId),
      ]);

      setBasePay(Number(bpRes.data?.base_total_pay) || 0);
      setMovements(
        (movRes.data ?? []).map((m: any) => ({
          id: m.id,
          concept_name: m.concepts?.name ?? "",
          category: m.concepts?.category ?? "",
          quantity: m.quantity,
          rate: m.rate,
          total_value: Number(m.total_value),
          note: m.note,
        }))
      );
      setPeriodLabel(`${periodData.start_date} → ${periodData.end_date}`);
      setLoading(false);
    }
    load();
  }, [employeeId, periodId]);

  const extras = movements.filter(m => m.category === "extra").reduce((s, m) => s + m.total_value, 0);
  const deductions = movements.filter(m => m.category === "deduction").reduce((s, m) => s + m.total_value, 0);
  const total = basePay + extras - deductions;

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <Link to="/portal">
          <Button variant="ghost" size="sm" className="mb-2"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Button>
        </Link>
        <h1 className="page-title">Detalle de semana</h1>
        <p className="page-subtitle">{periodLabel}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="stat-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Base</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-heading">${basePay.toFixed(2)}</div></CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-earning">Extras</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-heading text-earning">+${extras.toFixed(2)}</div></CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-deduction">Deducciones</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-heading text-deduction">−${deductions.toFixed(2)}</div></CardContent>
        </Card>
        <Card className="stat-card border-primary/30">
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Final</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-heading">${total.toFixed(2)}</div></CardContent>
        </Card>
      </div>

      {movements.length > 0 && (
        <div className="data-table-wrapper">
          <div className="p-4 border-b"><h3 className="font-medium text-sm">Detalle de conceptos</h3></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Tarifa</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.concept_name}</TableCell>
                  <TableCell>
                    <span className={m.category === "extra" ? "earning-badge" : "deduction-badge"}>
                      {m.category === "extra" ? "Extra" : "Deducción"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{m.quantity ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{m.rate ? `$${m.rate}` : "—"}</TableCell>
                  <TableCell className="text-right font-mono font-medium">${m.total_value.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.note ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}