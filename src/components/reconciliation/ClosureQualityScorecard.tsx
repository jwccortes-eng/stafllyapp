import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { TrendingUp, ShieldCheck, AlertTriangle, Brain, CheckCircle2, FileText, Zap } from "lucide-react";
import type { EmployeeFinalRecord, EmployeeVariance, PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  finalRecords: EmployeeFinalRecord[];
  variances: EmployeeVariance[];
  period: PeriodStatus;
  previousClosureStats?: {
    autoApproved: number;
    truthValidated: number;
    manualReview: number;
  } | null;
}

/**
 * Closure Quality Scorecard: tracks improvement metrics per close.
 * Shows how much of the close is automated vs manual, and whether
 * the system is getting smarter over time.
 */
export default function ClosureQualityScorecard({ finalRecords, variances, period, previousClosureStats }: Props) {
  const stats = useMemo(() => {
    const total = finalRecords.length;
    const varianceMap = new Map(variances.map(v => [v.employee_id, v]));

    let autoApproved = 0;
    let truthValidated = 0;
    let manualReview = 0;
    let anomalousClocks = 0;
    let knownPatternResolved = 0;
    let systemInferredOnly = 0;

    for (const r of finalRecords) {
      const v = varianceMap.get(r.employee_id);
      const hasEvidence = ((r.scheduled_shifts || []).length + (r.worked_shifts || []).length + (r.payroll_rows || []).length) > 0;
      const isApproved = ["approved", "resolved", "posted"].includes(r.reconciliation_status);
      const isTruthSource = r.shift_calculation_source === "truth_validation";

      if (isApproved && hasEvidence) autoApproved++;
      else if (isApproved && isTruthSource) truthValidated++;
      else if (!isApproved) manualReview++;

      if (!hasEvidence && (r.grand_total || 0) > 0) systemInferredOnly++;
      if (r.warnings?.some((w: string) => w.includes("anomal") || w.includes("excede"))) anomalousClocks++;
    }

    const confidencePct = total > 0 ? Math.round(((autoApproved + truthValidated) / total) * 100) : 0;

    // Improvement over previous close
    let improvement: number | null = null;
    if (previousClosureStats) {
      const prevConfidence = (previousClosureStats.autoApproved + previousClosureStats.truthValidated) /
        (previousClosureStats.autoApproved + previousClosureStats.truthValidated + previousClosureStats.manualReview) * 100;
      improvement = confidencePct - prevConfidence;
    }

    return {
      total, autoApproved, truthValidated, manualReview,
      anomalousClocks, knownPatternResolved, systemInferredOnly,
      confidencePct, improvement,
    };
  }, [finalRecords, variances, previousClosureStats]);

  const confidenceColor = stats.confidencePct >= 90 ? "text-primary" : stats.confidencePct >= 70 ? "text-warning" : "text-destructive";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4" /> Calidad de Cierre
          <Badge variant="outline" className="text-[10px] ml-auto">
            {period.period_start} → {period.period_end}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Confidence meter */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Confianza de cierre</span>
              <span className={`text-lg font-bold font-mono tabular-nums ${confidenceColor}`}>
                {stats.confidencePct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${stats.confidencePct >= 90 ? "bg-primary" : stats.confidencePct >= 70 ? "bg-warning" : "bg-destructive"}`}
                style={{ width: `${stats.confidencePct}%` }}
              />
            </div>
          </div>
          {stats.improvement !== null && (
            <div className={`text-xs font-mono ${stats.improvement >= 0 ? "text-primary" : "text-destructive"}`}>
              <TrendingUp className="h-3 w-3 inline mr-0.5" />
              {stats.improvement >= 0 ? "+" : ""}{stats.improvement.toFixed(0)}% vs anterior
            </div>
          )}
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-lg border p-2 text-center">
            <CheckCircle2 className="h-3.5 w-3.5 mx-auto text-primary mb-0.5" />
            <div className="text-lg font-bold font-mono">{stats.autoApproved}</div>
            <div className="text-[10px] text-muted-foreground">Auto-aprobados</div>
          </div>
          <div className="rounded-lg border p-2 text-center">
            <FileText className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
            <div className="text-lg font-bold font-mono">{stats.truthValidated}</div>
            <div className="text-[10px] text-muted-foreground">Truth-validados</div>
          </div>
          <div className="rounded-lg border p-2 text-center">
            <AlertTriangle className="h-3.5 w-3.5 mx-auto text-warning mb-0.5" />
            <div className="text-lg font-bold font-mono">{stats.manualReview}</div>
            <div className="text-[10px] text-muted-foreground">Revisión manual</div>
          </div>
          <div className="rounded-lg border p-2 text-center">
            <Zap className="h-3.5 w-3.5 mx-auto text-destructive mb-0.5" />
            <div className="text-lg font-bold font-mono">{stats.anomalousClocks}</div>
            <div className="text-[10px] text-muted-foreground">Fichajes anómalos</div>
          </div>
        </div>

        {/* Learning indicators */}
        <div className="mt-3 p-2 rounded-md bg-muted/30 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Reglas de negocio activas
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[9px]">⛔ Scheduled ≠ Pay</Badge>
            <Badge variant="outline" className="text-[9px]">🔒 Truth-authoritative mode</Badge>
            <Badge variant="outline" className="text-[9px]">🚫 Clock &gt;16h suppressed</Badge>
            <Badge variant="outline" className="text-[9px]">📊 3x schedule deviation flag</Badge>
            {stats.systemInferredOnly > 0 && (
              <Badge variant="warning" className="text-[9px]">{stats.systemInferredOnly} sistema-inferido sin evidencia</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
