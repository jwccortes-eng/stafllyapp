import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, DollarSign, TrendingUp, TrendingDown, Search, Download } from "lucide-react";
import { Link } from "react-router-dom";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
}

interface PeriodRow {
  period_id: string;
  start_date: string;
  end_date: string;
  status: string;
  base_total_pay: number;
  extras_total: number;
  deductions_total: number;
  total_final_pay: number;
}

export default function EmployeeReport() {
  const { selectedCompanyId } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [search, setSearch] = useState("");
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase
      .from("employees")
      .select("id, first_name, last_name, is_active")
      .eq("company_id", selectedCompanyId)
      .order("first_name")
      .then(({ data }) => setEmployees((data as Employee[]) ?? []));
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedEmployee || !selectedCompanyId) {
      setPeriods([]);
      return;
    }
    setLoading(true);

    async function load() {
      const [baseRes, movRes, periodRes] = await Promise.all([
        supabase
          .from("period_base_pay")
          .select("period_id, base_total_pay")
          .eq("employee_id", selectedEmployee)
          .eq("company_id", selectedCompanyId!),
        supabase
          .from("movements")
          .select("period_id, total_value, concepts(category)")
          .eq("employee_id", selectedEmployee)
          .eq("company_id", selectedCompanyId!),
        supabase
          .from("pay_periods")
          .select("id, start_date, end_date, status")
          .eq("company_id", selectedCompanyId!)
          .order("start_date", { ascending: false }),
      ]);

      const periodInfo = new Map<string, { start_date: string; end_date: string; status: string }>();
      (periodRes.data ?? []).forEach((p: any) => periodInfo.set(p.id, p));

      const map = new Map<string, PeriodRow>();

      (baseRes.data ?? []).forEach((bp: any) => {
        const info = periodInfo.get(bp.period_id);
        if (!info) return;
        map.set(bp.period_id, {
          period_id: bp.period_id,
          start_date: info.start_date,
          end_date: info.end_date,
          status: info.status,
          base_total_pay: Number(bp.base_total_pay) || 0,
          extras_total: 0,
          deductions_total: 0,
          total_final_pay: 0,
        });
      });

      (movRes.data ?? []).forEach((m: any) => {
        const row = map.get(m.period_id);
        if (!row) return;
        if (m.concepts?.category === "extra") {
          row.extras_total += Number(m.total_value) || 0;
        } else {
          row.deductions_total += Number(m.total_value) || 0;
        }
      });

      map.forEach(row => {
        row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total;
      });

      setPeriods(Array.from(map.values()).sort((a, b) => b.start_date.localeCompare(a.start_date)));
      setLoading(false);
    }
    load();
  }, [selectedEmployee, selectedCompanyId]);

  const filteredEmployees = employees.filter(e =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedEmp = employees.find(e => e.id === selectedEmployee);
  const totalBase = periods.reduce((s, r) => s + r.base_total_pay, 0);
  const totalExtras = periods.reduce((s, r) => s + r.extras_total, 0);

  const exportCSV = () => {
    if (!selectedEmp || periods.length === 0) return;
    const header = "Inicio,Fin,Estado,Base,Extras,Deducciones,Total";
    const rows = periods.map(p =>
      `${p.start_date},${p.end_date},${p.status},${p.base_total_pay.toFixed(2)},${p.extras_total.toFixed(2)},${p.deductions_total.toFixed(2)},${p.total_final_pay.toFixed(2)}`
    );
    const totalsRow = `TOTALES,,,${totalBase.toFixed(2)},${totalExtras.toFixed(2)},${periods.reduce((s, r) => s + r.deductions_total, 0).toFixed(2)},${periods.reduce((s, r) => s + r.total_final_pay, 0).toFixed(2)}`;
    const csv = [header, ...rows, totalsRow].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${selectedEmp.first_name}_${selectedEmp.last_name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const totalDeductions = periods.reduce((s, r) => s + r.deductions_total, 0);
  const totalFinal = periods.reduce((s, r) => s + r.total_final_pay, 0);

  return (
    <div>
      <div className="page-header">
        <Link to="/admin/reports">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver a reportes
          </Button>
        </Link>
        <h1 className="page-title flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Resumen por empleado
        </h1>
        <p className="page-subtitle">Historial de pagos y novedades de un empleado</p>
      </div>

      <div className="mb-6 flex items-end gap-4">
        <div className="flex-1 max-w-sm">
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un empleado" />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2 border rounded-md px-2">
                <Search className="h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="border-0 h-8 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            {filteredEmployees.map(e => (
              <SelectItem key={e.id} value={e.id}>
                {e.first_name} {e.last_name} {!e.is_active && "(inactivo)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
        {selectedEmployee && periods.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        )}
      </div>

      {selectedEmployee && !loading && periods.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Base total</p>
                <p className="text-xl font-bold font-mono">${totalBase.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Extras</p>
                <p className="text-xl font-bold font-mono text-earning">+${totalExtras.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Deducciones</p>
                <p className="text-xl font-bold font-mono text-deduction">−${totalDeductions.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">Total acumulado</p>
                <p className="text-xl font-bold font-mono">${totalFinal.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{periods.length} periodos</p>
              </CardContent>
            </Card>
          </div>

          <div className="data-table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Extras</TableHead>
                  <TableHead className="text-right">Deducciones</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(p => (
                  <TableRow key={p.period_id}>
                    <TableCell className="font-medium text-sm">{p.start_date} → {p.end_date}</TableCell>
                    <TableCell>
                      <span className={p.status === "open" ? "earning-badge" : "deduction-badge"}>
                        {p.status === "open" ? "Abierto" : "Cerrado"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">${p.base_total_pay.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-earning">+${p.extras_total.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-deduction">−${p.deductions_total.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">${p.total_final_pay.toFixed(2)}</TableCell>
                    <TableCell>
                      <Link to={`/admin/summary/detail?employeeId=${selectedEmployee}&periodId=${p.period_id}`}>
                        <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4 rotate-180" /></Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2}>Totales</TableCell>
                  <TableCell className="text-right font-mono">${totalBase.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-earning">+${totalExtras.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-deduction">−${totalDeductions.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">${totalFinal.toFixed(2)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {selectedEmployee && !loading && periods.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No hay datos de pago para este empleado</div>
      )}

      {loading && (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      )}
    </div>
  );
}