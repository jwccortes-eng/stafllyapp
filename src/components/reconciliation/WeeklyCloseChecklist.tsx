import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Circle, AlertTriangle, Lock, Upload, GitCompareArrows,
  Users, Shield, ClipboardCheck, FileText, FolderOpen, Clock, Zap, ChevronRight,
} from "lucide-react";
import type { PeriodStatus, EmployeeFinalRecord } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  onNavigate: (tab: string) => void;
}

interface StepDef {
  key: string;
  label: string;
  description: string;
  icon: any;
  tab: string;
  check: (p: PeriodStatus, r: EmployeeFinalRecord[]) => StepResult;
}

interface StepResult {
  status: "done" | "active" | "blocked" | "pending";
  detail?: string;
  blockers?: string[];
  warnings?: string[];
  completedAt?: string;
  completedBy?: string;
}

const STATUS_ORDER = ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];

function statusAtLeast(current: string, min: string) {
  return STATUS_ORDER.indexOf(current) >= STATUS_ORDER.indexOf(min);
}

const STEPS: StepDef[] = [
  {
    key: "open", label: "Abrir periodo", description: "Crear o seleccionar un periodo semanal",
    icon: FolderOpen, tab: "dashboard",
    check: (p) => ({ status: "done", detail: p.period_label, completedAt: p.created_at }),
  },
  {
    key: "import_schedules", label: "Importar turnos", description: "Cargar archivo de programación",
    icon: Upload, tab: "import",
    check: (p) => p.total_schedules > 0
      ? { status: "done", detail: `${p.total_schedules} turnos importados` }
      : { status: statusAtLeast(p.status, "matching") ? "done" : "active", blockers: p.total_schedules === 0 ? ["Sin turnos importados"] : undefined },
  },
  {
    key: "import_clocks", label: "Importar fichajes", description: "Cargar archivo de reloj",
    icon: Clock, tab: "import",
    check: (p) => p.total_clocks > 0
      ? { status: "done", detail: `${p.total_clocks} fichajes importados` }
      : { status: statusAtLeast(p.status, "matching") ? "done" : "active" },
  },
  {
    key: "import_payroll", label: "Importar nómina", description: "Cargar archivo de nómina fuente",
    icon: FileText, tab: "import",
    check: (p) => p.total_payroll_rows > 0
      ? { status: "done", detail: `${p.total_payroll_rows} filas de nómina` }
      : { status: statusAtLeast(p.status, "matching") ? "done" : "active" },
  },
  {
    key: "matching", label: "Ejecutar matching", description: "Emparejar empleados, turnos y nómina",
    icon: GitCompareArrows, tab: "review",
    check: (p) => {
      if (!statusAtLeast(p.status, "matching")) return { status: "pending" };
      if (p.total_matches > 0) return { status: "done", detail: `${p.approved_matches}/${p.total_matches} aprobados` };
      return { status: "active" };
    },
  },
  {
    key: "exceptions", label: "Resolver excepciones", description: "Resolver conflictos de emparejamiento",
    icon: AlertTriangle, tab: "exceptions",
    check: (p) => {
      if (!statusAtLeast(p.status, "matching")) return { status: "pending" };
      const open = p.total_exceptions - p.resolved_exceptions;
      if (open > 0) return { status: "blocked", blockers: [`${open} excepción(es) sin resolver`] };
      if (p.total_exceptions > 0) return { status: "done", detail: `${p.total_exceptions} resueltas` };
      return { status: "done", detail: "Sin excepciones" };
    },
  },
  {
    key: "variance", label: "Revisar varianzas", description: "Analizar diferencias en el Workbench",
    icon: ClipboardCheck, tab: "workbench",
    check: (p, r) => {
      if (!statusAtLeast(p.status, "reviewing")) return { status: "pending" };
      const major = r.filter(rec => rec.variance_status === "major_variance").length;
      if (major > 0) return { status: "blocked", blockers: [`${major} varianzas mayores`], warnings: [`Revisa el Workbench`] };
      return { status: "done", detail: "Sin varianzas mayores" };
    },
  },
  {
    key: "approve", label: "Aprobar empleados", description: "Revisar y aprobar registros finales",
    icon: Users, tab: "employees",
    check: (p, r) => {
      if (!statusAtLeast(p.status, "reviewing")) return { status: "pending" };
      const pending = r.filter(rec => !["approved", "resolved", "posted"].includes(rec.reconciliation_status)).length;
      if (pending > 0) return { status: "active", warnings: [`${pending} empleados pendientes`] };
      return { status: "done", detail: `${r.length} empleados aprobados` };
    },
  },
  {
    key: "validate", label: "Validar periodo", description: "Ejecutar validación completa UAT",
    icon: ClipboardCheck, tab: "validate",
    check: (p) => {
      if (!statusAtLeast(p.status, "reviewing")) return { status: "pending" };
      if (statusAtLeast(p.status, "approved")) return { status: "done", detail: "Validado", completedAt: p.approved_at || undefined };
      return { status: "active" };
    },
  },
  {
    key: "publish", label: "Publicar", description: "Publicar registros finales a producción",
    icon: Shield, tab: "publish",
    check: (p) => {
      if (!statusAtLeast(p.status, "approved")) return { status: "pending" };
      if (statusAtLeast(p.status, "posted")) return { status: "done", detail: "Publicado", completedAt: p.posted_at || undefined };
      return { status: "active" };
    },
  },
  {
    key: "close", label: "Cerrar periodo", description: "Bloquear periodo definitivamente",
    icon: Lock, tab: "publish",
    check: (p) => {
      if (!statusAtLeast(p.status, "posted")) return { status: "pending" };
      if (p.status === "locked") return { status: "done", detail: "Cerrado", completedAt: p.locked_at || undefined };
      return { status: "active" };
    },
  },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  done: { bg: "bg-primary/10", text: "text-primary", icon: CheckCircle2 },
  active: { bg: "bg-accent/50", text: "text-accent-foreground", icon: Zap },
  blocked: { bg: "bg-destructive/10", text: "text-destructive", icon: AlertTriangle },
  pending: { bg: "bg-muted/30", text: "text-muted-foreground", icon: Circle },
};

