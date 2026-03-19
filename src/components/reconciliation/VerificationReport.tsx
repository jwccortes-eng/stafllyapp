import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, AlertTriangle, XCircle, Shield, Search,
  ClipboardCheck, BarChart3, TrendingUp, Play, Eye,
} from "lucide-react";
import type {
  PeriodStatus, EmployeeFinalRecord, ValidationResult, EmployeeVariance,
} from "@/hooks/useReconciliationPeriod";
import { UAT_CHECKLIST_ITEMS } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  employees: Map<string, string>;
  onRunValidation: (isDryRun: boolean, uat: Record<string, boolean>, notes?: string) => Promise<ValidationResult | null>;
  onPublish: () => Promise<boolean | void>;
  publishing?: boolean;
}

const VARIANCE_COLORS: Record<string, string> = {
  exact_match: "text-primary",
  minor_variance: "text-yellow-600",
  major_variance: "text-destructive",
  unresolved: "text-muted-foreground",
};

const VARIANCE_BADGES: Record<string, { label: string; variant: string }> = {
  exact_match: { label: "Exacto", variant: "default" },
  minor_variance: { label: "Menor", variant: "secondary" },
  major_variance: { label: "Mayor", variant: "destructive" },
  unresolved: { label: "Sin resolver", variant: "outline" },
};

const READINESS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  ready: { label: "Listo para Publicar", icon: CheckCircle2, color: "text-primary" },
  ready_with_warnings: { label: "Listo con Advertencias", icon: AlertTriangle, color: "text-yellow-600" },
  blocked: { label: "Bloqueado por Problemas Críticos", icon: XCircle, color: "text-destructive" },
};

const fmt = (n: number) => `$${n.toFixed(2)}`;

