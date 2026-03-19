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
  schedule_count: number;
  clock_count: number;
  payroll_row_count: number;
  movement_details: { concept: string; qty: number; rate: number; value: number }[];
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

  // Fetch detailed recon breakdown
  useEffect(() => {
    if (!companyId) return;

    (async () => {
      // 1. Employees
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("is_active", true);

      const empMap = new Map<string, string>();
      (employees || []).forEach((e: any) => {
        empMap.set(e.id, `${e.first_name} ${e.last_name}`);
      });

      // 2. Base pay from period_base_pay
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
            manual_adj: 0, other_pay: 0, total_final: 0,
            schedule_count: 0, clock_count: 0, payroll_row_count: 0,
            movement_details: [], flags: [],
          });
        }
        return breakdowns.get(empId)!;
      };

      // Populate base pay
      if (basePay) {
        for (const bp of basePay as any[]) {
          const row = getOrCreate(bp.employee_id);
          row.hourly_pay = bp.base_total_pay || 0;
          row.payroll_row_count = 1;
          if (bp.import_id) row.flags.push("imported_base");
        }
      }

      // 3. Movements with concept names - get ALL for this company
      const { data: movements } = await supabase
        .from("movements" as any)
        .select("employee_id, quantity, rate, total_value, note, concepts!inner(name)")
        .eq("company_id", companyId)
        .limit(1000);

      if (movements) {
        for (const m of movements as any[]) {
          const row = getOrCreate(m.employee_id);
          const conceptName = String(m.concepts?.name || "").toLowerCase();
          const val = m.total_value || 0;

          const detail = {
            concept: m.concepts?.name || "Unknown",
            qty: m.quantity || 0,
            rate: m.rate || 0,
            value: val,
          };
          row.movement_details.push(detail);

          if (conceptName.includes("daily")) {
            row.daily_pay += val;
          } else if (conceptName.includes("ride") || conceptName.includes("ryde")) {
            row.ride_pay += val;
          } else if (conceptName.includes("weekend") || conceptName.includes("doble") || conceptName.includes("double")) {
            row.weekend_pay += val;
          } else if (conceptName.includes("adjust") || conceptName.includes("manual") || conceptName.includes("correction")) {
            row.manual_adj += val;
          } else {
            row.other_pay += val;
          }
        }
      }

      // 4. Schedule counts (scheduled_shifts assigned to employee)
      const { data: schedules } = await supabase
        .from("shifts" as any)
        .select("employee_id")
        .eq("company_id", companyId)
        .limit(1000);

      if (schedules) {
        const schedCounts = new Map<string, number>();
        for (const s of schedules as any[]) {
          schedCounts.set(s.employee_id, (schedCounts.get(s.employee_id) || 0) + 1);
        }
        schedCounts.forEach((count, empId) => {
          const row = getOrCreate(empId);
          row.schedule_count = count;
        });
      }

      // 5. Clock counts (time_entries)
      const { data: clocks } = await supabase
        .from("time_entries" as any)
        .select("employee_id")
        .eq("company_id", companyId)
        .limit(1000);

      if (clocks) {
        const clockCounts = new Map<string, number>();
        for (const c of clocks as any[]) {
          clockCounts.set(c.employee_id, (clockCounts.get(c.employee_id) || 0) + 1);
        }
        clockCounts.forEach((count, empId) => {
          const row = getOrCreate(empId);
          row.clock_count = count;
        });
      }

      // Compute totals and detect flags
      breakdowns.forEach(row => {
        row.total_final = row.hourly_pay + row.daily_pay + row.ride_pay + row.weekend_pay + row.manual_adj + row.other_pay;

        // Duplicate detection: if movements have same concept+value appearing multiple times
        const seen = new Map<string, number>();
        for (const d of row.movement_details) {
          const key = `${d.concept}|${d.value}`;
          seen.set(key, (seen.get(key) || 0) + 1);
        }
        seen.forEach((count, key) => {
          if (count > 1) row.flags.push(`dup_movement: ${key} ×${count}`);
        });

        if (row.schedule_count === 0 && row.hourly_pay > 0) row.flags.push("no_schedules_but_has_base_pay");
        if (row.clock_count === 0 && row.hourly_pay > 0) row.flags.push("no_clocks_but_has_base_pay");
      });

      setReconData(Array.from(breakdowns.values()));
    })();
  }, [companyId, periodStatusId]);

  const comparison = useMemo<ComparisonRow[]>(() => {
    if (truthData.length === 0) return [];

    return truthData
      .map(t => {
        const recon = reconData.find(r => normalizeName(r.employee_name) === normalizeName(t.employee));

        if (!recon) {
          return { employee: t.employee, truth: t, recon: null, totalVariance: t.total, status: "missing" as const };
        }

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
    return { matched, close, mismatch, missing, totalTruth, totalRecon, variance: totalRecon - totalTruth };
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
    if (r.other_pay > 0) parts.push(`Other movements: ${fmt(r.other_pay)}`);
    if (r.flags.length > 0) parts.push(`Flags: ${r.flags.join(", ")}`);

    return parts.length > 0 ? parts.join(" | ") : "No significant component differences detected";
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
              <p className="text-sm text-muted-foreground">
                Carga el archivo de nómina pagada para comparar contra los resultados de reconciliación.
              </p>
              <Button onClick={loadTruthFile} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                Cargar Payroll Truth Set
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Debug panel */}
              <details className="text-xs rounded-md border border-border p-3 bg-muted/30">
                <summary className="cursor-pointer font-medium text-foreground">Debug parser (primeras 5 filas)</summary>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Sheet:</span> {truthParse?.sheetUsed ?? "N/A"}</p>
                  <p><span className="font-medium text-foreground">Detected columns:</span> {JSON.stringify(truthParse?.detectedColumns ?? {})}</p>
                  <p><span className="font-medium text-foreground">Raw columns:</span> {JSON.stringify(truthParse?.rawColumnNames ?? [])}</p>
                </div>
              </details>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <KpiCard label="Empleados (Truth)" value={truthData.length} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Exactos" value={stats.matched} icon={<CheckCircle2 className="h-4 w-4" />} accent="primary" />
                <KpiCard label="Cercanos" value={stats.close} icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
                <KpiCard label="Diferentes" value={stats.mismatch} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
                <KpiCard label="No encontrados" value={stats.missing} icon={<AlertTriangle className="h-4 w-4" />} accent="muted" />
                <KpiCard label="Total Truth" value={fmt(stats.totalTruth)} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Varianza Neta" value={fmtVar(stats.variance)} icon={<DollarSign className="h-4 w-4" />}
                  accent={Math.abs(stats.variance) > 100 ? "deduction" : "primary"} />
              </div>

              {/* Comparison table with expandable breakdown */}
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
                      <TableHead className="text-center">Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map(c => {
                      const isExpanded = expandedRows.has(c.employee);
                      const r = c.recon;
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
                              {r && r.flags.length > 0 && (
                                <Badge variant="outline" className="text-xs">{r.flags.length}</Badge>
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <TableRow key={`${c.employee}-detail`} className="bg-muted/20">
                              <TableCell colSpan={14} className="p-3">
                                <div className="space-y-2 text-xs">
                                  {/* Variance explanation */}
                                  <div className="rounded bg-background border border-border p-2">
                                    <p className="font-medium text-foreground mb-1">Explicación de varianza:</p>
                                    <p className="text-muted-foreground">{explainVariance(c)}</p>
                                  </div>

                                  {/* Truth breakdown */}
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
                                        <p className="font-medium text-foreground mb-1">Recon breakdown:</p>
                                        <div className="space-y-0.5 text-muted-foreground font-mono">
                                          <p>Hourly/Base: {fmt(r.hourly_pay)}</p>
                                          <p>Daily: {fmt(r.daily_pay)}</p>
                                          <p>Ride: {fmt(r.ride_pay)}</p>
                                          <p>Weekend/Double: {fmt(r.weekend_pay)}</p>
                                          <p>Manual Adj: {fmt(r.manual_adj)}</p>
                                          <p>Other: {fmt(r.other_pay)}</p>
                                          <p className="font-medium text-foreground">TOTAL: {fmt(r.total_final)}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Movement details */}
                                  {r && r.movement_details.length > 0 && (
                                    <div>
                                      <p className="font-medium text-foreground mb-1">Movements ({r.movement_details.length}):</p>
                                      <div className="grid gap-0.5 font-mono text-muted-foreground">
                                        {r.movement_details.map((m, i) => (
                                          <p key={i}>{m.concept}: {m.qty} × ${m.rate} = {fmt(m.value)}</p>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Flags */}
                                  {r && r.flags.length > 0 && (
                                    <div>
                                      <p className="font-medium text-foreground mb-1">Flags:</p>
                                      <div className="flex flex-wrap gap-1">
                                        {r.flags.map((f, i) => (
                                          <Badge key={i} variant="outline" className="text-xs font-mono">{f}</Badge>
                                        ))}
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
