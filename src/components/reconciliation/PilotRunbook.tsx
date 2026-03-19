import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, GitCompareArrows, AlertTriangle, CheckCircle2, Users,
  ClipboardCheck, Shield, Lock, BookOpen, FileText, PenTool,
  ChevronDown, ChevronUp, ArrowRight, Eye, Zap, Info,
} from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  onNavigate: (tab: string) => void;
}

interface RunbookStep {
  key: string;
  label: string;
  icon: any;
  tab: string;
  requiredStatus: string[];
  whatToCheck: string[];
  blockers: string[];
  confirmBefore: string;
  performer: string;
}

const RUNBOOK_STEPS: RunbookStep[] = [
  {
    key: "create_period",
    label: "1. Crear / Abrir Periodo",
    icon: BookOpen,
    tab: "dashboard",
    requiredStatus: [],
    whatToCheck: [
      "Nombre del periodo correcto (ej: Semana 12 - Mar 2026)",
      "Rango de fechas cubre la semana completa",
      "No existe ya un periodo duplicado para la misma semana",
    ],
    blockers: ["Periodo con el mismo rango ya existe"],
    confirmBefore: "Confirmar que el rango de fechas es correcto antes de crear.",
    performer: "Operador de nómina",
  },
  {
    key: "import_schedules",
    label: "2. Importar Horarios (Schedules)",
    icon: Upload,
    tab: "import",
    requiredStatus: ["importing", "normalizing"],
    whatToCheck: [
      "Archivo de horarios contiene la semana correcta",
      "Formato del archivo es compatible (CSV/XLSX)",
      "Empleados están correctamente identificados",
    ],
    blockers: ["Archivo vacío o formato incorrecto", "Semana equivocada en el archivo"],
    confirmBefore: "Verificar que el archivo corresponde al periodo activo.",
    performer: "Operador de nómina",
  },
  {
    key: "import_clocks",
    label: "3. Importar Fichajes (Clocks)",
    icon: Upload,
    tab: "import",
    requiredStatus: ["importing", "normalizing"],
    whatToCheck: [
      "Archivo de fichajes contiene la misma semana",
      "Todas las entradas y salidas están completas",
      "No hay fichajes sin empleado asignado",
    ],
    blockers: ["Fichajes sin clock_out", "Empleados no reconocidos"],
    confirmBefore: "Confirmar que los fichajes cubren el mismo rango que los horarios.",
    performer: "Operador de nómina",
  },
  {
    key: "import_payroll",
    label: "4. Importar Nómina (Payroll)",
    icon: Upload,
    tab: "import",
    requiredStatus: ["importing", "normalizing"],
    whatToCheck: [
      "Archivo de nómina es el reporte final de la semana",
      "Incluye todos los empleados activos",
      "Totales del archivo coinciden con el sistema fuente",
    ],
    blockers: ["Archivo incompleto", "Empleados faltantes", "Totales no cuadran con fuente"],
    confirmBefore: "Confirmar que la nómina es la versión final aprobada para esta semana.",
    performer: "Operador de nómina / Supervisor",
  },
  {
    key: "matching",
    label: "5. Ejecutar Matching",
    icon: GitCompareArrows,
    tab: "review",
    requiredStatus: ["importing", "normalizing", "matching"],
    whatToCheck: [
      "Empleados emparejados correctamente entre las 3 fuentes",
      "Sin duplicados de empleados",
      "Clasificaciones automáticas (hourly, daily, ride) correctas",
    ],
    blockers: ["Empleados sin match", "Clasificaciones ambiguas sin resolver"],
    confirmBefore: "Revisar que todos los matches son correctos antes de continuar.",
    performer: "Operador de nómina",
  },
  {
    key: "resolve_blockers",
    label: "6. Resolver Bloqueadores",
    icon: AlertTriangle,
    tab: "exceptions",
    requiredStatus: ["matching", "reviewing"],
    whatToCheck: [
      "Cola de excepciones vacía o solo con warnings menores",
      "Empleados desconocidos asignados o descartados",
      "Filas ambiguas clasificadas",
    ],
    blockers: ["Excepciones críticas sin resolver", "Empleados desconocidos pendientes"],
    confirmBefore: "Confirmar que no quedan bloqueadores críticos.",
    performer: "Operador de nómina",
  },
  {
    key: "employee_review",
    label: "7. Revisar Employee Close Cards",
    icon: Users,
    tab: "closedesk",
    requiredStatus: ["reviewing"],
    whatToCheck: [
      "Cada empleado tiene totales coherentes",
      "Varianzas explicadas o aceptadas",
      "Clasificaciones correctas por empleado",
    ],
    blockers: ["Empleados con varianza mayor sin explicar", "Clasificaciones unknown"],
    confirmBefore: "Revisar al menos los empleados con varianza > $50.",
    performer: "Operador de nómina / Supervisor",
  },
  {
    key: "validate",
    label: "8. Validar Periodo",
    icon: ClipboardCheck,
    tab: "validate",
    requiredStatus: ["reviewing", "approved"],
    whatToCheck: [
      "Panel de accuracy financiero muestra alta confianza",
      "No hay filas sin clasificar",
      "Resultado de validación es aprobado o con warnings menores",
    ],
    blockers: ["Validación fallida", "Filas unknown pendientes"],
    confirmBefore: "Ejecutar validación y revisar resultado antes de aprobar.",
    performer: "Supervisor / Manager",
  },
  {
    key: "pre_publish",
    label: "9. Pre-Publish Review",
    icon: Eye,
    tab: "publish",
    requiredStatus: ["approved"],
    whatToCheck: [
      "Resumen financiero correcto",
      "Sin riesgo de duplicados",
      "Todas las validaciones pasaron",
    ],
    blockers: ["Publicación bloqueada por checks críticos", "Duplicados detectados"],
    confirmBefore: "Leer y aceptar el resumen pre-publicación antes de publicar.",
    performer: "Supervisor / Manager",
  },
  {
    key: "publish",
    label: "10. Publicar",
    icon: Shield,
    tab: "publish",
    requiredStatus: ["approved"],
    whatToCheck: [
      "Confirmación explícita aceptada",
      "En modo piloto: confirmación extra requerida",
      "Totales publicados coinciden con reconciliados",
    ],
    blockers: ["Checks pre-publish no pasaron"],
    confirmBefore: "Confirmar publicación. Esta acción escribe en tablas de producción.",
    performer: "Manager / Owner",
  },
  {
    key: "post_verify",
    label: "11. Verificación Post-Publish",
    icon: CheckCircle2,
    tab: "publish",
    requiredStatus: ["posted"],
    whatToCheck: [
      "Totales publicados coinciden con totales validados",
      "Sin drift entre pre y post publicación",
      "Todos los empleados fueron procesados",
    ],
    blockers: ["Discrepancia entre totales publicados y validados"],
    confirmBefore: "Confirmar que la verificación post-publish es satisfactoria.",
    performer: "Operador de nómina",
  },
  {
    key: "signoff",
    label: "12. Signoff Formal",
    icon: PenTool,
    tab: "signoff",
    requiredStatus: ["posted"],
    whatToCheck: [
      "Todos los pasos de signoff completados",
      "Notas de cierre registradas",
      "Etiqueta de resultado asignada (closed_clean, etc.)",
    ],
    blockers: ["Signoff incompleto"],
    confirmBefore: "Completar todos los pasos de signoff antes de cerrar.",
    performer: "Manager / Owner",
  },
  {
    key: "close",
    label: "13. Cerrar y Bloquear Periodo",
    icon: Lock,
    tab: "publish",
    requiredStatus: ["posted"],
    whatToCheck: [
      "Periodo publicado y verificado",
      "Signoff completo",
      "Notas del piloto registradas",
    ],
    blockers: ["Signoff pendiente", "Verificación post-publish no realizada"],
    confirmBefore: "Cerrar el periodo bloquea cambios futuros. Confirmar.",
    performer: "Manager / Owner",
  },
];

