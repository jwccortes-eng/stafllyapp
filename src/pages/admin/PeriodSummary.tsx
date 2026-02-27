import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Search, X, Filter, Users, DollarSign, TrendingUp, TrendingDown, ArrowUpDown, CalendarIcon, CheckCircle2, Loader2, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

/**
 * Find the period that contains today (Wed–Tue cycle), or the most recent past period.
 */
function findCurrentWeekPeriod(periods: Period[]): string {
  const today = new Date().toISOString().slice(0, 10);
  // First try to find a period that contains today
  const current = periods.find(p => p.start_date <= today && p.end_date >= today);
  if (current) return current.id;
  // Otherwise pick the most recent past period (periods are already sorted desc)
  const past = periods.find(p => p.end_date < today);
  return past?.id ?? "";
}

interface Period { id: string; start_date: string; end_date: string; status: string; paid_at: string | null; }
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
  const { user, hasActionPermission } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(searchParams.get("periodId") ?? "");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const canConsolidate = hasActionPermission("aprobar_nomina");

  // When date range changes, find matching period(s) - for now select the first match
  useEffect(() => {
    if (!dateFrom && !dateTo) return;
    if (periods.length === 0) return;
    const fromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : null;
    const toStr = dateTo ? format(dateTo, "yyyy-MM-dd") : null;
    const matching = periods.filter(p => {
      if (fromStr && p.start_date < fromStr) return false;
      if (toStr && p.end_date > toStr) return false;
      return true;
    });
    if (matching.length > 0 && matching[0].id !== selectedPeriod) {
      setSelectedPeriod(matching[0].id);
      setSearchParams({ periodId: matching[0].id });
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from("pay_periods").select("id, start_date, end_date, status, paid_at").eq("company_id", selectedCompanyId).order("start_date", { ascending: false }).then(({ data }) => {
      const all = (data as Period[]) ?? [];
      setPeriods(all);
      // Auto-select current week if no period is selected
      if (!searchParams.get("periodId") && all.length > 0) {
        const autoId = findCurrentWeekPeriod(all);
        if (autoId) {
          setSelectedPeriod(autoId);
          setSearchParams({ periodId: autoId });
        }
      }
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
          extras_total: 0, deductions_total: 0, total_final_pay: 0,
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
            base_total_pay: 0, extras_total: 0, deductions_total: 0, total_final_pay: 0,
          });
        }
      });
      (movements ?? []).forEach((m: any) => {
        const row = empMap.get(m.employee_id);
        if (!row) return;
        if (m.concepts?.category === "extra") row.extras_total += Number(m.total_value) || 0;
        else row.deductions_total += Number(m.total_value) || 0;
      });
      empMap.forEach((row) => { row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total; });
      setRows(Array.from(empMap.values()));
      setLoading(false);
    }
    load();
  }, [selectedPeriod]);

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

  const sortIcon = (key: SortKey) => (
    <ArrowUpDown className={`h-3 w-3 ml-1 inline-block transition-opacity ${sortKey === key ? "opacity-100" : "opacity-30"}`} />
  );

  const grandTotal = filtered.reduce((s, r) => s + r.total_final_pay, 0);
  const grandBase = filtered.reduce((s, r) => s + r.base_total_pay, 0);
  const grandExtras = filtered.reduce((s, r) => s + r.extras_total, 0);
  const grandDeductions = filtered.reduce((s, r) => s + r.deductions_total, 0);
  const withExtras = rows.filter(r => r.extras_total > 0).length;
  const withDeductions = rows.filter(r => r.deductions_total > 0).length;
  const withBase = rows.filter(r => r.base_total_pay > 0).length;

  const selectedPeriodObj = periods.find(p => p.id === selectedPeriod);

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
  const hasDateFilter = dateFrom || dateTo;
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const clearDates = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const resetToCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = (day - 3 + 7) % 7;
    const wed = new Date(today);
    wed.setDate(today.getDate() - diff);
    wed.setHours(0, 0, 0, 0);
    const tue = new Date(wed);
    tue.setDate(wed.getDate() + 6);
    tue.setHours(23, 59, 59, 999);
    setDateFrom(wed);
    setDateTo(tue);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <PageHeader
          variant="2"
          title="Resumen del periodo"
          subtitle="Consolidación: base + extras − deducciones"
          badge="Semanal"
          rightSlot={selectedPeriod ? (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Consolidate clock button */}
              {canConsolidate && selectedPeriodObj && selectedPeriodObj.status === "open" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={consolidating}
                  onClick={async () => {
                    if (!selectedCompanyId) return;
                    setConsolidating(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("payroll-consolidate", {
                        body: { company_id: selectedCompanyId, period_id: selectedPeriod },
                      });
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      toast({
                        title: "Horas consolidadas",
                        description: `${data.consolidated_employees} empleado(s) actualizados. ${data.skipped_import_employees} con import CSV preservados.`,
                      });
                      setSelectedPeriod(prev => {
                        setTimeout(() => setSelectedPeriod(selectedPeriod), 50);
                        return "";
                      });
                    } catch (err: any) {
                      toast({ title: "Error al consolidar", description: err.message, variant: "destructive" });
                    }
                    setConsolidating(false);
                  }}
                >
                  {consolidating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Clock className="h-4 w-4 mr-1.5" />}
                  Consolidar horas desde reloj
                </Button>
              )}
              {selectedPeriodObj && (selectedPeriodObj.status === "closed" || selectedPeriodObj.status === "published") && !selectedPeriodObj.paid_at && (
                <Button
                  variant="default"
                  size="sm"
                  disabled={markingPaid}
                  onClick={async () => {
                    setMarkingPaid(true);
                    const { error } = await supabase
                      .from("pay_periods")
                      .update({ status: "paid", paid_at: new Date().toISOString() } as any)
                      .eq("id", selectedPeriod);
                    if (error) {
                      toast({ title: "Error", description: error.message, variant: "destructive" });
                    } else {
                      toast({ title: "Periodo marcado como pagado" });
                      setPeriods(prev => prev.map(p => p.id === selectedPeriod ? { ...p, status: "paid", paid_at: new Date().toISOString() } : p));
                    }
                    setMarkingPaid(false);
                  }}
                >
                  {markingPaid ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                  Marcar como Pagado
                </Button>
              )}
              {selectedPeriodObj?.paid_at && (
                <span className="text-xs font-semibold text-earning bg-earning/10 px-3 py-1.5 rounded-full">
                  ✓ Pagado el {new Date(selectedPeriodObj.paid_at).toLocaleDateString("es")}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-1.5" />Exportar
              </Button>
            </div>
          ) : undefined}
        />

        {/* Period selector + date range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px]">
            <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar periodo" />
              </SelectTrigger>
              <SelectContent>
                {periods.map(p => {
                  const today = new Date().toISOString().slice(0, 10);
                  const isCurrent = p.start_date <= today && p.end_date >= today;
                  return (
                    <SelectItem key={p.id} value={p.id} className={isCurrent ? "font-semibold text-primary" : ""}>
                      {isCurrent ? "● " : ""}{p.start_date} → {p.end_date} {p.status === "closed" ? "🔒" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs text-muted-foreground">o filtrar por fechas:</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("min-w-[130px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "Desde"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("min-w-[130px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {dateTo ? format(dateTo, "yyyy-MM-dd") : "Hasta"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="sm" onClick={resetToCurrentWeek} className="text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" /> Semana actual
          </Button>

          <Button variant="ghost" size="sm" onClick={() => {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
            firstDay.setHours(0, 0, 0, 0);
            lastDay.setHours(23, 59, 59, 999);
            setDateFrom(firstDay);
            setDateTo(lastDay);
          }} className="text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" /> Último mes
          </Button>

          <Button variant="ghost" size="sm" onClick={() => {
            const today = new Date();
            const qMonth = Math.floor(today.getMonth() / 3) * 3;
            const firstDay = new Date(today.getFullYear(), qMonth - 3, 1);
            const lastDay = new Date(today.getFullYear(), qMonth, 0);
            firstDay.setHours(0, 0, 0, 0);
            lastDay.setHours(23, 59, 59, 999);
            setDateFrom(firstDay);
            setDateTo(lastDay);
          }} className="text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" /> Último trimestre
          </Button>

          {hasDateFilter && (
            <Button variant="ghost" size="sm" onClick={clearDates} className="text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1" /> Limpiar fechas
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            value={rows.length.toString()}
            label="Empleados en periodo"
            icon={<Users className="h-5 w-5 text-primary" />}
            accent="primary"
            subtitle={`${withBase} con pago base`}
          />
          <KpiCard
            value={`$${fmt(grandBase)}`}
            label="Total pago base"
            icon={<DollarSign className="h-5 w-5 text-primary" />}
            accent="primary"
          />
          <KpiCard
            value={`$${fmt(grandExtras)}`}
            label="Total extras"
            icon={<TrendingUp className="h-5 w-5 text-earning" />}
            accent="earning"
            subtitle={`${withExtras} empleados con extras`}
          />
          <KpiCard
            value={`$${fmt(grandDeductions)}`}
            label="Total deducciones"
            icon={<TrendingDown className="h-5 w-5 text-deduction" />}
            accent="deduction"
            subtitle={`${withDeductions} con deducciones`}
          />
        </div>
      )}

      {/* Progress Bars */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ProgressBar current={withBase} total={rows.length} label="Con pago base" accent="primary" />
          <ProgressBar current={withExtras} total={rows.length} label="Con extras" accent="earning" />
          <ProgressBar current={withDeductions} total={rows.length} label="Con deducciones" accent="deduction" />
        </div>
      )}

      {/* Search & Filters */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
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
              <X className="h-3.5 w-3.5 mr-1" /> Limpiar
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {sorted.length}/{rows.length} empleados
          </span>
        </div>
      )}

      {/* Main Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Cargando resumen...
          </div>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                  <span className="flex items-center gap-1">Empleado {sortIcon("name")}</span>
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("base")}>
                  <span className="flex items-center justify-end gap-1">Base {sortIcon("base")}</span>
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("extras")}>
                  <span className="flex items-center justify-end gap-1">Extras {sortIcon("extras")}</span>
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("deductions")}>
                  <span className="flex items-center justify-end gap-1">Deducciones {sortIcon("deductions")}</span>
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors font-bold" onClick={() => toggleSort("total")}>
                  <span className="flex items-center justify-end gap-1">Total Final {sortIcon("total")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    {rows.length === 0 ? "Selecciona un periodo para ver el resumen" : "Sin resultados para los filtros aplicados"}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {sorted.map(r => (
                    <Tooltip key={r.employee_id}>
                      <TooltipTrigger asChild>
                        <TableRow
                          className="group cursor-pointer transition-colors hover:bg-accent/40"
                          onMouseEnter={() => setHoveredRow(r.employee_id)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          <TableCell>
                            <Link
                              to={`/app/summary/detail?employeeId=${r.employee_id}&periodId=${selectedPeriod}`}
                              className="flex items-center gap-2.5 group-hover:text-primary transition-colors"
                            >
                              <EmployeeAvatar firstName={r.first_name} lastName={r.last_name} size="sm" />
                              <span className="font-medium">{r.first_name} {r.last_name}</span>
                            </Link>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            ${fmt(r.base_total_pay)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {r.extras_total > 0 ? (
                              <span className="text-earning font-medium">+${fmt(r.extras_total)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {r.deductions_total > 0 ? (
                              <span className="text-deduction font-medium">−${fmt(r.deductions_total)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums font-bold">
                            ${fmt(r.total_final_pay)}
                          </TableCell>
                        </TableRow>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="space-y-1 text-xs">
                        <p className="font-semibold">{r.first_name} {r.last_name}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span className="text-muted-foreground">Base:</span>
                          <span className="text-right font-mono">${fmt(r.base_total_pay)}</span>
                          <span className="text-muted-foreground">Extras:</span>
                          <span className="text-right font-mono text-earning">+${fmt(r.extras_total)}</span>
                          <span className="text-muted-foreground">Deducciones:</span>
                          <span className="text-right font-mono text-deduction">−${fmt(r.deductions_total)}</span>
                          <span className="font-semibold border-t pt-0.5">Total:</span>
                          <span className="text-right font-mono font-bold border-t pt-0.5">${fmt(r.total_final_pay)}</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-muted/50 border-t-2 border-border">
                    <TableCell className="font-bold">
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-primary/10 text-primary h-7 w-7 flex items-center justify-center text-[10px] font-bold shrink-0">
                          Σ
                        </span>
                        TOTAL ({sorted.length})
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold tabular-nums">${fmt(grandBase)}</TableCell>
                    <TableCell className="text-right font-mono font-bold tabular-nums text-earning">+${fmt(grandExtras)}</TableCell>
                    <TableCell className="text-right font-mono font-bold tabular-nums text-deduction">−${fmt(grandDeductions)}</TableCell>
                    <TableCell className="text-right font-mono font-bold tabular-nums text-lg">${fmt(grandTotal)}</TableCell>
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
