import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, AlertTriangle, XCircle, Users, Shield, ArrowRight, Wrench,
  Lock, Upload, Zap, Clock, FileText,
  RotateCcw, TrendingUp, DollarSign, ClipboardCheck,
  CircleDot, Bot,
} from "lucide-react";
import type { PeriodStatus, EmployeeFinalRecord, EmployeeVariance } from "@/hooks/useReconciliationPeriod";
import type { ClassifyAction } from "./QuickClassifyBar";
import EmployeeCloseCards from "./EmployeeCloseCards";
import FinancialAccuracyPanel from "./FinancialAccuracyPanel";
import AutoApprovalPanel from "./AutoApprovalPanel";

interface Props {
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  variances: EmployeeVariance[];
  employeeMap: Map<string, string>;
  onNavigate: (tab: string) => void;
  onApproveRecord?: (recordId: string) => void;
  onBulkApprove?: (recordIds: string[]) => void;
  onClassifyRecords?: (recordIds: string[], classification: ClassifyAction) => Promise<void>;
  onMarkReviewed?: (recordIds: string[]) => Promise<void>;
}

type ReadinessLevel = "ready_validate" | "ready_publish" | "ready_warnings" | "blocked" | "closed" | "reopened";

const READINESS_CONFIG: Record<ReadinessLevel, { label: string; color: string; icon: any; bg: string }> = {
  ready_validate: { label: "Listo para Validar", color: "text-blue-700 dark:text-blue-400", icon: ClipboardCheck, bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
  ready_publish: { label: "Listo para Publicar", color: "text-primary", icon: Shield, bg: "bg-primary/5 border-primary/30" },
  ready_warnings: { label: "Listo con Advertencias", color: "text-amber-700 dark:text-amber-400", icon: AlertTriangle, bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  blocked: { label: "Bloqueado por Problemas Críticos", color: "text-destructive", icon: XCircle, bg: "bg-destructive/5 border-destructive/30" },
  closed: { label: "Periodo Cerrado", color: "text-muted-foreground", icon: Lock, bg: "bg-muted/40 border-border" },
  reopened: { label: "Reabierto — Pendiente de Revisión", color: "text-amber-700 dark:text-amber-400", icon: RotateCcw, bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
};

const STATUS_ORDER = ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];

interface BlockerQueue {
  id: string;
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  icon: any;
  tab: string;
  items?: { id: string; name: string; detail: string }[];
}

export default function CloseDesk({ period, finalRecords, variances, employeeMap, onNavigate, onApproveRecord, onBulkApprove, onClassifyRecords, onMarkReviewed }: Props) {
  const [showAllBlockers, setShowAllBlockers] = useState(false);
  const [showFinancial, setShowFinancial] = useState(false);
  const [showAutoApproval, setShowAutoApproval] = useState(false);

  const readiness = useMemo((): ReadinessLevel => {
    if (period.status === "locked" || period.status === "posted") return "closed";
    if (period.reopen_count > 0 && period.status === "reviewing") return "reopened";
    const hasUnresolved = variances.some(v => v.variance_status === "unresolved");
    const hasMajor = variances.some(v => v.variance_status === "major_variance");
    const openEx = period.total_exceptions - period.resolved_exceptions;
    if (hasUnresolved || openEx > 0) return "blocked";
    if (period.status === "approved") return hasMajor ? "ready_warnings" : "ready_publish";
    const hasMinor = variances.some(v => v.variance_status === "minor_variance");
    return (hasMajor || hasMinor) ? "ready_warnings" : "ready_validate";
  }, [period, variances]);

  const readinessCfg = READINESS_CONFIG[readiness];
  const ReadinessIcon = readinessCfg.icon;

  const stats = useMemo(() => {
    const sourceTotal = variances.reduce((s, v) => s + v.source_payroll_total, 0);
    const reconciledTotal = variances.reduce((s, v) => s + v.reconciled_total, 0);
    const totalVariance = Math.round((reconciledTotal - sourceTotal) * 100) / 100;
    const exactMatch = variances.filter(v => v.variance_status === "exact_match").length;
    const empPct = variances.length > 0 ? Math.round((exactMatch / variances.length) * 100) : 100;
    const critical = variances.filter(v => v.variance_status === "major_variance" || v.variance_status === "unresolved").length;
    const warnings = variances.filter(v => v.variance_status === "minor_variance").length;
    const openExceptions = period.total_exceptions - period.resolved_exceptions;
    const pendingReview = finalRecords.filter(r => !["approved", "resolved", "posted"].includes(r.reconciliation_status)).length;
    const unknownClass = finalRecords.filter(r => r.pay_classification === "unknown").length;
    const unmatchedPayroll = finalRecords.filter(r => (r.payroll_rows || []).length > 0 && (r.worked_shifts || []).length === 0).length;
    const unmatchedClocks = finalRecords.filter(r => (r.worked_shifts || []).length > 0 && (r.payroll_rows || []).length === 0).length;
    return { sourceTotal, reconciledTotal, totalVariance, exactMatch, empPct, critical, warnings, openExceptions, pendingReview, unknownClass, unmatchedPayroll, unmatchedClocks };
  }, [variances, finalRecords, period]);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const blockerQueues = useMemo((): BlockerQueue[] => {
    const queues: BlockerQueue[] = [];
    const unresolved = variances.filter(v => v.variance_status === "unresolved");
    if (unresolved.length > 0) queues.push({
      id: "unresolved", label: "Empleados sin resolver", count: unresolved.length, severity: "critical", icon: XCircle, tab: "workbench",
      items: unresolved.slice(0, 5).map(v => ({ id: v.employee_id, name: v.employee_name, detail: `Varianza: ${fmt(v.variance_amount)}` })),
    });

    const major = variances.filter(v => v.variance_status === "major_variance");
    if (major.length > 0) queues.push({
      id: "major_variance", label: "Varianzas mayores (>$10)", count: major.length, severity: "warning", icon: AlertTriangle, tab: "workbench",
      items: major.slice(0, 5).map(v => ({ id: v.employee_id, name: v.employee_name, detail: `${fmt(v.variance_amount)}` })),
    });

    if (stats.openExceptions > 0) queues.push({ id: "exceptions", label: "Excepciones abiertas", count: stats.openExceptions, severity: "critical", icon: AlertTriangle, tab: "exceptions" });
    if (stats.unknownClass > 0) queues.push({
      id: "unknown_class", label: "Clasificación desconocida", count: stats.unknownClass, severity: "warning", icon: Wrench, tab: "workbench",
      items: finalRecords.filter(r => r.pay_classification === "unknown").slice(0, 5).map(r => ({ id: r.employee_id, name: employeeMap.get(r.employee_id) || "—", detail: "Sin clasificar" })),
    });
    if (stats.pendingReview > 0) queues.push({ id: "pending_review", label: "Empleados pendientes de revisión", count: stats.pendingReview, severity: "warning", icon: Users, tab: "employees" });
    if (stats.unmatchedPayroll > 0) queues.push({ id: "unmatched_payroll", label: "Nómina sin fichajes", count: stats.unmatchedPayroll, severity: "warning", icon: FileText, tab: "workbench" });
    if (stats.unmatchedClocks > 0) queues.push({ id: "unmatched_clocks", label: "Fichajes sin nómina", count: stats.unmatchedClocks, severity: "warning", icon: Clock, tab: "workbench" });

    const minor = variances.filter(v => v.variance_status === "minor_variance");
    if (minor.length > 0) queues.push({ id: "minor_variance", label: "Varianzas menores (≤$10)", count: minor.length, severity: "info", icon: TrendingUp, tab: "workbench" });

    if (period.status === "reviewing" && finalRecords.length > 0 && stats.critical === 0 && stats.openExceptions === 0) {
      queues.push({ id: "not_validated", label: "Periodo sin validar", count: 1, severity: "info", icon: ClipboardCheck, tab: "validate" });
    }

    return queues;
  }, [variances, finalRecords, stats, period, employeeMap]);

  const displayQueues = showAllBlockers ? blockerQueues : blockerQueues.slice(0, 6);
  const criticalQueues = blockerQueues.filter(q => q.severity === "critical");

  const currentStepIdx = STATUS_ORDER.indexOf(period.status);
  const progressPct = Math.round(((currentStepIdx + 1) / STATUS_ORDER.length) * 100);

  return (
    <div className="space-y-4">
      {/* READINESS BANNER */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 ${readinessCfg.bg}`}>
        <ReadinessIcon className={`h-6 w-6 shrink-0 ${readinessCfg.color}`} />
        <div className="flex-1">
          <p className={`font-semibold text-sm ${readinessCfg.color}`}>{readinessCfg.label}</p>
          <p className="text-xs text-muted-foreground">
            {period.period_label} · {period.period_start} → {period.period_end}
            {period.reopen_count > 0 && ` · ↻${period.reopen_count} reaperturas`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {readiness === "ready_validate" && (
            <Button size="sm" className="gap-1" onClick={() => onNavigate("validate")}>
              <ClipboardCheck className="h-3.5 w-3.5" /> Validar
            </Button>
          )}
          {readiness === "ready_publish" && (
            <Button size="sm" className="gap-1" onClick={() => onNavigate("publish")}>
              <Shield className="h-3.5 w-3.5" /> Publicar
            </Button>
          )}
          {readiness === "ready_warnings" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onNavigate("validate")}>
              <AlertTriangle className="h-3.5 w-3.5" /> Revisar y Validar
            </Button>
          )}
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: "Nómina Fuente", value: fmt(stats.sourceTotal), mono: true },
          { label: "Reconciliado", value: fmt(stats.reconciledTotal), mono: true },
          { label: "Varianza", value: fmt(stats.totalVariance), mono: true, accent: Math.abs(stats.totalVariance) > 10 },
          { label: "Exact Match", value: `${stats.empPct}%` },
          { label: "Críticos", value: stats.critical, accent: stats.critical > 0 },
          { label: "Advertencias", value: stats.warnings },
        ].map(({ label, value, mono, accent }) => (
          <Card key={label} className="p-2.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
            <div className={`text-base font-bold ${mono ? "font-mono" : ""} ${accent ? "text-destructive" : ""}`}>{value}</div>
          </Card>
        ))}
      </div>

      {/* WORKFLOW PROGRESS */}
      <div className="flex items-center gap-2">
        <Progress value={progressPct} className="h-1.5 flex-1" />
        <span className="text-[11px] text-muted-foreground font-medium">{period.status}</span>
      </div>

      {/* PANEL TOGGLES */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant={showAutoApproval ? "default" : "outline"} className="gap-1 text-xs" onClick={() => setShowAutoApproval(!showAutoApproval)}>
          <Bot className="h-3.5 w-3.5" /> {showAutoApproval ? "Ocultar Auto-Aprobación" : "Motor Auto-Aprobación"}
        </Button>
        <Button size="sm" variant={showFinancial ? "default" : "outline"} className="gap-1 text-xs" onClick={() => setShowFinancial(!showFinancial)}>
          <DollarSign className="h-3.5 w-3.5" /> {showFinancial ? "Ocultar Panel Financiero" : "Panel Financiero"}
        </Button>
      </div>

      {showAutoApproval && finalRecords.length > 0 && (
        <AutoApprovalPanel
          finalRecords={finalRecords}
          employeeMap={employeeMap}
          onNavigate={onNavigate}
          onApproveRecord={onApproveRecord}
          onBulkApprove={onBulkApprove}
        />
      )}

      {showFinancial && (
        <FinancialAccuracyPanel finalRecords={finalRecords} variances={variances} />
      )}

      {/* BLOCKER QUEUES */}
      {blockerQueues.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Bloqueadores y Pendientes
                {criticalQueues.length > 0 && <Badge variant="destructive" className="text-[10px]">{criticalQueues.length} crítico(s)</Badge>}
              </CardTitle>
              {blockerQueues.length > 6 && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAllBlockers(!showAllBlockers)}>
                  {showAllBlockers ? "Menos" : `Ver todos (${blockerQueues.length})`}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {displayQueues.map(q => {
              const Icon = q.icon;
              const isCrit = q.severity === "critical";
              const isWarn = q.severity === "warning";
              return (
                <div key={q.id} className="space-y-0.5">
                  <button
                    onClick={() => onNavigate(q.tab)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isCrit ? "bg-destructive/8 hover:bg-destructive/12" : isWarn ? "bg-amber-500/8 hover:bg-amber-500/12" : "bg-muted/40 hover:bg-muted/60"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isCrit ? "text-destructive" : isWarn ? "text-amber-600" : "text-muted-foreground"}`} />
                    <span className="flex-1 text-sm">{q.label}</span>
                    <Badge variant={isCrit ? "destructive" : "outline"} className="text-xs">{q.count}</Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                  {q.items && q.items.length > 0 && (
                    <div className="ml-10 space-y-0.5">
                      {q.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-[11px] text-muted-foreground py-0.5">
                          <CircleDot className="h-2.5 w-2.5 shrink-0" />
                          <span className="font-medium text-foreground">{item.name}</span>
                          <span>{item.detail}</span>
                        </div>
                      ))}
                      {q.count > 5 && <div className="text-[10px] text-muted-foreground pl-4">+{q.count - 5} más...</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {blockerQueues.length === 0 && finalRecords.length > 0 && (
        <Card className="border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <div>
              <p className="font-medium text-sm">Sin bloqueadores</p>
              <p className="text-xs text-muted-foreground">Todos los empleados están listos. Puedes proceder a validar y publicar.</p>
            </div>
            <Button size="sm" className="ml-auto gap-1" onClick={() => onNavigate(period.status === "approved" ? "publish" : "validate")}>
              <Zap className="h-3.5 w-3.5" /> {period.status === "approved" ? "Publicar" : "Validar"}
            </Button>
          </div>
        </Card>
      )}

      {/* EMPLOYEE CLOSE CARDS */}
      {finalRecords.length > 0 && (
        <EmployeeCloseCards
          finalRecords={finalRecords}
          variances={variances}
          employeeMap={employeeMap}
          period={period}
          onNavigate={onNavigate}
          onApproveRecord={onApproveRecord}
          onBulkApprove={onBulkApprove}
          onClassifyRecords={onClassifyRecords}
          onMarkReviewed={onMarkReviewed}
        />
      )}

      {finalRecords.length === 0 && (
        <Card className="p-8 text-center">
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">Importa archivos y genera registros finales para ver el estado de empleados.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => onNavigate("import")}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Ir a Importar
          </Button>
        </Card>
      )}
    </div>
  );
}
