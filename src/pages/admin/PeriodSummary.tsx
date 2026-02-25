import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Search, X, Filter } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

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

type SortKey = "name" | "base" | "extras" | "deductions" | "total";
type SortDir = "asc" | "desc";
type PayFilter = "all" | "with_extras" | "with_deductions" | "zero_base";

export default function PeriodSummary() {
  const { selectedCompanyId } = useCompany();
  const [searchParams, setSearchParams] = useSearchParams();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(searchParams.get("periodId") ?? "");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from("pay_periods").select("id, start_date, end_date").eq("company_id", selectedCompanyId).order("start_date", { ascending: false }).then(({ data }) => {
      setPeriods((data as Period[]) ?? []);
      if (!selectedPeriod) setSelectedPeriod("");
    });
  }, [selectedCompanyId]);

  const handlePeriodChange = (val: string) => {
    setSelectedPeriod(val);
    setSearchParams({ periodId: val });
  };

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);

    async function load() {
      const { data: basePays } = await supabase
        .from("period_base_pay")
        .select("employee_id, base_total_pay, employees(first_name, last_name)")
        .eq("period_id", selectedPeriod);

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

      const { data: movEmployees } = await supabase
        .from("movements")
        .select("employee_id, employees(first_name, last_name)")
        .eq("period_id", selectedPeriod);

      (movEmployees ?? []).forEach((me: any) => {
        if (!empMap.has(me.employee_id) && me.employees) {
          empMap.set(me.employee_id, {
            employee_id: me.employee_id,
            first_name: me.employees.first_name ?? "",
            last_name: me.employees.last_name ?? "",
            base_total_pay: 0,
            extras_total: 0,
            deductions_total: 0,
            total_final_pay: 0,
          });
        }
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

      setRows(Array.from(empMap.values()));
      setLoading(false);
    }
    load();
  }, [selectedPeriod]);

  // Filter & sort
  const filtered = rows.filter((r) => {
    const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
    if (searchTerm && !fullName.includes(searchTerm.toLowerCase())) return false;
    if (payFilter === "with_extras" && r.extras_total === 0) return false;
    if (payFilter === "with_deductions" && r.deductions_total === 0) return false;
    if (payFilter === "zero_base" && r.base_total_pay > 0) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name": cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`); break;
      case "base": cmp = a.base_total_pay - b.base_total_pay; break;
      case "extras": cmp = a.extras_total - b.extras_total; break;
      case "deductions": cmp = a.deductions_total - b.deductions_total; break;
      case "total": cmp = a.total_final_pay - b.total_final_pay; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortIndicator = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const grandTotal = filtered.reduce((s, r) => s + r.total_final_pay, 0);
  const grandBase = filtered.reduce((s, r) => s + r.base_total_pay, 0);
  const grandExtras = filtered.reduce((s, r) => s + r.extras_total, 0);
  const grandDeductions = filtered.reduce((s, r) => s + r.deductions_total, 0);

  const exportCSV = () => {
    const header = "Empleado,Base,Extras,Deducciones,Total Final\n";
    const csv = sorted.map(r => `"${r.first_name} ${r.last_name}",${r.base_total_pay},${r.extras_total},${r.deductions_total},${r.total_final_pay}`).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumen-periodo-${selectedPeriod}.csv`;
    a.click();
  };

  const hasActiveFilters = searchTerm || payFilter !== "all";

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
        <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
          <SelectTrigger><SelectValue placeholder="Seleccionar periodo" /></SelectTrigger>
          <SelectContent>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.start_date} → {p.end_date}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Search & Filters */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empleado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={payFilter} onValueChange={(v) => setPayFilter(v as PayFilter)}>
              <SelectTrigger className="h-9 w-[170px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="with_extras">Con extras</SelectItem>
                <SelectItem value="with_deductions">Con deducciones</SelectItem>
                <SelectItem value="zero_base">Sin pago base</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(""); setPayFilter("all"); }} className="text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Limpiar filtros
            </Button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {sorted.length} de {rows.length} empleados
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : (
        <div className="data-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                  Empleado{sortIndicator("name")}
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("base")}>
                  Base{sortIndicator("base")}
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("extras")}>
                  Extras{sortIndicator("extras")}
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("deductions")}>
                  Deducciones{sortIndicator("deductions")}
                </TableHead>
                <TableHead className="text-right font-bold cursor-pointer select-none" onClick={() => toggleSort("total")}>
                  Total Final{sortIndicator("total")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {rows.length === 0 ? "Selecciona un periodo" : "Sin resultados para los filtros aplicados"}
                </TableCell></TableRow>
              ) : (
                <>
                  {sorted.map(r => (
                    <TableRow key={r.employee_id}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/admin/summary/detail?employeeId=${r.employee_id}&periodId=${selectedPeriod}`}
                          className="text-primary hover:underline"
                        >
                          {r.first_name} {r.last_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">${r.base_total_pay.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-earning">+${r.extras_total.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-deduction">−${r.deductions_total.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">${r.total_final_pay.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL ({sorted.length})</TableCell>
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