const STATUS_ORDER = ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];

export default function PilotRunbook({ period, onNavigate }: Props) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const currentIdx = STATUS_ORDER.indexOf(period.status);

  const getStepState = (step: RunbookStep): "done" | "current" | "blocked" | "upcoming" => {
    if (period.status === "locked") return "done";
    if (step.key === "close" && period.status === "posted") return "current";
    if (step.key === "signoff" && period.status === "posted") return "current";
    if (step.key === "post_verify" && period.status === "posted") return "current";
    if (step.key === "publish" && period.status === "approved") return "current";
    if (step.key === "pre_publish" && period.status === "approved") return "current";
    if (step.key === "validate" && period.status === "reviewing") return "current";
    if (step.key === "employee_review" && period.status === "reviewing") return "current";
    if (step.key === "resolve_blockers" && ["matching", "reviewing"].includes(period.status)) return "current";
    if (step.key === "matching" && ["importing", "normalizing", "matching"].includes(period.status)) return "current";
    if (step.key.startsWith("import_") && ["importing", "normalizing"].includes(period.status)) return "current";
    if (step.key === "create_period") return currentIdx >= 0 ? "done" : "current";

    // Check if done
    const stepMinIdx = step.requiredStatus.length > 0
      ? Math.max(...step.requiredStatus.map(s => STATUS_ORDER.indexOf(s)))
      : -1;
    if (currentIdx > stepMinIdx + 1) return "done";

    return "upcoming";
  };

  const activeStep = useMemo(() => {
    return RUNBOOK_STEPS.find(s => getStepState(s) === "current");
  }, [period.status]);

  return (
    <div className="space-y-4">
      {/* Current step highlight */}
      {activeStep && (
        <Alert className="border-primary bg-primary/5">
          <Zap className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs flex items-center gap-2">
            <span className="font-medium">Paso actual:</span> {activeStep.label}
            <Button size="sm" variant="outline" className="h-6 text-xs ml-auto" onClick={() => onNavigate(activeStep.tab)}>
              <ArrowRight className="h-3 w-3 mr-1" /> Ir al tab
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Steps */}
      <div className="space-y-1.5">
        {RUNBOOK_STEPS.map(step => {
          const state = getStepState(step);
          const expanded = expandedStep === step.key;
          const Icon = step.icon;

          const stateStyles = {
            done: "border-earning/30 bg-earning/5",
            current: "border-primary bg-primary/5",
            blocked: "border-destructive bg-destructive/5",
            upcoming: "border-border opacity-60",
          };

          const stateIcons = {
            done: <CheckCircle2 className="h-4 w-4 text-earning shrink-0" />,
            current: <Zap className="h-4 w-4 text-primary shrink-0 animate-pulse" />,
            blocked: <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />,
            upcoming: <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />,
          };

          return (
            <Card key={step.key} className={`overflow-hidden transition-all ${stateStyles[state]}`}>
              <div
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/10 transition-colors"
                onClick={() => setExpandedStep(expanded ? null : step.key)}
              >
                {stateIcons[state]}
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium flex-1">{step.label}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{step.performer}</Badge>
                {state === "current" && (
                  <Button size="sm" variant="default" className="h-6 text-[10px] gap-1 shrink-0" onClick={(e) => { e.stopPropagation(); onNavigate(step.tab); }}>
                    <ArrowRight className="h-3 w-3" /> Ir
                  </Button>
                )}
                {expanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
              </div>

              {expanded && (
                <CardContent className="pt-0 pb-3 space-y-3">
                  <div className="grid md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="font-medium text-foreground mb-1 flex items-center gap-1"><Eye className="h-3 w-3" /> Qué revisar</p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        {step.whatToCheck.map((c, i) => <li key={i} className="flex items-start gap-1"><span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />{c}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-destructive mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Puede bloquear</p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        {step.blockers.map((b, i) => <li key={i} className="flex items-start gap-1"><span className="mt-1 h-1 w-1 rounded-full bg-destructive shrink-0" />{b}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-primary mb-1 flex items-center gap-1"><Info className="h-3 w-3" /> Confirmar antes</p>
                      <p className="text-muted-foreground">{step.confirmBefore}</p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
