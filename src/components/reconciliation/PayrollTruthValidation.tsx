import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { DollarSign, CheckCircle2, AlertTriangle, Upload, Loader2 } from "lucide-react";
import { read, utils } from "xlsx";

interface PayrollTruthRow {
  employee: string;
  firstName: string;
  lastName: string;
  totalPay: number;
  hourlyRate: number | null;
  payperDay: number;
  ryde: number;
  total: number;
  shiftHours: number;
}

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
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function PayrollTruthValidation({ companyId, periodStatusId }: Props) {
  const [truthData, setTruthData] = useState<PayrollTruthRow[]>([]);
  const [reconData, setReconData] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [truthLoaded, setTruthLoaded] = useState(false);

  // Load truth file from public
  const loadTruthFile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/temp-import/payroll_truth_2025-12-24_to_2025-12-30.xlsx");
      const buf = await res.arrayBuffer();
      const wb = read(buf, { type: "array" });
      const sheet = wb.Sheets["PAYROLL"] || wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = utils.sheet_to_json(sheet);

      // Aggregate per employee (use MAX for TOTAL since it's already per-employee)
      const byEmp = new Map<string, PayrollTruthRow>();
      for (const r of rows) {
        const fn = String(r["First name"] || "").trim();
        const ln = String(r["Last name"] || "").trim();
        const key = normalizeName(`${fn} ${ln}`);
        if (!key) continue;

        const existing = byEmp.get(key);
        const totalPay = parseFloat(r["Total pay"]) || 0;
        const hourlyRate = r["Hourly rate (USD)"] != null ? parseFloat(r["Hourly rate (USD)"]) : null;
        const payperDay = parseFloat(r["Payper Day"]) || 0;
        const ryde = parseFloat(r["Ryde"]) || 0;
        const total = parseFloat(r["TOTAL"]) || 0;
        const shiftHours = parseFloat(r["Shift hours"]) || 0;

        if (existing) {
          existing.totalPay += totalPay;
          existing.payperDay += payperDay;
          existing.ryde += ryde;
          existing.total = Math.max(existing.total, total); // TOTAL is per-employee max
          existing.shiftHours += shiftHours;
          if (hourlyRate != null && existing.hourlyRate == null) existing.hourlyRate = hourlyRate;
        } else {
          byEmp.set(key, {
            employee: `${fn} ${ln}`,
            firstName: fn,
            lastName: ln,
            totalPay,
            hourlyRate,
            payperDay,
            ryde,
            total,
            shiftHours,
          });
        }
      }

      setTruthData(Array.from(byEmp.values()));
      setTruthLoaded(true);
    } catch (err: any) {
      console.error("Error loading truth file:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load reconciliation data from DB
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      // Try to get from period_base_pay + movements
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

      // Build recon rows from base pay
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

      // Augment with movements (daily, ride)
      const { data: movements } = await supabase
        .from("movements" as any)
        .select("*, concepts!inner(name)")
        .eq("company_id", companyId)
        .limit(1000);

      if (movements) {
        for (const m of movements as any[]) {
          const row = reconRows.find(r => r.employee_id === m.employee_id);
          const conceptName = (m.concepts?.name || "").toLowerCase();
          if (row) {
            if (conceptName.includes("daily")) {
              row.daily_pay += m.total_value || 0;
              row.total_final += m.total_value || 0;
            } else if (conceptName.includes("ride")) {
              row.ride_pay += m.total_value || 0;
              row.total_final += m.total_value || 0;
            }
          }
        }
      }

      setReconData(reconRows);
    })();
  }, [companyId]);

  // Compare
  const comparison = useMemo<ComparisonRow[]>(() => {
    if (truthData.length === 0) return [];

    return truthData.map(t => {
      const tName = normalizeName(t.employee);
      const recon = reconData.find(r => normalizeName(r.employee_name) === tName);

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

      const payVar = recon.total_pay - t.totalPay;
      const dailyVar = recon.daily_pay - t.payperDay;
      const rideVar = recon.ride_pay - t.ryde;
      const totalVar = recon.total_final - t.total;
      const absTotal = Math.abs(totalVar);

      return {
        employee: t.employee,
        truth: t,
        recon,
        payVariance: payVar,
        dailyVariance: dailyVar,
        rideVariance: rideVar,
        totalVariance: totalVar,
        status: absTotal < 1 ? "match" : absTotal < 50 ? "close" : "mismatch",
      };
    }).sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));
  }, [truthData, reconData]);

  const stats = useMemo(() => {
    const matched = comparison.filter(c => c.status === "match").length;
    const close = comparison.filter(c => c.status === "close").length;
    const mismatch = comparison.filter(c => c.status === "mismatch").length;
    const missing = comparison.filter(c => c.status === "missing").length;
    const totalTruth = truthData.reduce((s, t) => s + t.total, 0);
    const totalRecon = comparison.reduce((s, c) => s + (c.recon?.total_final || 0), 0);
    return { matched, close, mismatch, missing, totalTruth, totalRecon, variance: totalRecon - totalTruth };
  }, [comparison, truthData]);

  const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtVar = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v)}`;

  const statusBadge = (s: string) => {
    switch (s) {
      case "match": return <Badge variant="default" className="text-xs">✓ Exacto</Badge>;
      case "close": return <Badge variant="secondary" className="text-xs">≈ Cercano</Badge>;
      case "mismatch": return <Badge variant="destructive" className="text-xs">✗ Diferente</Badge>;
      case "missing": return <Badge variant="outline" className="text-xs">? No encontrado</Badge>;
      default: return null;
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
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <KpiCard label="Empleados (Truth)" value={truthData.length} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Exactos" value={stats.matched} icon={<CheckCircle2 className="h-4 w-4" />} accent="primary" />
                <KpiCard label="Cercanos" value={stats.close} icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
                <KpiCard label="Diferentes" value={stats.mismatch} icon={<AlertTriangle className="h-4 w-4" />} accent="deduction" />
                <KpiCard label="No encontrados" value={stats.missing} icon={<AlertTriangle className="h-4 w-4" />} accent="muted" />
                <KpiCard label="Total Truth" value={fmt(stats.totalTruth)} icon={<DollarSign className="h-4 w-4" />} />
                <KpiCard label="Varianza Neta" value={fmtVar(stats.variance)} icon={<DollarSign className="h-4 w-4" />} accent={Math.abs(stats.variance) > 100 ? "deduction" : "primary"} />
              </div>

              {/* Table */}
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
                          c.status === "mismatch" ? "bg-destructive/5" :
                          c.status === "missing" ? "bg-amber-500/5" :
                          c.status === "match" ? "bg-primary/5" : ""
                        }
                      >
                        <TableCell className="font-medium text-sm">{c.employee}</TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(c.truth.totalPay)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.truth.payperDay > 0 ? fmt(c.truth.payperDay) : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.truth.ryde > 0 ? fmt(c.truth.ryde) : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">{fmt(c.truth.total)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {c.recon ? fmt(c.recon.total_final) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${Math.abs(c.totalVariance) > 50 ? "text-destructive" : Math.abs(c.totalVariance) < 1 ? "text-primary" : "text-amber-600"}`}>
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
