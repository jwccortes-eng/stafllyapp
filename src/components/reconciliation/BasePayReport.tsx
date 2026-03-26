import { useMemo, useState } from "react";
import type { ReconciliationRowResult } from "@/lib/payroll-reconciliation-engine";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import {
  Search, Clock, DollarSign, Users, Download, ArrowUpDown,
  AlertTriangle, FileText, Timer, Filter, EyeOff
} from "lucide-react";

/* ── Formatting helpers ── */
const fmt = (v: number | null | undefined) =>
  v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

const fmtH = (v: number | null | undefined) =>
  v != null ? v.toFixed(2) : "—";

/* ── Non-payroll exclusion patterns ── */
const EXCLUDED_NAME_PATTERNS = [
  /^SYSTEM\s*\d*/i,
  /CONECTEAM/i,
  /GENERAL\s*ADMIN/i,
  /BOOKKEEPING/i,
  /NUMERIC/i,
];

function isNonPayrollEmployee(firstName: string, lastName: string): boolean {
  const full = `${firstName} ${lastName}`.trim();
  return EXCLUDED_NAME_PATTERNS.some(rx => rx.test(full));
}

/* ── Types ── */
interface BasePayRow {
  name: string;
  hours: number | null;
  rate: number | null;
  basePay: number;
  source: "clocked" | "truth_historical" | "manual_override" | "inferred";
  observation: string;
  sourceDetail: string;
  row: ReconciliationRowResult;
  excluded: boolean;
}

function deriveSource(row: ReconciliationRowResult): { source: BasePayRow["source"]; detail: string } {
  const tags = row.system?.source_tags || [];
  if (tags.includes("historical_mirror")) return { source: "truth_historical", detail: "Espejo del truth file (histórico)" };
  if (row.classification.has_manual_adjustment) return { source: "manual_override", detail: "Ajuste manual registrado" };
  if (tags.includes("base_pay")) return { source: "clocked", detail: "Fichajes reales (period_base_pay)" };
  if (row.truth.total_hours != null && row.truth.total_hours > 0) return { source: "truth_historical", detail: "Horas del truth file" };
  return { source: "inferred", detail: "Sin fuente verificada" };
}

const SOURCE_CONFIG: Record<BasePayRow["source"], { label: string; className: string; icon: typeof Clock }> = {
  clocked: { label: "Clocked", className: "bg-earning/12 text-earning border-earning/25", icon: Timer },
  truth_historical: { label: "Truth", className: "bg-info/12 text-info border-info/25", icon: FileText },
  manual_override: { label: "Manual", className: "bg-warning/12 text-warning border-warning/25", icon: AlertTriangle },
  inferred: { label: "Inferido", className: "bg-muted text-muted-foreground border-border", icon: AlertTriangle },
};

interface BasePayReportProps {
  rows: ReconciliationRowResult[];
  isHistorical: boolean;
  periodLabel?: string;
}

