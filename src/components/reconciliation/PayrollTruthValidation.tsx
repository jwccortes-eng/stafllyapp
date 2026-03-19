import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { DollarSign, CheckCircle2, AlertTriangle, Upload, Loader2 } from "lucide-react";
import {
  parsePayrollTruthWorkbook,
  type PayrollTruthParseResult,
  type PayrollTruthRow,
} from "@/lib/payroll-truth-parser";

interface ReconciliationRow {
  employee_id: string;
  employee_name: string;
  total_pay: number;
  daily_pay: number;
  ride_pay: number;
  total_final: number;
}

interface ComparisonRow {
  employee: string;
  truth: PayrollTruthRow;
  recon: ReconciliationRow | null;
  payVariance: number;
  dailyVariance: number;
  rideVariance: number;
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
  const [reconData, setReconData] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [truthLoaded, setTruthLoaded] = useState(false);

  const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtVar = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v)}`;

  const loadTruthFile = async () => {
    setLoading(true);
    setTruthLoaded(false);
    setTruthData([]);
    setTruthParse(null);

    try {
      const cacheBuster = Date.now();
      const res = await fetch(`/temp-import/payroll_truth_2025-12-24_to_2025-12-30.xlsx?v=${cacheBuster}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`No se pudo cargar el archivo (${res.status})`);

      const buf = await res.arrayBuffer();
      const parsed = parsePayrollTruthWorkbook(buf);

      setTruthParse(parsed);
      setTruthData(parsed.rows);
      setTruthLoaded(true);
    } catch (err: any) {
      console.error("Error loading truth file:", err);
      setTruthParse(null);
      setTruthLoaded(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;

    (async () => {
      const { data: basePay } = await supabase
        .from("period_base_pay" as any)
        .select("*")
        .eq("company_id", companyId)
        .limit(500);

      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("is_active", true);

      const empMap = new Map<string, { name: string; id: string }>();
      (employees || []).forEach((e: any) => {
        empMap.set(e.id, { name: `${e.first_name} ${e.last_name}`, id: e.id });
      });

      const reconRows: ReconciliationRow[] = [];
      if (basePay && basePay.length > 0) {
        for (const bp of basePay as any[]) {
          const emp = empMap.get(bp.employee_id);
          reconRows.push({
            employee_id: bp.employee_id,
            employee_name: emp?.name || bp.employee_id,
            total_pay: bp.base_total_pay || 0,
            daily_pay: 0,
            ride_pay: 0,
            total_final: bp.base_total_pay || 0,
          });
        }
      }

      const { data: movements } = await supabase
        .from("movements" as any)
        .select("*, concepts!inner(name)")
        .eq("company_id", companyId)
        .limit(1000);

      if (movements) {
        for (const m of movements as any[]) {
          const row = reconRows.find(r => r.employee_id === m.employee_id);
          const conceptName = String(m.concepts?.name || "").toLowerCase();
          if (!row) continue;

          if (conceptName.includes("daily")) {
            row.daily_pay += m.total_value || 0;
            row.total_final += m.total_value || 0;
          } else if (conceptName.includes("ride")) {
            row.ride_pay += m.total_value || 0;
            row.total_final += m.total_value || 0;
          }
        }
      }

      setReconData(reconRows);
    })();
  }, [companyId, periodStatusId]);

  const comparison = useMemo<ComparisonRow[]>(() => {
    if (truthData.length === 0) return [];

    return truthData
      .map(t => {
        const recon = reconData.find(r => normalizeName(r.employee_name) === normalizeName(t.employee));

        if (!recon) {
          return {
            employee: t.employee,
            truth: t,
            recon: null,
            payVariance: t.totalPay,
            dailyVariance: t.payperDay,
            rideVariance: t.ryde,
            totalVariance: t.total,
            status: "missing" as const,
          };
        }

        const payVariance = recon.total_pay - t.totalPay;
        const dailyVariance = recon.daily_pay - t.payperDay;
        const rideVariance = recon.ride_pay - t.ryde;
        const totalVariance = recon.total_final - t.total;
        const absTotal = Math.abs(totalVariance);

        return {
          employee: t.employee,
          truth: t,
          recon,
          payVariance,
          dailyVariance,
          rideVariance,
          totalVariance,
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

    return {
      matched,
      close,
      mismatch,
      missing,
      totalTruth,
      totalRecon,
      variance: totalRecon - totalTruth,
    };
  }, [comparison, truthData]);

  const e2eDebugRows = useMemo(() => {
    if (!truthParse) return [];

    return truthParse.debugRows.slice(0, 5).map(d => {
      const storedTruth = truthData.find(t => normalizeName(t.employee) === normalizeName(d.employee));
      const tableRow = comparison.find(c => normalizeName(c.employee) === normalizeName(d.employee));

      const storedTotal = storedTruth?.total ?? 0;
      const renderedTotal = fmt(storedTotal);

      return {
        rowNumber: d.rowNumber,
        employee: d.employee,
        rawTotal: d.rawTotal,
        parsedTotal: d.parsedTotal,
        storedComparisonTotal: storedTotal,
        renderedTableTotal: renderedTotal,
        comparisonTruthTotal: tableRow?.truth.total ?? 0,
      };
    });
  }, [truthParse, truthData, comparison]);

  const statusBadge = (s: ComparisonRow["status"]) => {
    switch (s) {
      case "match":
        return <Badge variant="default" className="text-xs">✓ Exacto</Badge>;
      case "close":
        return <Badge variant="secondary" className="text-xs">≈ Cercano</Badge>;
      case "mismatch":
        return <Badge variant="destructive" className="text-xs">✗ Diferente</Badge>;
      case "missing":
        return <Badge variant="outline" className="text-xs">? No encontrado</Badge>;
      default:
        return null;
    }
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
              <details className="text-xs rounded-md border border-border p-3 bg-muted/30">
                <summary className="cursor-pointer font-medium text-foreground">Debug parser + flujo end-to-end (primeras 5 filas)</summary>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Sheet usada:</span> {truthParse?.sheetUsed ?? "N/A"}</p>
                  <p><span className="font-medium text-foreground">Reparse:</span> {truthParse?.parsedAt ?? "N/A"} (cache bust + no-store)</p>
                  <p><span className="font-medium text-foreground">Primary comparison field:</span> {truthParse?.primaryComparisonField ?? "N/A"}</p>
                  <p><span className="font-medium text-foreground">UI field mapping:</span> Truth Total Pay = <code>comparison[i].truth.totalPay</code>, Truth TOTAL = <code>comparison[i].truth.total</code>, Total Truth KPI = <code>sum(truthData.total)</code>.</p>
                  <p><span className="font-medium text-foreground">Detected columns:</span> {JSON.stringify(truthParse?.detectedColumns ?? {}, null, 2)}</p>
                  <p><span className="font-medium text-foreground">Raw column names:</span> {JSON.stringify(truthParse?.rawColumnNames ?? [])}</p>
                  <p><span className="font-medium text-foreground">E2E sample rows:</span></p>
                  <pre className="rounded bg-background p-2 overflow-auto max-h-64 whitespace-pre-wrap text-foreground">{JSON.stringify(e2eDebugRows, null, 2)}</pre>
                </div>
              </details>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <KpiCard label="Empleados (Truth)" value={truthData.length} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Exactos" value={stats.matched} icon={<CheckCircle2 className="h-4 w-4" />} accent="primary" />
                <KpiCard label="Cercanos" value={stats.close} icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
                <KpiCard label="Diferentes" value={stats.mismatch} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
                <KpiCard label="No encontrados" value={stats.missing} icon={<AlertTriangle className="h-4 w-4" />} accent="muted" />
                <KpiCard label="Total Truth" value={fmt(stats.totalTruth)} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard
                  label="Varianza Neta"
                  value={fmtVar(stats.variance)}
                  icon={<DollarSign className="h-4 w-4" />}
                  accent={Math.abs(stats.variance) > 100 ? "deduction" : "primary"}
                />
              </div>

              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Truth Total Pay</TableHead>
                      <TableHead className="text-right">Truth PayperDay</TableHead>
                      <TableHead className="text-right">Truth Ryde</TableHead>
                      <TableHead className="text-right">Truth TOTAL</TableHead>
                      <TableHead className="text-right">Recon Total</TableHead>
                      <TableHead className="text-right">Varianza</TableHead>
                      <TableHead className="text-right">Hrs (Truth)</TableHead>
                      <TableHead className="text-right">Rate (Truth)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map(c => (
                      <TableRow
                        key={c.employee}
                        className={
                          c.status === "mismatch"
                            ? "bg-destructive/5"
                            : c.status === "missing"
                              ? "bg-warning/10"
                              : c.status === "match"
                                ? "bg-primary/5"
                                : ""
                        }
                      >
                        <TableCell className="font-medium text-sm">{c.employee}</TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(c.truth.totalPay)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.truth.payperDay > 0 ? fmt(c.truth.payperDay) : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.truth.ryde > 0 ? fmt(c.truth.ryde) : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">{fmt(c.truth.total)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.recon ? fmt(c.recon.total_final) : "—"}</TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm font-medium ${
                            Math.abs(c.totalVariance) > 50
                              ? "text-destructive"
                              : Math.abs(c.totalVariance) < 1
                                ? "text-primary"
                                : "text-warning"
                          }`}
                        >
                          {c.recon ? fmtVar(c.totalVariance) : "N/A"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {c.truth.shiftHours > 0 ? c.truth.shiftHours.toFixed(1) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {c.truth.hourlyRate != null ? `$${c.truth.hourlyRate}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
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
