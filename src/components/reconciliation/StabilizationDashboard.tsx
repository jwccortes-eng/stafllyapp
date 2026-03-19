import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Shield, Bug, CheckCircle2, TrendingUp, BarChart3, AlertTriangle, RotateCcw,
} from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  periods: PeriodStatus[];
  companyId: string | null;
}

interface IssueSummary {
  total: number;
  open: number;
  critical_open: number;
  high_open: number;
  fixed: number;
  retested: number;
  accepted: number;
}

export default function StabilizationDashboard({ periods, companyId }: Props) {
  const [issueSummary, setIssueSummary] = useState<IssueSummary>({ total: 0, open: 0, critical_open: 0, high_open: 0, fixed: 0, retested: 0, accepted: 0 });

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("reconciliation_uat_issues" as any)
      .select("severity, status")
      .eq("company_id", companyId)
      .then(({ data }) => {
        const all = (data || []) as any[];
        setIssueSummary({
          total: all.length,
          open: all.filter(i => i.status === "open").length,
          critical_open: all.filter(i => i.status === "open" && i.severity === "critical").length,
          high_open: all.filter(i => i.status === "open" && i.severity === "high").length,
          fixed: all.filter(i => i.status === "fixed").length,
          retested: all.filter(i => i.status === "retested").length,
          accepted: all.filter(i => i.status === "accepted").length,
        });
      });
  }, [companyId]);

  const periodStats = useMemo(() => {
    const p = periods as any[];
    const completed = p.filter(pp => ["posted", "locked"].includes(pp.status));
    const clean = completed.filter(pp => pp.outcome_label === "closed_clean" || pp.outcome_label === "pilot_success");
    const reopened = completed.filter(pp => (pp.reopen_count || 0) > 0);
    const confidencePct = completed.length > 0 ? Math.round((clean.length / completed.length) * 100) : 0;

    let readiness: "not_stable" | "stabilizing" | "stable" | "production_ready" = "not_stable";
    if (completed.length >= 3 && confidencePct >= 80 && issueSummary.critical_open === 0) readiness = "production_ready";
    else if (completed.length >= 2 && confidencePct >= 60 && issueSummary.critical_open === 0) readiness = "stable";
    else if (completed.length >= 1) readiness = "stabilizing";

    return { completed: completed.length, clean: clean.length, reopened: reopened.length, confidencePct, readiness };
  }, [periods, issueSummary]);

  const readinessConfig = {
    not_stable: { label: "No Estable", color: "text-destructive", bg: "bg-destructive/5 border-destructive/30" },
    stabilizing: { label: "Estabilizando", color: "text-warning", bg: "bg-warning/5 border-warning/30" },
    stable: { label: "Estable", color: "text-primary", bg: "bg-primary/5 border-primary/30" },
    production_ready: { label: "Listo para Producción", color: "text-earning", bg: "bg-earning/5 border-earning/30" },
  };

  const rc = readinessConfig[periodStats.readiness];

  return (
    <div className="space-y-4">
      {/* Readiness banner */}
      <Alert className={rc.bg}>
        {periodStats.readiness === "production_ready" ? <CheckCircle2 className={`h-4 w-4 ${rc.color}`} /> : <AlertTriangle className={`h-4 w-4 ${rc.color}`} />}
        <AlertTitle className={rc.color}>Estabilización: {rc.label}</AlertTitle>
        <AlertDescription className={`text-xs ${rc.color}`}>
          {periodStats.readiness === "production_ready"
            ? "El sistema ha demostrado estabilidad operativa. Listo para uso semanal recurrente."
            : periodStats.readiness === "stable"
            ? "El sistema es estable. Se recomienda un cierre más limpio para confirmar."
            : periodStats.readiness === "stabilizing"
            ? "En fase de estabilización. Continúa ejecutando pilotos y resolviendo issues."
            : "No hay cierres completados. Ejecuta el primer piloto."}
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Period KPIs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Periodos Piloto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: "Completados", value: periodStats.completed },
                { label: "Limpios", value: periodStats.clean },
                { label: "Reabiertos", value: periodStats.reopened },
              ].map(k => (
                <div key={k.label} className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className="text-lg font-bold">{k.value}</div>
                  <div className="text-[10px] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Confianza</span>
                <span className="font-mono font-bold">{periodStats.confidencePct}%</span>
              </div>
              <Progress value={periodStats.confidencePct} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Issue KPIs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Bug className="h-4 w-4" /> Issues UAT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: "Abiertos", value: issueSummary.open, color: "text-destructive" },
                { label: "Críticos", value: issueSummary.critical_open, color: "text-destructive" },
                { label: "Re-testeados", value: issueSummary.retested, color: "text-earning" },
              ].map(k => (
                <div key={k.label} className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
                  <div className="text-[10px] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p>Total registrados: {issueSummary.total}</p>
              <p>Altos abiertos: {issueSummary.high_open}</p>
              <p>Corregidos: {issueSummary.fixed}</p>
              <p>Aceptados: {issueSummary.accepted}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Go-live criteria */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Criterios Go-Live</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "≥3 cierres", met: periodStats.completed >= 3 },
              { label: "≥80% confianza", met: periodStats.confidencePct >= 80 },
              { label: "0 críticos abiertos", met: issueSummary.critical_open === 0 },
              { label: "0 altos abiertos", met: issueSummary.high_open === 0 },
              { label: "Issues re-testeados", met: issueSummary.fixed === 0 || issueSummary.retested > 0 },
            ].map(c => (
              <Badge key={c.label} variant={c.met ? "default" : "outline"} className="text-[10px]">
                {c.met ? "✓" : "○"} {c.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
