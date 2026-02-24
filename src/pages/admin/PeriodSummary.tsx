import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Period { id: string; start_date: string; end_date: string; }
interface SummaryRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  base_total_pay: number;
  extras_total: number;
  deductions_total: number;
  total_final_pay: number;
}

export default function PeriodSummary() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("pay_periods").select("id, start_date, end_date").order("start_date", { ascending: false }).then(({ data }) => {
      setPeriods((data as Period[]) ?? []);
    });
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);

    async function load() {
      // Get all employees with base pay for period
      const { data: basePays } = await supabase
        .from("period_base_pay")
        .select("employee_id, base_total_pay, employees(first_name, last_name)")
        .eq("period_id", selectedPeriod);

      // Get all movements for period
      const { data: movements } = await supabase
        .from("movements")
        .select("employee_id, total_value, concepts(category)")
        .eq("period_id", selectedPeriod);

      const empMap = new Map<string, SummaryRow>();

      (basePays ?? []).forEach((bp: any) => {
        empMap.set(bp.employee_id, {
          employee_id: bp.employee_id,
          first_name: bp.employees?.first_name ?? "",
          last_name: bp.employees?.last_name ?? "",
          base_total_pay: Number(bp.base_total_pay) || 0,
          extras_total: 0,
          deductions_total: 0,
          total_final_pay: 0,
        });
      });

      (movements ?? []).forEach((m: any) => {
        const row = empMap.get(m.employee_id);
        if (!row) return;
        if (m.concepts?.category === "extra") {
          row.extras_total += Number(m.total_value) || 0;
        } else {
          row.deductions_total += Number(m.total_value) || 0;
        }
      });

      empMap.forEach((row) => {
        row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total;
      });

      setRows(Array.from(empMap.values()).sort((a, b) => a.first_name.localeCompare(b.first_name)));
      setLoading(false);
    }
    load();
  }, [selectedPeriod]);

  const grandTotal = rows.reduce((s, r) => s + r.total_final_pay, 0);
  const grandBase = rows.reduce((s, r) => s + r.base_total_pay, 0);
  const grandExtras = rows.reduce((s, r) => s + r.extras_total, 0);
  const grandDeductions = rows.reduce((s, r) => s + r.deductions_total, 0);

  const exportCSV = () => {
    const header = "Empleado,Base,Extras,Deducciones,Total Final\n";
    const csv = rows.map(r => `"${r.first_name} ${r.last_name}",${r.base_total_pay},${r.extras_total},${r.deductions_total},${r.total_final_pay}`).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumen-periodo-${selectedPeriod}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Resumen del periodo</h1>
          <p className="page-subtitle">Consolidación: base + extras − deducciones</p>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />Exportar CSV
          </Button>
        )}
      </div>

      <div className="mb-4 max-w-xs">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger><SelectValue placeholder="Seleccionar periodo" /></SelectTrigger>
          <SelectContent>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.start_date} → {p.end_date}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : (
        <div className="data-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Extras</TableHead>
                <TableHead className="text-right">Deducciones</TableHead>
                <TableHead className="text-right font-bold">Total Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Selecciona un periodo</TableCell></TableRow>
              ) : (
                <>
                  {rows.map(r => (
                    <TableRow key={r.employee_id}>
                      <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                      <TableCell className="text-right font-mono">${r.base_total_pay.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-earning">+${r.extras_total.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-deduction">−${r.deductions_total.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">${r.total_final_pay.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right font-mono">${grandBase.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-earning">+${grandExtras.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-deduction">−${grandDeductions.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">${grandTotal.toFixed(2)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
