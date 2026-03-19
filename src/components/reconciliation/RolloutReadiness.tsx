import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, TrendingUp, AlertTriangle, Rocket, BarChart3 } from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  periods: PeriodStatus[];
}

export default function RolloutReadiness({ periods }: Props) {
  const stats = useMemo(() => {
    const p = periods as any[];
    const closed = p.filter(pp => ["posted", "locked"].includes(pp.status));
    const clean = closed.filter(pp => pp.outcome_label === "closed_clean" || pp.outcome_label === "pilot_success");
    const warnings = closed.filter(pp => pp.outcome_label === "closed_with_warnings");
    const reopened = closed.filter(pp => (pp.reopen_count || 0) > 0);
    const needsReview = closed.filter(pp => pp.outcome_label === "pilot_needs_review");

    // Confidence trend — simple: clean closes / total closes * 100
    const confidencePct = closed.length > 0 ? Math.round((clean.length / closed.length) * 100) : 0;

    // Readiness determination
    let readiness: "not_ready" | "early" | "approaching" | "ready" = "not_ready";
    if (closed.length >= 3 && confidencePct >= 80 && needsReview.length === 0) readiness = "ready";
    else if (closed.length >= 2 && confidencePct >= 60) readiness = "approaching";
    else if (closed.length >= 1) readiness = "early";

    return {
      totalPeriods: p.length,
      closedPeriods: closed.length,
      cleanCloses: clean.length,
      warningCloses: warnings.length,
      reopenedCloses: reopened.length,
      needsReview: needsReview.length,
      confidencePct,
      readiness,
    };
  }, [periods]);

  const readinessConfig = {
    not_ready: { label: "No Listo", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-300" },
    early: { label: "Fase Temprana", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-300" },
    approaching: { label: "Acercándose", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-300" },
    ready: { label: "Listo para Producción", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20", border: "border-green-300" },
  };

  const rc = readinessConfig[stats.readiness];

  return (
    <div className="space-y-6">
      {/* Readiness Banner */}
      <Alert className={`${rc.border} ${rc.bg}`}>
        {stats.readiness === "ready" ? <CheckCircle2 className={`h-4 w-4 ${rc.color}`} /> : stats.readiness === "not_ready" ? <AlertTriangle className={`h-4 w-4 ${rc.color}`} /> : <Rocket className={`h-4 w-4 ${rc.color}`} />}
        <AlertTitle className={rc.color}>Estado de Rollout: {rc.label}</AlertTitle>
        <AlertDescription className={`${rc.color} text-xs`}>
          {stats.readiness === "ready"
            ? "El sistema ha demostrado consistencia operativa. Listo para uso semanal recurrente."
            : stats.readiness === "approaching"
            ? "Progreso positivo. Se recomienda completar al menos un cierre limpio más."
            : stats.readiness === "early"
            ? "Fase temprana del piloto. Continúa ejecutando cierres controlados."
            : "No hay cierres completados. Ejecuta el primer piloto semanal."}
        </AlertDescription>
      </Alert>

      {/* KPIs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Resumen de Rollout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Periodos Cerrados", value: stats.closedPeriods, total: stats.totalPeriods },
              { label: "Cierres Limpios", value: stats.cleanCloses },
              { label: "Con Advertencias", value: stats.warningCloses },
              { label: "Reabiertos", value: stats.reopenedCloses },
              { label: "Requieren Revisión", value: stats.needsReview },
            ].map(item => (
              <div key={item.label} className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-xl font-bold">
                  {item.value}
                  {(item as any).total != null && <span className="text-sm text-muted-foreground font-normal">/{(item as any).total}</span>}
                </div>
                <div className="text-[10px] text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Confidence bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground"><TrendingUp className="h-3 w-3" /> Confianza Operativa</span>
              <span className="font-mono font-bold">{stats.confidencePct}%</span>
            </div>
            <Progress value={stats.confidencePct} className="h-2" />
          </div>

          {/* Criteria */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p className="font-medium text-foreground mb-1">Criterios para "Listo para Producción":</p>
            <div className="flex items-center gap-2">
              <Badge variant={stats.closedPeriods >= 3 ? "default" : "outline"} className="text-[10px]">
                {stats.closedPeriods >= 3 ? "✓" : "○"} ≥3 cierres completados
              </Badge>
              <Badge variant={stats.confidencePct >= 80 ? "default" : "outline"} className="text-[10px]">
                {stats.confidencePct >= 80 ? "✓" : "○"} ≥80% confianza
              </Badge>
              <Badge variant={stats.needsReview === 0 ? "default" : "outline"} className="text-[10px]">
                {stats.needsReview === 0 ? "✓" : "○"} 0 pendientes de revisión
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
