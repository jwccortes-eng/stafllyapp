import { useEffect, useState, useMemo } from "react";
import { formatPersonName } from "@/lib/format-helpers";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, User, DollarSign, TrendingUp, TrendingDown, Search, Download, CalendarIcon, X, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
}

interface ConceptDetail {
  concept_name: string;
  category: string;
  total_value: number;
  quantity: number | null;
  rate: number | null;
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
  concepts: ConceptDetail[];
}

export default function EmployeeReport() {
  const { selectedCompanyId } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [search, setSearch] = useState("");
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

  const getCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = (day - 3 + 7) % 7;
    const wed = new Date(today);
    wed.setDate(today.getDate() - diff);
    wed.setHours(0, 0, 0, 0);
    const tue = new Date(wed);
    tue.setDate(wed.getDate() + 6);
    tue.setHours(23, 59, 59, 999);
    return { wed, tue };
  };

  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const togglePeriod = (periodId: string) => {
    setExpandedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(periodId)) next.delete(periodId);
      else next.add(periodId);
      return next;
    });
  };

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
          .select("period_id, total_value, quantity, rate, concepts(name, category)")
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
          concepts: [],
        });
      });

      // Also ensure periods with movements but no base_pay are included
      (movRes.data ?? []).forEach((m: any) => {
        if (!map.has(m.period_id)) {
          const info = periodInfo.get(m.period_id);
          if (!info) return;
          map.set(m.period_id, {
            period_id: m.period_id,
            start_date: info.start_date,
            end_date: info.end_date,
            status: info.status,
            base_total_pay: 0,
            extras_total: 0,
            deductions_total: 0,
            total_final_pay: 0,
            concepts: [],
          });
        }
      });

      (movRes.data ?? []).forEach((m: any) => {
        const row = map.get(m.period_id);
        if (!row) return;
        const val = Number(m.total_value) || 0;
        const conceptName = m.concepts?.name ?? "Sin concepto";
        const category = m.concepts?.category ?? "extra";

        if (category === "extra") {
          row.extras_total += val;
        } else {
          row.deductions_total += val;
        }

        // Aggregate same concept within a period
        const existing = row.concepts.find(c => c.concept_name === conceptName && c.category === category);
        if (existing) {
          existing.total_value += val;
          if (m.quantity != null && existing.quantity != null) existing.quantity += Number(m.quantity);
        } else {
          row.concepts.push({
            concept_name: conceptName,
            category,
            total_value: val,
            quantity: m.quantity != null ? Number(m.quantity) : null,
            rate: m.rate != null ? Number(m.rate) : null,
          });
        }
      });

      map.forEach(row => {
        row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total;
        // Sort concepts: extras first, then deductions
        row.concepts.sort((a, b) => {
          if (a.category !== b.category) return a.category === "extra" ? -1 : 1;
          return a.concept_name.localeCompare(b.concept_name);
        });
      });

      setPeriods(Array.from(map.values()).sort((a, b) => b.start_date.localeCompare(a.start_date)));
      setLoading(false);
    }
    load();
  }, [selectedEmployee, selectedCompanyId]);

  /* ── filtered by date range ── */
  const filteredPeriods = useMemo(() => {
    const fromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : null;
    const toStr = dateTo ? format(dateTo, "yyyy-MM-dd") : null;
    return periods.filter(p => {
      if (fromStr && p.start_date < fromStr) return false;
      if (toStr && p.end_date > toStr) return false;
      return true;
    });
  }, [periods, dateFrom, dateTo]);

  const filteredEmployees = employees.filter(e =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedEmp = employees.find(e => e.id === selectedEmployee);
  const totalBase = filteredPeriods.reduce((s, r) => s + r.base_total_pay, 0);
  const totalExtras = filteredPeriods.reduce((s, r) => s + r.extras_total, 0);
  const totalDeductions = filteredPeriods.reduce((s, r) => s + r.deductions_total, 0);
  const totalFinal = filteredPeriods.reduce((s, r) => s + r.total_final_pay, 0);

  // Aggregate all concepts across filtered periods for summary
  const conceptSummary = useMemo(() => {
    const summary = new Map<string, { name: string; category: string; total: number }>();
    filteredPeriods.forEach(p => {
      p.concepts.forEach(c => {
        const key = `${c.category}:${c.concept_name}`;
        const existing = summary.get(key);
        if (existing) {
          existing.total += c.total_value;
        } else {
          summary.set(key, { name: c.concept_name, category: c.category, total: c.total_value });
        }
      });
    });
    return Array.from(summary.values()).sort((a, b) => {
      if (a.category !== b.category) return a.category === "extra" ? -1 : 1;
      return b.total - a.total;
    });
  }, [filteredPeriods]);

  const exportCSV = () => {
    if (!selectedEmp || filteredPeriods.length === 0) return;
    const header = "Inicio,Fin,Estado,Base,Extras,Deducciones,Total,Conceptos";
    const rows = filteredPeriods.map(p => {
      const conceptsStr = p.concepts.map(c => `${c.concept_name}: $${c.total_value.toFixed(2)}`).join(" | ");
      return `${p.start_date},${p.end_date},${p.status},${p.base_total_pay.toFixed(2)},${p.extras_total.toFixed(2)},${p.deductions_total.toFixed(2)},${p.total_final_pay.toFixed(2)},"${conceptsStr}"`;
    });
    const totalsRow = `TOTALES,,,${totalBase.toFixed(2)},${totalExtras.toFixed(2)},${totalDeductions.toFixed(2)},${totalFinal.toFixed(2)},`;
    const csv = [header, ...rows, totalsRow].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${selectedEmp.first_name}_${selectedEmp.last_name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!selectedEmp || filteredPeriods.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const empName = `${selectedEmp.first_name} ${selectedEmp.last_name}`;
    const rangeLabel = dateFrom && dateTo
      ? `${format(dateFrom, "dd/MM/yyyy")} – ${format(dateTo, "dd/MM/yyyy")}`
      : "Todos los periodos";

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen por Empleado", 14, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Empleado: ${empName}`, 14, 26);
    doc.text(`Rango: ${rangeLabel}`, 14, 32);
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 38);

    const kpiY = 44;
    const kpiW = 60;
    const kpiH = 18;
    const kpis = [
      { label: "Base Total", value: `$${totalBase.toFixed(2)}`, color: [59, 130, 246] as [number, number, number] },
      { label: "Extras", value: `+$${totalExtras.toFixed(2)}`, color: [34, 197, 94] as [number, number, number] },
      { label: "Deducciones", value: `-$${totalDeductions.toFixed(2)}`, color: [239, 68, 68] as [number, number, number] },
      { label: "Total Final", value: `$${totalFinal.toFixed(2)}`, color: [99, 102, 241] as [number, number, number] },
    ];
    kpis.forEach((k, i) => {
      const x = 14 + i * (kpiW + 6);
      doc.setFillColor(k.color[0], k.color[1], k.color[2]);
      doc.roundedRect(x, kpiY, kpiW, kpiH, 2, 2, "F");
      doc.setTextColor(255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(k.label, x + 4, kpiY + 6);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(k.value, x + 4, kpiY + 14);
    });

    doc.setTextColor(0);
    
    // Main table with concept details
    const tableBody: any[] = [];
    filteredPeriods.forEach(p => {
      tableBody.push([
        `${p.start_date} → ${p.end_date}`,
        p.status === "open" ? "Abierto" : "Cerrado",
        `$${p.base_total_pay.toFixed(2)}`,
        `+$${p.extras_total.toFixed(2)}`,
        `-$${p.deductions_total.toFixed(2)}`,
        `$${p.total_final_pay.toFixed(2)}`,
      ]);
      // Add concept detail rows
      if (p.concepts.length > 0) {
        p.concepts.forEach(c => {
          const sign = c.category === "extra" ? "+" : "-";
          tableBody.push([
            { content: `    ${c.concept_name}`, styles: { fontSize: 7, textColor: [120, 120, 120] as [number, number, number], fontStyle: "italic" as const } },
            "",
            "",
            c.category === "extra" ? { content: `${sign}$${c.total_value.toFixed(2)}`, styles: { fontSize: 7, textColor: [34, 150, 70] as [number, number, number] } } : "",
            c.category === "deduction" ? { content: `${sign}$${c.total_value.toFixed(2)}`, styles: { fontSize: 7, textColor: [200, 50, 50] as [number, number, number] } } : "",
            "",
          ]);
        });
      }
    });
    
    tableBody.push([
      { content: "TOTALES", colSpan: 2, styles: { fontStyle: "bold" as const, fillColor: [240, 240, 240] as [number, number, number] } },
      { content: `$${totalBase.toFixed(2)}`, styles: { fontStyle: "bold" as const, fillColor: [240, 240, 240] as [number, number, number] } },
      { content: `+$${totalExtras.toFixed(2)}`, styles: { fontStyle: "bold" as const, fillColor: [240, 240, 240] as [number, number, number] } },
      { content: `-$${totalDeductions.toFixed(2)}`, styles: { fontStyle: "bold" as const, fillColor: [240, 240, 240] as [number, number, number] } },
      { content: `$${totalFinal.toFixed(2)}`, styles: { fontStyle: "bold" as const, fillColor: [240, 240, 240] as [number, number, number] } },
    ]);

    autoTable(doc, {
      startY: kpiY + kpiH + 8,
      head: [["Semana", "Estado", "Base", "Extras", "Deducciones", "Total"]],
      body: tableBody,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [51, 51, 51], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right", textColor: [34, 150, 70] },
        4: { halign: "right", textColor: [200, 50, 50] },
        5: { halign: "right", fontStyle: "bold" },
      },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`${filteredPeriods.length} periodos · Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 8);
    }

    doc.save(`reporte_${selectedEmp.first_name}_${selectedEmp.last_name}.pdf`);
  };

  const clearDates = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasDateFilter = dateFrom || dateTo;

  return (
    <div>
      <div className="page-header">
        <Link to="/app/reports">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver a reportes
          </Button>
        </Link>
        <PageHeader
          variant="4"
          eyebrow="ANÁLISIS"
          title="Resumen por empleado"
          subtitle="Historial de pagos y novedades de un empleado"
        />
      </div>

      {/* Controls row */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        {/* Employee selector */}
        <div className="flex-1 min-w-[200px] max-w-sm">
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
                  {formatPersonName(`${e.first_name} ${e.last_name}`)} {!e.is_active && "(inactivo)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date from */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("min-w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "Desde"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        {/* Date to */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("min-w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {dateTo ? format(dateTo, "yyyy-MM-dd") : "Hasta"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="sm" onClick={() => { const w = getCurrentWeek(); setDateFrom(w.wed); setDateTo(w.tue); }} className="text-muted-foreground">
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
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}

        {selectedEmployee && filteredPeriods.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <FileText className="h-4 w-4 mr-1" /> Descargar PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </>
        )}
      </div>

      {selectedEmployee && !loading && filteredPeriods.length > 0 && (
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
                <p className="text-xs text-muted-foreground">{filteredPeriods.length} periodos</p>
              </CardContent>
            </Card>
          </div>

          {/* Concept summary cards */}
          {conceptSummary.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-muted-foreground mb-2">Desglose por concepto (acumulado)</p>
              <div className="flex flex-wrap gap-2">
                {conceptSummary.map(c => (
                  <div key={`${c.category}:${c.name}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card text-sm">
                    <span className={cn("w-2 h-2 rounded-full", c.category === "extra" ? "bg-earning" : "bg-deduction")} />
                    <span className="font-medium">{c.name}</span>
                    <span className={cn("font-mono text-xs", c.category === "extra" ? "text-earning" : "text-deduction")}>
                      {c.category === "extra" ? "+" : "−"}${c.total.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="data-table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
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
                {filteredPeriods.map(p => {
                  const isExpanded = expandedPeriods.has(p.period_id);
                  const hasConcepts = p.concepts.length > 0;
                  return (
                    <>
                      <TableRow key={p.period_id} className={cn(hasConcepts && "cursor-pointer hover:bg-muted/50")} onClick={() => hasConcepts && togglePeriod(p.period_id)}>
                        <TableCell className="w-8 px-2">
                          {hasConcepts && (
                            isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
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
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Link to={`/app/summary/detail?employeeId=${selectedEmployee}&periodId=${p.period_id}`}>
                            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4 rotate-180" /></Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                      {isExpanded && p.concepts.map((c, i) => (
                        <TableRow key={`${p.period_id}-c-${i}`} className="bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground pl-8">
                            <span className={cn("inline-block w-2 h-2 rounded-full mr-2", c.category === "extra" ? "bg-earning" : "bg-deduction")} />
                            {c.concept_name}
                            {c.quantity != null && c.rate != null && (
                              <span className="text-xs ml-2 text-muted-foreground/70">
                                ({c.quantity} × ${c.rate.toFixed(2)})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-earning">
                            {c.category === "extra" ? `+$${c.total_value.toFixed(2)}` : ""}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-deduction">
                            {c.category === "deduction" ? `−$${c.total_value.toFixed(2)}` : ""}
                          </TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell></TableCell>
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

      {selectedEmployee && !loading && filteredPeriods.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {periods.length > 0 && hasDateFilter
            ? "No hay periodos en el rango de fechas seleccionado"
            : "No hay datos de pago para este empleado"}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      )}
    </div>
  );
}
