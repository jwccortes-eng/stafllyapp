import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { DollarSign, CheckCircle2, AlertTriangle, Upload, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import {
  parsePayrollTruthWorkbook,
  type PayrollTruthParseResult,
  type PayrollTruthRow,
} from "@/lib/payroll-truth-parser";

interface LedgerEntry {
  id: string;
  concept: string;
  qty: number;
  rate: number;
  value: number;
  included: boolean;
  reason: string;
  category: "hourly" | "daily" | "ride" | "weekend" | "manual" | "other";
}

interface ReconBreakdown {
  employee_id: string;
  employee_name: string;
  hourly_pay: number;
  daily_pay: number;
  ride_pay: number;
  weekend_pay: number;
  manual_adj: number;
  other_pay: number;
  total_final: number;
  total_raw: number; // before dedup
  total_suppressed: number;
  schedule_count: number;
  clock_count: number;
  payroll_row_count: number;
  ledger: LedgerEntry[];
  flags: string[];
}

interface ComparisonRow {
  employee: string;
  truth: PayrollTruthRow;
  recon: ReconBreakdown | null;
  totalVariance: number;
  status: "match" | "close" | "mismatch" | "missing";
}

interface Props {
  companyId: string | null;
  periodStatusId?: string;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function classifyMovement(conceptName: string): LedgerEntry["category"] {
  const n = conceptName.toLowerCase();
  if (n.includes("daily") || n.includes("diario")) return "daily";
  if (n.includes("ride") || n.includes("ryde") || n.includes("transporte")) return "ride";
  if (n.includes("weekend") || n.includes("doble") || n.includes("double")) return "weekend";
  if (n.includes("adjust") || n.includes("manual") || n.includes("correction") || n.includes("reintegro")) return "manual";
  return "other";
}

export default function PayrollTruthValidation({ companyId, periodStatusId }: Props) {
  const [truthData, setTruthData] = useState<PayrollTruthRow[]>([]);
  const [truthParse, setTruthParse] = useState<PayrollTruthParseResult | null>(null);
  const [reconData, setReconData] = useState<ReconBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [truthLoaded, setTruthLoaded] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtVar = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v)}`;

  const toggleRow = (name: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const loadTruthFile = async () => {
    setLoading(true);
    setTruthLoaded(false);
    setTruthData([]);
    setTruthParse(null);
    try {
      const res = await fetch(`/temp-import/payroll_truth_2025-12-24_to_2025-12-30.xlsx?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`No se pudo cargar (${res.status})`);
      const parsed = parsePayrollTruthWorkbook(await res.arrayBuffer());
      setTruthParse(parsed);
      setTruthData(parsed.rows);
      setTruthLoaded(true);
    } catch (err: any) {
      console.error("Error loading truth file:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;

    (async () => {
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("is_active", true);

      const empMap = new Map<string, string>();
      (employees || []).forEach((e: any) => empMap.set(e.id, `${e.first_name} ${e.last_name}`));

      const { data: basePay } = await supabase
        .from("period_base_pay" as any)
        .select("*")
        .eq("company_id", companyId)
        .limit(500);

      const breakdowns = new Map<string, ReconBreakdown>();
      const getOrCreate = (empId: string): ReconBreakdown => {
        if (!breakdowns.has(empId)) {
          breakdowns.set(empId, {
            employee_id: empId,
            employee_name: empMap.get(empId) || empId,
            hourly_pay: 0, daily_pay: 0, ride_pay: 0, weekend_pay: 0,
            manual_adj: 0, other_pay: 0, total_final: 0, total_raw: 0, total_suppressed: 0,
            schedule_count: 0, clock_count: 0, payroll_row_count: 0,
            ledger: [], flags: [],
          });
        }
        return breakdowns.get(empId)!;
      };

      if (basePay) {
        for (const bp of basePay as any[]) {
          const row = getOrCreate(bp.employee_id);
          row.hourly_pay = bp.base_total_pay || 0;
          row.payroll_row_count = 1;
          row.ledger.push({
            id: bp.id || "base",
            concept: "Base Pay (period_base_pay)",
            qty: bp.total_work_hours || 0,
            rate: bp.total_work_hours > 0 ? (bp.base_total_pay || 0) / bp.total_work_hours : 0,
            value: bp.base_total_pay || 0,
            included: true,
            reason: "Primary base pay row",
            category: "hourly",
          });
          if (bp.import_id) row.flags.push("imported_base");
        }
      }

      // Movements with deduplication
      const { data: movements } = await supabase
        .from("movements" as any)
        .select("id, employee_id, quantity, rate, total_value, note, period_id, concepts!inner(name)")
        .eq("company_id", companyId)
        .limit(1000);

      if (movements) {
        // Group by employee, then deduplicate within each employee
        const byEmployee = new Map<string, any[]>();
        for (const m of movements as any[]) {
          const arr = byEmployee.get(m.employee_id) || [];
          arr.push(m);
          byEmployee.set(m.employee_id, arr);
        }

        byEmployee.forEach((empMovements, empId) => {
          const row = getOrCreate(empId);

          // Deduplicate: same concept + same value = duplicate from same payroll decomposition
          const seen = new Map<string, { count: number; firstId: string }>();
          
          for (const m of empMovements) {
            const conceptName = String(m.concepts?.name || "Unknown");
            const val = m.total_value || 0;
            const dedupKey = `${conceptName}|${val}`;
            const category = classifyMovement(conceptName);

            const existing = seen.get(dedupKey);
            const isDuplicate = !!existing;

            if (isDuplicate) {
              existing!.count++;
              // Suppressed duplicate
              row.ledger.push({
                id: m.id || `mov-${row.ledger.length}`,
                concept: conceptName,
                qty: m.quantity || 0,
                rate: m.rate || 0,
                value: val,
                included: false,
                reason: `Duplicate #${existing!.count} of ${dedupKey} (suppressed)`,
                category,
              });
              row.total_suppressed += val;
              row.flags.push(`dup_suppressed: ${conceptName} ${fmt(val)}`);
            } else {
              seen.set(dedupKey, { count: 1, firstId: m.id });
              // Included movement
              row.ledger.push({
                id: m.id || `mov-${row.ledger.length}`,
                concept: conceptName,
                qty: m.quantity || 0,
                rate: m.rate || 0,
                value: val,
                included: true,
                reason: "First occurrence — included",
                category,
              });

              // Only add to category totals for the FIRST occurrence
              switch (category) {
                case "daily": row.daily_pay += val; break;
                case "ride": row.ride_pay += val; break;
                case "weekend": row.weekend_pay += val; break;
                case "manual": row.manual_adj += val; break;
                case "other": row.other_pay += val; break;
              }
            }

            row.total_raw += val;
          }
        });
      }

      // Schedule counts
      const { data: schedules } = await supabase
        .from("shifts" as any)
        .select("employee_id")
        .eq("company_id", companyId)
        .limit(1000);

      if (schedules) {
        const counts = new Map<string, number>();
        for (const s of schedules as any[]) counts.set(s.employee_id, (counts.get(s.employee_id) || 0) + 1);
        counts.forEach((count, empId) => { getOrCreate(empId).schedule_count = count; });
      }

      // Clock counts
      const { data: clocks } = await supabase
        .from("time_entries" as any)
        .select("employee_id")
        .eq("company_id", companyId)
        .limit(1000);

      if (clocks) {
        const counts = new Map<string, number>();
        for (const c of clocks as any[]) counts.set(c.employee_id, (counts.get(c.employee_id) || 0) + 1);
        counts.forEach((count, empId) => { getOrCreate(empId).clock_count = count; });
      }

      // Compute deduped totals + guardrails
      breakdowns.forEach(row => {
        row.total_final = row.hourly_pay + row.daily_pay + row.ride_pay + row.weekend_pay + row.manual_adj + row.other_pay;

        if (row.schedule_count === 0 && row.clock_count === 0 && row.hourly_pay > 0) {
          row.flags.push("no_work_evidence_but_has_base_pay");
        }

        if (row.total_suppressed > 0) {
          row.flags.push(`total_suppressed: ${fmt(row.total_suppressed)} (${row.ledger.filter(l => !l.included).length} entries)`);
        }
      });

      setReconData(Array.from(breakdowns.values()));
    })();
  }, [companyId, periodStatusId]);

  const comparison = useMemo<ComparisonRow[]>(() => {
    if (truthData.length === 0) return [];
    return truthData
      .map(t => {
        const recon = reconData.find(r => normalizeName(r.employee_name) === normalizeName(t.employee));
        if (!recon) return { employee: t.employee, truth: t, recon: null, totalVariance: t.total, status: "missing" as const };
        const totalVariance = recon.total_final - t.total;
        const absTotal = Math.abs(totalVariance);
        return {
          employee: t.employee, truth: t, recon, totalVariance,
          status: (absTotal < 1 ? "match" : absTotal < 50 ? "close" : "mismatch") as ComparisonRow["status"],
        };
      })
      .sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));
  }, [truthData, reconData]);

  const stats = useMemo(() => {
    const matched = comparison.filter(c => c.status === "match").length;
    const close = comparison.filter(c => c.status === "close").length;
    const mismatch = comparison.filter(c => c.status === "mismatch").length;
    const missing = comparison.filter(c => c.status === "missing").length;
    const totalTruth = truthData.reduce((sum, row) => sum + row.total, 0);
    const totalRecon = comparison.reduce((sum, row) => sum + (row.recon?.total_final || 0), 0);
    const totalSuppressed = comparison.reduce((sum, row) => sum + (row.recon?.total_suppressed || 0), 0);
    return { matched, close, mismatch, missing, totalTruth, totalRecon, variance: totalRecon - totalTruth, totalSuppressed };
  }, [comparison, truthData]);

  const statusBadge = (s: ComparisonRow["status"]) => {
    switch (s) {
      case "match": return <Badge variant="default" className="text-xs">✓ Exacto</Badge>;
      case "close": return <Badge variant="secondary" className="text-xs">≈ Cercano</Badge>;
      case "mismatch": return <Badge variant="destructive" className="text-xs">✗ Diferente</Badge>;
      case "missing": return <Badge variant="outline" className="text-xs">? No encontrado</Badge>;
    }
  };

  const explainVariance = (c: ComparisonRow): string => {
    if (!c.recon) return "Empleado no encontrado en reconciliación";
    const parts: string[] = [];
    const r = c.recon;
    const t = c.truth;

    const hourlyDiff = r.hourly_pay - t.totalPay;
    if (Math.abs(hourlyDiff) > 1) parts.push(`Base/Hourly: recon ${fmt(r.hourly_pay)} vs truth ${fmt(t.totalPay)} (${fmtVar(hourlyDiff)})`);
    const dailyDiff = r.daily_pay - t.payperDay;
    if (Math.abs(dailyDiff) > 1) parts.push(`Daily: recon ${fmt(r.daily_pay)} vs truth ${fmt(t.payperDay)} (${fmtVar(dailyDiff)})`);
    const rideDiff = r.ride_pay - t.ryde;
    if (Math.abs(rideDiff) > 1) parts.push(`Ride: recon ${fmt(r.ride_pay)} vs truth ${fmt(t.ryde)} (${fmtVar(rideDiff)})`);
    if (r.weekend_pay > 0) parts.push(`Weekend/Double: ${fmt(r.weekend_pay)} (no truth equivalent)`);
    if (r.manual_adj !== 0) parts.push(`Manual adj: ${fmt(r.manual_adj)}`);
    if (r.other_pay > 0) parts.push(`Other: ${fmt(r.other_pay)}`);
    if (r.total_suppressed > 0) parts.push(`Duplicates suppressed: ${fmt(r.total_suppressed)}`);

    return parts.length > 0 ? parts.join(" | ") : "No significant component differences";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Validación vs. Nómina Pagada (12/24–12/30/2025)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!truthLoaded ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">Carga el archivo de nómina pagada para comparar.</p>
              <Button onClick={loadTruthFile} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                Cargar Payroll Truth Set
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Debug */}
              <details className="text-xs rounded-md border border-border p-3 bg-muted/30">
                <summary className="cursor-pointer font-medium text-foreground">Debug parser</summary>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Sheet:</span> {truthParse?.sheetUsed ?? "N/A"}</p>
                  <p><span className="font-medium text-foreground">Columns:</span> {JSON.stringify(truthParse?.detectedColumns ?? {})}</p>
                </div>
              </details>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <KpiCard label="Empleados (Truth)" value={truthData.length} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Exactos" value={stats.matched} icon={<CheckCircle2 className="h-4 w-4" />} accent="primary" />
                <KpiCard label="Cercanos" value={stats.close} icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
                <KpiCard label="Diferentes" value={stats.mismatch} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
                <KpiCard label="No encontrados" value={stats.missing} icon={<AlertTriangle className="h-4 w-4" />} accent="muted" />
                <KpiCard label="Total Truth" value={fmt(stats.totalTruth)} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Varianza Neta" value={fmtVar(stats.variance)} icon={<DollarSign className="h-4 w-4" />}
                  accent={Math.abs(stats.variance) > 100 ? "deduction" : "primary"} />
                <KpiCard label="Dups Suprimidos" value={fmt(stats.totalSuppressed)} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
              </div>

              {/* Comparison table */}
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Truth TOTAL</TableHead>
                      <TableHead className="text-right">Recon Hourly</TableHead>
                      <TableHead className="text-right">Recon Daily</TableHead>
                      <TableHead className="text-right">Recon Ride</TableHead>
                      <TableHead className="text-right">Recon Wknd</TableHead>
                      <TableHead className="text-right">Recon Adj</TableHead>
                      <TableHead className="text-right">Recon TOTAL</TableHead>
                      <TableHead className="text-right">Varianza</TableHead>
                      <TableHead className="text-center">Sched</TableHead>
                      <TableHead className="text-center">Clocks</TableHead>
                      <TableHead className="text-center">Dups</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map(c => {
                      const isExpanded = expandedRows.has(c.employee);
                      const r = c.recon;
                      const dupsCount = r ? r.ledger.filter(l => !l.included).length : 0;
                      return (
                        <>
                          <TableRow
                            key={c.employee}
                            className={`cursor-pointer ${
                              c.status === "mismatch" ? "bg-destructive/5" :
                              c.status === "missing" ? "bg-warning/10" :
                              c.status === "match" ? "bg-primary/5" : ""
                            }`}
                            onClick={() => toggleRow(c.employee)}
                          >
                            <TableCell className="w-8 px-2">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{c.employee}</TableCell>
                            <TableCell>{statusBadge(c.status)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">{fmt(c.truth.total)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r ? fmt(r.hourly_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.daily_pay > 0 ? fmt(r.daily_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.ride_pay > 0 ? fmt(r.ride_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.weekend_pay > 0 ? fmt(r.weekend_pay) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{r && r.manual_adj !== 0 ? fmt(r.manual_adj) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">{r ? fmt(r.total_final) : "—"}</TableCell>
                            <TableCell className={`text-right font-mono text-sm font-medium ${
                              Math.abs(c.totalVariance) > 50 ? "text-destructive" :
                              Math.abs(c.totalVariance) < 1 ? "text-primary" : "text-warning"
                            }`}>
                              {r ? fmtVar(c.totalVariance) : "N/A"}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">{r?.schedule_count ?? "—"}</TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">{r?.clock_count ?? "—"}</TableCell>
                            <TableCell className="text-center">
                              {dupsCount > 0 && <Badge variant="destructive" className="text-xs">{dupsCount}</Badge>}
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${c.employee}-detail`} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={14} className="p-3">
                                <div className="space-y-3 text-xs">
                                  {/* Variance explanation */}
                                  <div className="rounded bg-background border border-border p-2">
                                    <p className="font-medium text-foreground mb-1">Explicación de varianza:</p>
                                    <p className="text-muted-foreground">{explainVariance(c)}</p>
                                  </div>

                                  {/* Side-by-side breakdown */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="font-medium text-foreground mb-1">Truth breakdown:</p>
                                      <div className="space-y-0.5 text-muted-foreground font-mono">
                                        <p>Total Pay (hourly): {fmt(c.truth.totalPay)}</p>
                                        <p>PayperDay: {fmt(c.truth.payperDay)}</p>
                                        <p>Ryde: {fmt(c.truth.ryde)}</p>
                                        <p className="font-medium text-foreground">TOTAL: {fmt(c.truth.total)}</p>
                                        {c.truth.shiftHours > 0 && <p>Hours: {c.truth.shiftHours.toFixed(1)} @ ${c.truth.hourlyRate}/hr</p>}
                                      </div>
                                    </div>
                                    {r && (
                                      <div>
                                        <p className="font-medium text-foreground mb-1">Recon breakdown (deduped):</p>
                                        <div className="space-y-0.5 text-muted-foreground font-mono">
                                          <p>Hourly/Base: {fmt(r.hourly_pay)}</p>
                                          <p>Daily: {fmt(r.daily_pay)}</p>
                                          <p>Ride: {fmt(r.ride_pay)}</p>
                                          <p>Weekend/Double: {fmt(r.weekend_pay)}</p>
                                          <p>Manual Adj: {fmt(r.manual_adj)}</p>
                                          <p>Other: {fmt(r.other_pay)}</p>
                                          <p className="font-medium text-foreground">TOTAL (deduped): {fmt(r.total_final)}</p>
                                          {r.total_suppressed > 0 && (
                                            <p className="text-destructive">Raw total was: {fmt(r.total_raw + r.hourly_pay)} — suppressed: {fmt(r.total_suppressed)}</p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Source Ledger */}
                                  {r && r.ledger.length > 0 && (
                                    <div>
                                      <p className="font-medium text-foreground mb-1">Source Ledger ({r.ledger.length} entries, {r.ledger.filter(l => l.included).length} included):</p>
                                      <div className="overflow-auto max-h-48 border border-border rounded">
                                        <table className="w-full text-xs font-mono">
                                          <thead className="bg-muted/50 sticky top-0">
                                            <tr>
                                              <th className="p-1 text-left">Status</th>
                                              <th className="p-1 text-left">Concept</th>
                                              <th className="p-1 text-left">Category</th>
                                              <th className="p-1 text-right">Qty</th>
                                              <th className="p-1 text-right">Rate</th>
                                              <th className="p-1 text-right">Value</th>
                                              <th className="p-1 text-left">Reason</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {r.ledger.map((l, i) => (
                                              <tr key={i} className={l.included ? "" : "bg-destructive/5 line-through opacity-60"}>
                                                <td className="p-1">
                                                  {l.included
                                                    ? <span className="text-primary">✓</span>
                                                    : <span className="text-destructive">✗</span>
                                                  }
                                                </td>
                                                <td className="p-1 max-w-[200px] truncate">{l.concept}</td>
                                                <td className="p-1">{l.category}</td>
                                                <td className="p-1 text-right">{l.qty}</td>
                                                <td className="p-1 text-right">{fmt(l.rate)}</td>
                                                <td className="p-1 text-right">{fmt(l.value)}</td>
                                                <td className="p-1 max-w-[250px] truncate text-muted-foreground">{l.reason}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}

                                  {/* Counts */}
                                  {r && (
                                    <div className="flex gap-4 text-muted-foreground">
                                      <span>Schedules: {r.schedule_count}</span>
                                      <span>Clocks: {r.clock_count}</span>
                                      <span>Payroll rows: {r.payroll_row_count}</span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
