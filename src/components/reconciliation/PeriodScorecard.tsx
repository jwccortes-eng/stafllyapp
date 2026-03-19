import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, AlertTriangle, XCircle, Users, DollarSign,
  TrendingUp, Shield, ArrowRight, Wrench, GitCompareArrows,
} from "lucide-react";
import type { PeriodStatus, EmployeeFinalRecord, EmployeeVariance } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  variances: EmployeeVariance[];
  onNavigate: (tab: string) => void;
}

export default function PeriodScorecard({ period, finalRecords, variances, onNavigate }: Props) {
  const stats = useMemo(() => {
    const sourceTotal = variances.reduce((s, v) => s + v.source_payroll_total, 0);
    const reconciledTotal = variances.reduce((s, v) => s + v.reconciled_total, 0);
    const publishedTotal = variances.reduce((s, v) => s + v.published_total, 0);
    const totalVariance = Math.round((reconciledTotal - sourceTotal) * 100) / 100;
    const matchPct = sourceTotal > 0 ? Math.round(((sourceTotal - Math.abs(totalVariance)) / sourceTotal) * 100) : 100;
    const exactMatch = variances.filter(v => v.variance_status === "exact_match").length;
    const empPct = variances.length > 0 ? Math.round((exactMatch / variances.length) * 100) : 100;
    const critical = variances.filter(v => v.variance_status === "major_variance" || v.variance_status === "unresolved").length;
    const warnings = variances.filter(v => v.variance_status === "minor_variance").length;
    const openExceptions = period.total_exceptions - period.resolved_exceptions;

    let readiness: string;
    let readinessColor: string;
    if (critical > 0 || openExceptions > 0) { readiness = "Bloqueado"; readinessColor = "destructive"; }
    else if (warnings > 0) { readiness = "Listo con advertencias"; readinessColor = "outline"; }
    else { readiness = "Listo para publicar"; readinessColor = "default"; }

    return { sourceTotal, reconciledTotal, publishedTotal, totalVariance, matchPct, empPct, exactMatch, critical, warnings, openExceptions, readiness, readinessColor };
  }, [variances, period]);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Blocker sections
  const blockers = useMemo(() => {
    const items: { label: string; count: number; tab: string; icon: any; severity: "critical" | "warning" | "info" }[] = [];
    const major = variances.filter(v => v.variance_status === "major_variance");
    const unresolved = variances.filter(v => v.variance_status === "unresolved");
    const openEx = period.total_exceptions - period.resolved_exceptions;
    const pendingApproval = finalRecords.filter(r => !["approved", "resolved", "posted"].includes(r.reconciliation_status));
    const unknownClass = finalRecords.filter(r => r.pay_classification === "unknown");
    const unmatchedPayroll = finalRecords.filter(r => (r.payroll_rows || []).length > 0 && (r.worked_shifts || []).length === 0);

    if (unresolved.length > 0) items.push({ label: "Empleados sin resolver", count: unresolved.length, tab: "workbench", icon: XCircle, severity: "critical" });
    if (major.length > 0) items.push({ label: "Varianzas mayores", count: major.length, tab: "workbench", icon: AlertTriangle, severity: "critical" });
    if (openEx > 0) items.push({ label: "Excepciones abiertas", count: openEx, tab: "exceptions", icon: AlertTriangle, severity: "critical" });
    if (unknownClass.length > 0) items.push({ label: "Clasificación desconocida", count: unknownClass.length, tab: "workbench", icon: Wrench, severity: "warning" });
    if (pendingApproval.length > 0) items.push({ label: "Pendientes de aprobación", count: pendingApproval.length, tab: "employees", icon: Users, severity: "warning" });
    if (unmatchedPayroll.length > 0) items.push({ label: "Nómina sin fichajes", count: unmatchedPayroll.length, tab: "workbench", icon: GitCompareArrows, severity: "warning" });

    return items;
  }, [variances, finalRecords, period]);

  return (
    <div className="space-y-4">
      {/* Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Nómina Fuente</div>
          <div className="text-lg font-bold font-mono">{fmt(stats.sourceTotal)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Reconciliado</div>
          <div className="text-lg font-bold font-mono">{fmt(stats.reconciledTotal)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Varianza Total</div>
          <div className={`text-lg font-bold font-mono ${Math.abs(stats.totalVariance) > 10 ? "text-destructive" : "text-primary"}`}>
            {fmt(stats.totalVariance)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Confianza</div>
          <div className="flex items-center gap-2">
            <Progress value={stats.matchPct} className="h-2 flex-1" />
            <span className="text-sm font-bold">{stats.matchPct}%</span>
          </div>
          <Badge variant={stats.readinessColor as any} className="text-[10px] mt-1">{stats.readiness}</Badge>
        </Card>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: "Empleados", value: variances.length, icon: Users },
          { label: "Exact Match", value: stats.exactMatch, icon: CheckCircle2 },
          { label: "Advertencias", value: stats.warnings, icon: AlertTriangle },
          { label: "Críticos", value: stats.critical, icon: XCircle },
          { label: "Excepciones", value: stats.openExceptions, icon: AlertTriangle },
          { label: "Emp. Match %", value: `${stats.empPct}%`, icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="text-center p-2 rounded-lg bg-muted/30 border">
            <Icon className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-sm font-bold">{value}</div>
            <div className="text-[10px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Blocker sections */}
      {blockers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Estado Operativo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {blockers.map(b => {
              const Icon = b.icon;
              const isCrit = b.severity === "critical";
              return (
                <button
                  key={b.label}
                  onClick={() => onNavigate(b.tab)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${isCrit ? "bg-destructive/10 hover:bg-destructive/15" : "bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20"}`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isCrit ? "text-destructive" : "text-amber-600"}`} />
                  <span className="flex-1 text-sm">{b.label}</span>
                  <Badge variant={isCrit ? "destructive" : "outline"} className="text-xs">{b.count}</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {blockers.length === 0 && variances.length > 0 && (
        <Card className="border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <div>
              <p className="font-medium text-sm">Sin bloqueadores</p>
              <p className="text-xs text-muted-foreground">Este periodo está listo para avanzar al siguiente paso.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
