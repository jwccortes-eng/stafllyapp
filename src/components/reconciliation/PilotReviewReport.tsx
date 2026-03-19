import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2, AlertTriangle, FileText, Users, TrendingUp,
  Bug, Settings2, Clock, Shield,
} from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  companyId: string | null;
  period: PeriodStatus;
  finalRecords: any[];
  employees: Map<string, string>;
  variances: any[];
}

interface UATIssue {
  id: string;
  severity: string;
  status: string;
  category: string;
}

export default function PilotReviewReport({ companyId, period, finalRecords, employees, variances }: Props) {
  const [issues, setIssues] = useState<UATIssue[]>([]);
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("medium");

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("reconciliation_uat_issues" as any)
      .select("id, severity, status, category")
      .eq("company_id", companyId)
      .eq("period_status_id", period.id)
      .then(({ data }) => setIssues((data || []) as any[]));
  }, [companyId, period.id]);

  const stats = useMemo(() => {
    const total = finalRecords.length;
    const approved = finalRecords.filter((r: any) => r.reconciliation_status === "approved").length;
    const exactMatch = finalRecords.filter((r: any) => Math.abs((r.source_total || 0) - (r.reconciled_total || 0)) < 0.01).length;
    const majorVar = variances.filter((v: any) => Math.abs(v.variance || 0) > 50).length;
    const manualInterventions = finalRecords.filter((r: any) => r.pay_classification === "manual_adjustment").length;

    const openIssues = issues.filter(i => i.status === "open").length;
    const criticalOpen = issues.filter(i => i.status === "open" && i.severity === "critical").length;
    const fixedIssues = issues.filter(i => i.status === "fixed" || i.status === "retested" || i.status === "accepted").length;

    const isPosted = ["posted", "locked"].includes(period.status);
    const matchPct = total > 0 ? Math.round((exactMatch / total) * 100) : 0;

    return {
      total, approved, exactMatch, majorVar, manualInterventions,
      openIssues, criticalOpen, fixedIssues,
      isPosted, matchPct,
      closeSucceeded: isPosted && criticalOpen === 0,
    };
  }, [finalRecords, variances, issues, period.status]);

  // Recommendation
  const recommendation = useMemo(() => {
    if (stats.criticalOpen > 0) return { text: "Resolver issues críticos antes de continuar con próximo piloto.", level: "destructive" as const };
    if (stats.openIssues > 2) return { text: "Resolver issues abiertos antes de pasar a producción.", level: "warning" as const };
    if (stats.matchPct >= 90 && stats.closeSucceeded) return { text: "Listo para uso en producción recurrente.", level: "success" as const };
    if (stats.matchPct >= 75) return { text: "Continuar con siguiente periodo piloto para confirmar estabilidad.", level: "info" as const };
    return { text: "Requiere más pilotos y ajustes antes de producción.", level: "warning" as const };
  }, [stats]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" /> Reporte de Revisión Piloto — {period.period_label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Outcome */}
          <Alert className={
            recommendation.level === "success" ? "border-earning bg-earning/5" :
            recommendation.level === "destructive" ? "border-destructive bg-destructive/5" :
            "border-warning bg-warning/5"
          }>
            {recommendation.level === "success" ? <CheckCircle2 className="h-4 w-4 text-earning" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
            <AlertTitle className="text-sm">Recomendación</AlertTitle>
            <AlertDescription className="text-xs">{recommendation.text}</AlertDescription>
          </Alert>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Cierre exitoso", value: stats.closeSucceeded ? "Sí ✓" : "No", icon: Shield },
              { label: "Match exacto", value: `${stats.matchPct}%`, icon: TrendingUp },
              { label: "Issues abiertos", value: stats.openIssues, icon: Bug },
              { label: "Intervenciones manuales", value: stats.manualInterventions, icon: Settings2 },
            ].map(kpi => (
              <div key={kpi.label} className="p-3 bg-muted/30 rounded-lg text-center">
                <kpi.icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-lg font-bold">{kpi.value}</div>
                <div className="text-[10px] text-muted-foreground">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1.5">
              <p className="font-medium">Periodo</p>
              <p className="text-muted-foreground">{period.period_label}</p>
              <p className="text-muted-foreground">{period.period_start} → {period.period_end}</p>
              <p>Estado: <Badge variant="outline" className="text-[10px]">{period.status}</Badge></p>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium">Resultados</p>
              <p className="text-muted-foreground">{stats.total} empleados procesados</p>
              <p className="text-muted-foreground">{stats.approved} aprobados</p>
              <p className="text-muted-foreground">{stats.majorVar} con varianza mayor</p>
            </div>
          </div>

          {/* Issues summary */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium">Issues UAT</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Total: {issues.length}</span>
              <span>Abiertos: {stats.openIssues}</span>
              <span>Críticos abiertos: {stats.criticalOpen}</span>
              <span>Corregidos: {stats.fixedIssues}</span>
            </div>
            {stats.criticalOpen > 0 && (
              <p className="text-xs text-destructive font-medium">⚠ {stats.criticalOpen} issue(s) crítico(s) sin resolver</p>
            )}
          </div>

          {/* Confidence selector */}
          <div className="border-t pt-3">
            <div className="flex items-center gap-3">
              <p className="text-xs font-medium">Confianza del operador:</p>
              <Select value={confidence} onValueChange={(v) => setConfidence(v as any)}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="low">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
