import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  FileText, CheckCircle2, AlertTriangle, XCircle, TrendingUp,
  BarChart3, BookOpen, Shield, Rocket, Activity, Target,
} from "lucide-react";
import type { PeriodStatus, EmployeeFinalRecord, EmployeeVariance } from "@/hooks/useReconciliationPeriod";

interface Props {
  companyId: string | null;
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  employees: Map<string, string>;
  variances: EmployeeVariance[];
}

const fmt = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const READINESS_LEVELS = [
  { key: "ready_operational", label: "Listo para uso operacional", icon: Rocket, color: "text-primary", min: 90 },
  { key: "ready_monitored", label: "Listo con monitoreo controlado", icon: Activity, color: "text-yellow-600", min: 70 },
  { key: "not_ready", label: "Aún no está listo", icon: XCircle, color: "text-destructive", min: 0 },
] as const;

export default function PilotComparisonReport({ companyId, period, finalRecords, employees, variances }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [learnedRulesCount, setLearnedRulesCount] = useState<number | null>(null);

  // Load learned rules count
  useState(() => {
    if (!companyId) return;
    supabase.from("reconciliation_learned_rules" as any).select("id", { count: "exact", head: true }).eq("company_id", companyId)
      .then(({ count }) => setLearnedRulesCount(count || 0));
  });

  const stats = useMemo(() => {
    const total = variances.length;
    const exact = variances.filter(v => v.variance_status === "exact_match").length;
    const minor = variances.filter(v => v.variance_status === "minor_variance").length;
    const major = variances.filter(v => v.variance_status === "major_variance").length;
    const unresolved = variances.filter(v => v.variance_status === "unresolved").length;

    const sourceTotal = variances.reduce((s, v) => s + v.source_payroll_total, 0);
    const reconciledTotal = variances.reduce((s, v) => s + v.reconciled_total, 0);
    const publishedTotal = variances.reduce((s, v) => s + v.published_total, 0);
    const totalVariance = Math.round((reconciledTotal - sourceTotal) * 100) / 100;

    const manualCount = finalRecords.filter(r => (r.manual_adjustment_total || r.manual_amount || 0) > 0).length;

    // Payroll match percentage
    const matchPct = sourceTotal > 0 ? Math.max(0, 1 - Math.abs(totalVariance) / sourceTotal) : total > 0 ? 0 : 1;
    const empExactPct = total > 0 ? exact / total : 0;

    // Confidence
    const confidence = Math.round((matchPct * 40 + empExactPct * 30 + (major === 0 ? 15 : 0) + (unresolved === 0 ? 15 : 0)) * 100) / 100;

    // Readiness
    const readiness = confidence >= 90 ? READINESS_LEVELS[0]
      : confidence >= 70 ? READINESS_LEVELS[1]
      : READINESS_LEVELS[2];

    return {
      total, exact, minor, major, unresolved,
      sourceTotal, reconciledTotal, publishedTotal, totalVariance,
      manualCount, matchPct, empExactPct, confidence, readiness,
    };
  }, [variances, finalRecords]);

  const saveReport = useCallback(async () => {
    if (!companyId || !user?.id) return;
    setSaving(true);

    const reportData = {
      period_label: period.period_label,
      period_start: period.period_start,
      period_end: period.period_end,
      employee_details: variances.map(v => ({
        employee_id: v.employee_id,
        employee_name: v.employee_name,
        source_total: v.source_payroll_total,
        reconciled_total: v.reconciled_total,
        published_total: v.published_total,
        variance: v.variance_amount,
        variance_status: v.variance_status,
        reasons: v.variance_reasons,
      })),
      summary: {
        source_payroll: stats.sourceTotal,
        reconciled: stats.reconciledTotal,
        published: stats.publishedTotal,
        total_variance: stats.totalVariance,
      },
    };

    await supabase.from("reconciliation_pilot_reports" as any).insert({
      company_id: companyId,
      period_status_id: period.id,
      report_data: reportData,
      go_live_readiness: stats.readiness.key,
      payroll_match_pct: Math.round(stats.matchPct * 10000) / 100,
      employee_exact_match_pct: Math.round(stats.empExactPct * 10000) / 100,
      unresolved_critical: stats.major + stats.unresolved,
      unresolved_warnings: stats.minor,
      manual_intervention_count: stats.manualCount,
      learned_rules_created: learnedRulesCount || 0,
      publish_confidence: stats.confidence,
      recommendation: stats.readiness.label,
      created_by: user.id,
    } as any);

    toast({ title: "Reporte piloto guardado" });
    setSaving(false);
  }, [companyId, user?.id, period, variances, stats, learnedRulesCount, toast]);

  const ReadinessIcon = stats.readiness.icon;

  return (
    <div className="space-y-6">
      {/* Go-Live Readiness Banner */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className={`flex items-center gap-3 ${stats.readiness.color}`}>
                <ReadinessIcon className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">{stats.readiness.label}</h2>
                  <p className="text-sm text-muted-foreground">Recomendación Go-Live</p>
                </div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-primary">{stats.confidence}%</div>
              <div className="text-xs text-muted-foreground">Confianza de Publicación</div>
            </div>
          </div>
          <Progress value={stats.confidence} className="mt-4 h-3" />
        </CardContent>
      </Card>

      {/* Readiness Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Payroll Match", value: pct(stats.matchPct), icon: Target, good: stats.matchPct >= 0.95 },
          { label: "Empleados Exactos", value: pct(stats.empExactPct), icon: CheckCircle2, good: stats.empExactPct >= 0.8 },
          { label: "Críticos sin Resolver", value: String(stats.major + stats.unresolved), icon: XCircle, good: (stats.major + stats.unresolved) === 0 },
          { label: "Advertencias", value: String(stats.minor), icon: AlertTriangle, good: stats.minor <= 3 },
          { label: "Intervenciones Manuales", value: String(stats.manualCount), icon: Activity, good: true },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <item.icon className={`h-5 w-5 mx-auto mb-1 ${item.good ? "text-primary" : "text-destructive"}`} />
              <div className="text-xl font-bold">{item.value}</div>
              <div className="text-[10px] text-muted-foreground">{item.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Period Totals Comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Comparación de Totales del Periodo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Nómina Fuente</div>
              <div className="font-mono font-bold text-lg">{fmt(stats.sourceTotal)}</div>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Reconciliado</div>
              <div className="font-mono font-bold text-lg">{fmt(stats.reconciledTotal)}</div>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Publicado</div>
              <div className="font-mono font-bold text-lg">{fmt(stats.publishedTotal)}</div>
            </div>
            <div className={`p-3 rounded-lg ${Math.abs(stats.totalVariance) > 50 ? "bg-destructive/10" : "bg-primary/10"}`}>
              <div className="text-xs text-muted-foreground mb-1">Varianza Final</div>
              <div className={`font-mono font-bold text-lg ${Math.abs(stats.totalVariance) > 50 ? "text-destructive" : "text-primary"}`}>
                {stats.totalVariance >= 0 ? "+" : ""}{fmt(stats.totalVariance)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employee Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Detalle por Empleado ({variances.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Empleado</TableHead>
                  <TableHead className="text-[10px] text-right">Fuente $</TableHead>
                  <TableHead className="text-[10px] text-right">Reconciliado $</TableHead>
                  <TableHead className="text-[10px] text-right">Publicado $</TableHead>
                  <TableHead className="text-[10px] text-right">Varianza</TableHead>
                  <TableHead className="text-[10px] text-center">Estado</TableHead>
                  <TableHead className="text-[10px]">Razón</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variances.map(v => {
                  const statusBadge = v.variance_status === "exact_match" ? "default"
                    : v.variance_status === "minor_variance" ? "secondary" : "destructive";
                  const statusLabel = v.variance_status === "exact_match" ? "✓ Exacto"
                    : v.variance_status === "minor_variance" ? "~ Menor"
                    : v.variance_status === "major_variance" ? "✗ Mayor" : "? Pendiente";
                  return (
                    <TableRow key={v.employee_id}>
                      <TableCell className="text-xs font-medium">{v.employee_name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(v.source_payroll_total)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(v.reconciled_total)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(v.published_total)}</TableCell>
                      <TableCell className={`text-xs text-right font-mono font-bold ${Math.abs(v.variance_amount) > 10 ? "text-destructive" : "text-primary"}`}>
                        {v.variance_amount >= 0 ? "+" : ""}{fmt(v.variance_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={statusBadge as any} className="text-[10px]">{statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground">
                        {v.variance_reasons.slice(0, 2).join("; ") || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{stats.exact}</div>
            <div className="text-xs text-muted-foreground">Empleados Match Exacto</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{stats.major + stats.unresolved}</div>
            <div className="text-xs text-muted-foreground">Requieren Corrección</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{learnedRulesCount ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Reglas Aprendidas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{stats.manualCount}</div>
            <div className="text-xs text-muted-foreground">Intervenciones Manuales</div>
          </CardContent>
        </Card>
      </div>

      {/* Save Report */}
      <div className="flex justify-end gap-3">
        <Button onClick={saveReport} disabled={saving} className="gap-2">
          <Shield className="h-4 w-4" /> {saving ? "Guardando..." : "Guardar Reporte Piloto"}
        </Button>
      </div>
    </div>
  );
}