export default function BasePayReport({ rows, isHistorical, periodLabel }: BasePayReportProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "hours" | "basePay">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showExcluded, setShowExcluded] = useState(false);

  const baseRows = useMemo<BasePayRow[]>(() => {
    return rows.map(row => {
      const hours = row.truth.total_hours;
      const basePay = row.truth.total_pay || 0;
      const rate = hours && hours > 0 && basePay > 0
        ? Math.round((basePay / hours) * 100) / 100
        : null;
      const { source, detail } = deriveSource(row);
      const obs = row.truth.observaciones || "";
      const firstName = row.truth.first_name || "";
      const lastName = row.truth.last_name || "";

      return {
        name: `${firstName} ${lastName}`.trim(),
        hours,
        rate,
        basePay,
        source,
        observation: obs,
        sourceDetail: detail,
        row,
        excluded: isNonPayrollEmployee(firstName, lastName),
      };
    });
  }, [rows]);

  const excludedCount = useMemo(() => baseRows.filter(r => r.excluded).length, [baseRows]);

  const filtered = useMemo(() => {
    let result = showExcluded ? baseRows : baseRows.filter(r => !r.excluded);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "hours") cmp = (a.hours ?? 0) - (b.hours ?? 0);
      else cmp = a.basePay - b.basePay;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [baseRows, search, sortBy, sortDir, showExcluded]);

  const summary = useMemo(() => {
    const payable = baseRows.filter(r => !r.excluded);
    const totalHours = payable.reduce((s, r) => s + (r.hours ?? 0), 0);
    const totalBasePay = payable.reduce((s, r) => s + r.basePay, 0);
    const bySrc = { clocked: 0, truth_historical: 0, manual_override: 0, inferred: 0 };
    payable.forEach(r => bySrc[r.source]++);

    const exclHours = baseRows.filter(r => r.excluded).reduce((s, r) => s + (r.hours ?? 0), 0);
    const exclPay = baseRows.filter(r => r.excluded).reduce((s, r) => s + r.basePay, 0);

    return { totalHours, totalBasePay, count: payable.length, bySrc, excludedCount, exclHours, exclPay };
  }, [baseRows, excludedCount]);

  const toggleSort = (col: "name" | "hours" | "basePay") => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const handleExportCSV = () => {
    const payable = showExcluded ? filtered : filtered.filter(r => !r.excluded);
    const headers = ["Empleado", "Horas", "Tarifa", "Base Pay", "Fuente", "Excluido", "Observación"];
    const csvRows = payable.map(r => [
      r.name, fmtH(r.hours), r.rate != null ? `$${r.rate.toFixed(2)}` : "",
      fmt(r.basePay), r.source, r.excluded ? "Sí" : "No", r.observation,
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "base_pay_report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary KPIs — payable only */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryKpi icon={Users} label="Empleados" value={String(summary.count)} />
        <SummaryKpi icon={Clock} label="Total Horas" value={fmtH(summary.totalHours)} />
        <SummaryKpi icon={DollarSign} label="Total Base Pay" value={fmt(summary.totalBasePay)} accent="earning" />
        <SummaryKpi icon={Timer} label="Clocked" value={String(summary.bySrc.clocked)} />
        <SummaryKpi icon={FileText} label="Truth" value={String(summary.bySrc.truth_historical)} />
        <SummaryKpi icon={AlertTriangle} label="Manual / Inferido" value={String(summary.bySrc.manual_override + summary.bySrc.inferred)} />
        {excludedCount > 0 && (
          <SummaryKpi icon={EyeOff} label="Excluidos" value={`${excludedCount} (${fmtH(summary.exclHours)}h)`} accent="muted" />
        )}
      </div>

      {/* Exclusion banner */}
      {excludedCount > 0 && (
        <Card className="shadow-none border-warning/30 bg-warning/[0.04]">
          <CardContent className="py-2 px-4 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-warning">
              <Filter className="h-3.5 w-3.5" />
              <span className="font-medium">
                {excludedCount} empleado{excludedCount > 1 ? "s" : ""} no-nómina excluido{excludedCount > 1 ? "s" : ""} (SYSTEM, Admin, etc.)
                — {fmtH(summary.exclHours)}h / {fmt(summary.exclPay)} removidos del total
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-muted-foreground text-[10px]">Mostrar</span>
              <Switch checked={showExcluded} onCheckedChange={setShowExcluded} className="scale-75" />
            </div>
          </CardContent>
        </Card>
      )}

      {isHistorical && (
        <Card className="shadow-none border-info/30 bg-info/[0.04]">
          <CardContent className="py-2 px-4 flex items-center gap-2 text-xs text-info">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium">Periodo Histórico — horas y base pay provienen del Truth File como fuente autoritativa.</span>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <Card className="shadow-none border-border/50">
        <CardContent className="py-2 px-4 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded-lg" />
          </div>
          <p className="text-[10px] text-muted-foreground tabular-nums font-medium ml-auto">{filtered.length} de {baseRows.length}</p>
          <Button variant="ghost" size="sm" className="h-8 text-xs rounded-lg gap-1.5" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" />CSV
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-none overflow-hidden">
        <div className="overflow-auto max-h-[55vh]">
          <Table>
            <TableHeader className="sticky top-0 z-30">
              <TableRow>
                <TableHead className="sticky left-0 z-40 bg-surface-2 min-w-[180px] py-2.5">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                    Empleado <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right py-2.5">
                  <button className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors" onClick={() => toggleSort("hours")}>
                    Horas <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right py-2.5">Tarifa</TableHead>
                <TableHead className="text-right py-2.5 !font-bold">
                  <button className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors" onClick={() => toggleSort("basePay")}>
                    Base Pay <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="py-2.5 text-center">Fórmula</TableHead>
                <TableHead className="py-2.5">Fuente</TableHead>
                <TableHead className="py-2.5 w-10">Obs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => {
                const cfg = SOURCE_CONFIG[r.source];
                const formulaText = r.hours != null && r.hours > 0 && r.rate != null
                  ? `${fmtH(r.hours)} × $${r.rate.toFixed(2)} = ${fmt(r.basePay)}`
                  : r.basePay > 0 ? fmt(r.basePay) : "—";

                return (
                  <TableRow
                    key={i}
                    className={`text-xs transition-colors ${r.excluded ? "opacity-50 bg-muted/20" : "hover:bg-accent/40"}`}
                  >
                    <TableCell className="sticky left-0 bg-card z-10 py-2">
                      <div className="flex items-center gap-1.5">
                        {r.excluded ? (
                          <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-earning shrink-0" />
                        )}
                        <span className="font-medium truncate max-w-[150px]">{r.name}</span>
                        {r.excluded && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 border-muted-foreground/30 text-muted-foreground ml-1">
                            No-nómina
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono py-2 tabular-nums">
                      {r.hours != null ? r.hours.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono py-2 text-muted-foreground tabular-nums">
                      {r.rate != null ? `$${r.rate.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold py-2 tabular-nums">
                      {r.basePay > 0 ? fmt(r.basePay) : "—"}
                    </TableCell>
                    <TableCell className="text-center py-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{formulaText}</span>
                    </TableCell>
                    <TableCell className="py-2">
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className={`text-[9px] font-semibold px-1.5 py-0 ${cfg.className}`}>
                            <cfg.icon className="h-2.5 w-2.5 mr-0.5" />{cfg.label}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-xs">{r.sourceDetail}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="py-2">
                      {r.observation ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-info/10 text-info border border-info/20">
                              <FileText className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs text-xs">{r.observation}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SummaryKpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <Card className="shadow-none border-border/40">
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <div className={`p-2 rounded-xl ${accent === "earning" ? "bg-earning/12" : accent === "muted" ? "bg-muted/60" : "bg-muted/60"}`}>
          <Icon className={`h-4 w-4 ${accent === "earning" ? "text-earning" : "text-muted-foreground"}`} />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <p className={`text-lg font-bold font-heading tabular-nums ${accent === "earning" ? "text-earning" : ""}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}