export default function VerificationReport({
  period, finalRecords, employees, onRunValidation, onPublish, publishing,
}: Props) {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [uatChecklist, setUatChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [showVarianceDetail, setShowVarianceDetail] = useState(false);

  const toggleUat = (key: string) => {
    setUatChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRunDryRun = async () => {
    setRunning(true);
    const result = await onRunValidation(true, uatChecklist, notes);
    if (result) setValidationResult(result);
    setRunning(false);
  };

  const handleRunLive = async () => {
    setRunning(true);
    const result = await onRunValidation(false, uatChecklist, notes);
    if (result) setValidationResult(result);
    setRunning(false);
  };

  const uatCompleted = useMemo(() => {
    const total = UAT_CHECKLIST_ITEMS.length;
    const checked = Object.values(uatChecklist).filter(Boolean).length;
    return { total, checked, pct: total > 0 ? Math.round((checked / total) * 100) : 0 };
  }, [uatChecklist]);

  const isPosted = ["posted", "locked"].includes(period.status);

  return (
    <div className="space-y-6">
      {/* UAT Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> Checklist de Validación (UAT)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {UAT_CHECKLIST_ITEMS.map(item => (
              <div key={item.key} className="flex items-center gap-2">
                <Checkbox
                  id={item.key}
                  checked={!!uatChecklist[item.key]}
                  onCheckedChange={() => toggleUat(item.key)}
                />
                <Label htmlFor={item.key} className="text-xs cursor-pointer">{item.label}</Label>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Progress value={uatCompleted.pct} className="flex-1 h-2" />
            <span className="text-xs text-muted-foreground">{uatCompleted.checked}/{uatCompleted.total}</span>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Notas de Validación</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observaciones sobre la validación del periodo..."
            rows={2}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button onClick={handleRunDryRun} disabled={running || finalRecords.length === 0} variant="outline" className="gap-2">
          <Eye className="h-4 w-4" /> {running ? "Analizando..." : "Dry Run (sin escribir)"}
        </Button>
        {!isPosted && (
          <Button onClick={handleRunLive} disabled={running || finalRecords.length === 0} variant="secondary" className="gap-2">
            <Play className="h-4 w-4" /> Validar y Guardar Resultado
          </Button>
        )}
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div className="space-y-6">
          {/* Confidence Indicator */}
          <Card className="border-2 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  {(() => {
                    const cfg = READINESS_CONFIG[validationResult.publish_readiness] || READINESS_CONFIG.blocked;
                    const Icon = cfg.icon;
                    return (
                      <div className={`flex items-center gap-2 ${cfg.color}`}>
                        <Icon className="h-6 w-6" />
                        <span className="text-lg font-bold">{cfg.label}</span>
                      </div>
                    );
                  })()}
                  <p className="text-sm text-muted-foreground mt-1">
                    {validationResult.is_dry_run ? "Resultado de simulación (dry run)" : "Resultado de validación almacenado"}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">{validationResult.confidence_score}%</div>
                  <div className="text-xs text-muted-foreground">Confianza</div>
                </div>
              </div>
              <Progress value={validationResult.confidence_score} className="h-3" />
            </CardContent>
          </Card>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Exactos", value: validationResult.employees_exact_match, icon: CheckCircle2, color: "text-primary" },
              { label: "Varianza Menor", value: validationResult.employees_minor_variance, icon: TrendingUp, color: "text-yellow-600" },
              { label: "Varianza Mayor", value: validationResult.employees_major_variance, icon: AlertTriangle, color: "text-destructive" },
              { label: "Sin Resolver", value: validationResult.employees_unresolved, icon: XCircle, color: "text-muted-foreground" },
              { label: "Total Empleados", value: validationResult.total_employees, icon: BarChart3, color: "" },
            ].map(item => (
              <Card key={item.label}>
                <CardContent className="pt-4 pb-3 text-center">
                  <item.icon className={`h-5 w-5 mx-auto mb-1 ${item.color}`} />
                  <div className="text-2xl font-bold">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Period Totals Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Totales del Periodo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Nómina Fuente</div>
                  <div className="font-mono font-bold text-lg">{fmt(validationResult.source_payroll_total)}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Reconciliado</div>
                  <div className="font-mono font-bold text-lg">{fmt(validationResult.reconciled_total)}</div>
                </div>
                <div className={`p-3 rounded-lg ${Math.abs(validationResult.total_variance) > 10 ? "bg-destructive/10" : "bg-primary/10"}`}>
                  <div className="text-xs text-muted-foreground mb-1">Varianza Total</div>
                  <div className={`font-mono font-bold text-lg ${Math.abs(validationResult.total_variance) > 10 ? "text-destructive" : "text-primary"}`}>
                    {validationResult.total_variance >= 0 ? "+" : ""}{fmt(validationResult.total_variance)}
                  </div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Excepciones</div>
                  <div className="font-mono font-bold text-lg">{validationResult.unresolved_exceptions}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee Variance Detail */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4" /> Detalle por Empleado ({validationResult.employee_variances.length})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowVarianceDetail(!showVarianceDetail)}>
                {showVarianceDetail ? "Ocultar" : "Mostrar"} Detalle
              </Button>
            </CardHeader>
            {showVarianceDetail && (
              <CardContent>
                <div className="overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Empleado</TableHead>
                        <TableHead className="text-xs text-center">Prog.</TableHead>
                        <TableHead className="text-xs text-center">Trab.</TableHead>
                        <TableHead className="text-xs text-center">Nóm.</TableHead>
                        <TableHead className="text-xs text-center">Tipo</TableHead>
                        <TableHead className="text-xs text-right">Fuente $</TableHead>
                        <TableHead className="text-xs text-right">Reconciliado $</TableHead>
                        <TableHead className="text-xs text-right">Varianza</TableHead>
                        <TableHead className="text-xs text-center">Estado</TableHead>
                        <TableHead className="text-xs">Razones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResult.employee_variances.map(v => {
                        const badgeCfg = VARIANCE_BADGES[v.variance_status] || VARIANCE_BADGES.unresolved;
                        return (
                          <TableRow key={v.employee_id}>
                            <TableCell className="text-xs font-medium">{v.employee_name}</TableCell>
                            <TableCell className="text-xs text-center font-mono">{v.scheduled_count}</TableCell>
                            <TableCell className="text-xs text-center font-mono">{v.worked_count}</TableCell>
                            <TableCell className="text-xs text-center font-mono">{v.payroll_count}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-[10px]">{v.pay_classification}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">{fmt(v.source_payroll_total)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{fmt(v.reconciled_total)}</TableCell>
                            <TableCell className={`text-xs text-right font-mono font-bold ${VARIANCE_COLORS[v.variance_status]}`}>
                              {v.variance_amount >= 0 ? "+" : ""}{fmt(v.variance_amount)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={badgeCfg.variant as any} className="text-[10px]">{badgeCfg.label}</Badge>
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px]">
                              {v.variance_reasons.length > 0 ? (
                                <ul className="list-disc pl-3 space-y-0.5">
                                  {v.variance_reasons.slice(0, 3).map((r, i) => <li key={i} className="text-muted-foreground">{r}</li>)}
                                  {v.variance_reasons.length > 3 && <li className="text-muted-foreground">+{v.variance_reasons.length - 3} más</li>}
                                </ul>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Warnings from variance */}
          {validationResult.employee_variances.some(v => v.warnings.length > 0) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Advertencias detectadas</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-xs">
                  {validationResult.employee_variances
                    .filter(v => v.warnings.length > 0)
                    .flatMap(v => v.warnings.map(w => `${v.employee_name}: ${w}`))
                    .slice(0, 10)
                    .map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Final publish from validation */}
          {!isPosted && validationResult.publish_readiness !== "blocked" && period.status === "approved" && (
            <div className="flex justify-end gap-3 pt-2">
              <Alert variant="default" className="flex-1">
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Validación completada. {validationResult.publish_readiness === "ready"
                    ? "El periodo está listo para publicar."
                    : "El periodo tiene advertencias menores pero puede publicarse."}
                </AlertDescription>
              </Alert>
              <Button onClick={() => onPublish()} disabled={publishing} className="gap-2 shrink-0">
                <CheckCircle2 className="h-4 w-4" /> {publishing ? "Publicando..." : "Confirmar y Publicar"}
              </Button>
            </div>
          )}

          {validationResult.publish_readiness === "blocked" && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Publicación bloqueada</AlertTitle>
              <AlertDescription>
                Hay {validationResult.employees_major_variance + validationResult.employees_unresolved} empleado(s) con varianza mayor o sin resolver.
                Resuelve los conflictos antes de publicar.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {finalRecords.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sin registros</AlertTitle>
          <AlertDescription>
            Genera los registros finales desde la pestaña "Empleados" antes de ejecutar la validación.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