export default function WeeklyCloseChecklist({ period, finalRecords, onNavigate }: Props) {
  const steps = useMemo(() => STEPS.map(s => ({
    ...s,
    result: s.check(period, finalRecords),
  })), [period, finalRecords]);

  const completedCount = steps.filter(s => s.result.status === "done").length;
  const progress = Math.round((completedCount / steps.length) * 100);
  const activeStep = steps.find(s => s.result.status === "active" || s.result.status === "blocked");
  const blockerCount = steps.filter(s => s.result.status === "blocked").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> Cierre Semanal — {period.period_label}
          </CardTitle>
          <div className="flex items-center gap-2">
            {blockerCount > 0 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" /> {blockerCount} bloqueador(es)
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-mono">{completedCount}/{steps.length}</Badge>
          </div>
        </div>
        <Progress value={progress} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((step, i) => {
          const style = STATUS_STYLES[step.result.status];
          const StepIcon = step.icon;
          const StatusIcon = style.icon;
          const isClickable = step.result.status !== "pending";

          return (
            <button
              key={step.key}
              onClick={() => isClickable && onNavigate(step.tab)}
              disabled={!isClickable}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${style.bg} hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <div className={`shrink-0 ${style.text}`}>
                <StatusIcon className="h-4 w-4" />
              </div>
              <StepIcon className={`h-4 w-4 shrink-0 ${style.text}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${style.text}`}>{step.label}</span>
                  {step.result.detail && (
                    <span className="text-[11px] text-muted-foreground truncate">{step.result.detail}</span>
                  )}
                </div>
                {step.result.blockers && step.result.blockers.length > 0 && (
                  <div className="text-[11px] text-destructive mt-0.5">
                    {step.result.blockers.join(" · ")}
                  </div>
                )}
                {step.result.warnings && step.result.warnings.length > 0 && !step.result.blockers?.length && (
                  <div className="text-[11px] text-amber-600 mt-0.5">
                    {step.result.warnings.join(" · ")}
                  </div>
                )}
              </div>
              {step.result.completedAt && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(step.result.completedAt).toLocaleDateString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {isClickable && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            </button>
          );
        })}

        {/* Next action CTA */}
        {activeStep && (
          <div className="pt-3 border-t mt-3">
            <Button className="w-full gap-2" onClick={() => onNavigate(activeStep.tab)}>
              <Zap className="h-4 w-4" />
              Siguiente: {activeStep.label}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
