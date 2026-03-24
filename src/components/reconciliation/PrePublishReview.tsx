import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, AlertTriangle, XCircle, Shield, User, DollarSign,
  Clock, Calendar, FileText, RotateCcw, Lock, Rocket, Eye, Database, Loader2,
} from "lucide-react";
import PostPublishVerification from "./PostPublishVerification";
import type { EmployeeFinalRecord, EmployeeVariance, PeriodStatus, ClosingReceipt } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  closingReceipt: ClosingReceipt | null;
  employees: Map<string, string>;
  validation: { canPublish: boolean; errors: string[]; warnings: string[] };
  variances?: EmployeeVariance[];
  onPublish: () => Promise<boolean | void>;
  onGenerateTruthRecords?: () => Promise<boolean>;
  onLock: () => void;
  onReopen: (reason: string) => void;
  publishing?: boolean;
  isPilotMode?: boolean;
}

export default function PrePublishReview({
  period, finalRecords, closingReceipt, employees, validation, variances,
  onPublish, onGenerateTruthRecords, onLock, onReopen, publishing, isPilotMode = true,
}: Props) {
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [supervisedConfirm, setSupervisedConfirm] = useState(false);
  const [truthGenerationState, setTruthGenerationState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const stats = useMemo(() => {
    const approved = finalRecords.filter(r => ["resolved", "approved"].includes(r.reconciliation_status));
    const shiftCalcTotal = finalRecords.reduce((s, r) => s + ((r as any).shift_calculated_total || 0), 0);
    const empsWithShiftCalc = finalRecords.filter(r => ((r as any).shift_calculated_total || 0) > 0).length;
    const totalFullDays = finalRecords.reduce((s, r) => s + ((r as any).shift_full_day_count || 0), 0);
    const totalHalfDays = finalRecords.reduce((s, r) => s + ((r as any).shift_half_day_count || 0), 0);
    return {
      totalEmployees: finalRecords.length,
      approvedEmployees: approved.length,
      totalScheduled: finalRecords.reduce((s, r) => s + (r.scheduled_shifts?.length || 0), 0),
      totalWorked: finalRecords.reduce((s, r) => s + (r.worked_shifts?.length || 0), 0),
      totalPayrollRows: finalRecords.reduce((s, r) => s + (r.payroll_rows?.length || 0), 0),
      totalRegularHours: finalRecords.reduce((s, r) => s + (r.regular_hours || 0), 0),
      totalOvertimeHours: finalRecords.reduce((s, r) => s + (r.overtime_hours || 0), 0),
      hourlyPay: finalRecords.reduce((s, r) => s + (r.hourly_pay_total || r.base_pay || 0), 0),
      dailyPay: finalRecords.reduce((s, r) => s + (r.daily_pay_total || 0), 0),
      ridePay: finalRecords.reduce((s, r) => s + (r.ride_pay_total || r.ride_amount || 0), 0),
      weekendPay: finalRecords.reduce((s, r) => s + (r.weekend_pay_total || r.weekend_amount || 0), 0),
      manualAdj: finalRecords.reduce((s, r) => s + (r.manual_adjustment_total || r.manual_amount || 0), 0),
      grandTotal: finalRecords.reduce((s, r) => s + (r.grand_total || r.final_total_pay || 0), 0),
      shiftCalcTotal,
      empsWithShiftCalc,
      totalFullDays,
      totalHalfDays,
    };
  }, [finalRecords]);

  // Enhanced pre-publish checks
  const enhancedChecks = useMemo(() => {
    const errors = [...validation.errors];
    const warnings = [...validation.warnings];

    // No unknown classifications
    const unknowns = finalRecords.filter(r => r.pay_classification === "unknown");
    if (unknowns.length > 0 && !errors.some(e => e.includes("clasificación"))) {
      errors.push(`${unknowns.length} empleado(s) con clasificación de pago desconocida.`);
    }

    // No major unexplained variances
    const majorUnexplained = (variances || []).filter(v =>
      v.variance_status === "major_variance" && (!v.variance_reasons || v.variance_reasons.length === 0)
    );
    if (majorUnexplained.length > 0) {
      errors.push(`${majorUnexplained.length} empleado(s) con varianza mayor sin explicación.`);
    }

    // Duplicate publish check
    if (period.publish_idempotency_key) {
      errors.push("Este periodo ya fue publicado. No se permiten publicaciones duplicadas.");
    }

    // Validation result must exist
    const noApproval = finalRecords.filter(r => !["approved", "resolved", "posted"].includes(r.reconciliation_status));
    if (noApproval.length > 0 && !errors.some(e => e.includes("conflictos sin resolver"))) {
      warnings.push(`${noApproval.length} empleado(s) aún sin aprobar.`);
    }

    const canPublish = errors.length === 0;
    const hasWarnings = warnings.length > 0;

    return { canPublish, errors, warnings, hasWarnings };
  }, [validation, finalRecords, variances, period]);

  const isPosted = ["posted", "locked"].includes(period.status);
  const isLocked = period.status === "locked";
  const canPublish = period.status === "approved" && enhancedChecks.canPublish;
  const isTruthBasedPeriod = period.closure_method === "truth_validation" || period.total_clocks === 0;

  useEffect(() => {
    setTruthGenerationState("idle");
  }, [period.id]);

  // Pilot mode: first 3 periods require supervised confirm
  const isFirstPeriods = (period.reopen_count || 0) === 0 && isPilotMode;

  const handlePublish = async () => {
    setConfirmPublish(false);
    setPublishNote("");
    setAcknowledgeWarnings(false);
    setSupervisedConfirm(false);
    await onPublish();
  };

  const handleGenerateTruthRecords = async () => {
    if (!onGenerateTruthRecords) return;
    setTruthGenerationState("loading");
    try {
      const ok = await onGenerateTruthRecords();
      setTruthGenerationState(ok ? "success" : "error");
    } catch {
      setTruthGenerationState("error");
    }
  };

  const handleReopen = () => {
    if (reopenReason.trim()) {
      onReopen(reopenReason);
      setShowReopenDialog(false);
      setReopenReason("");
    }
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  // Post-publish: show verification + receipt
  if (isPosted && closingReceipt) {
    return (
      <div className="space-y-6">
        {/* Post-publish verification */}
        {variances && (
          <PostPublishVerification
            closingReceipt={closingReceipt}
            finalRecords={finalRecords}
            variances={variances}
            employees={employees}
          />
        )}

        {/* Closing receipt */}
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Recibo de Cierre — {closingReceipt.period_label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Periodo:</span> {closingReceipt.period_start} → {closingReceipt.period_end}</div>
              <div><span className="text-muted-foreground">Publicado:</span> {new Date(closingReceipt.published_at).toLocaleString()}</div>
            </div>
            <Separator />
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {[
                { label: "Empleados", value: closingReceipt.total_employees },
                { label: "Turnos Prog.", value: closingReceipt.total_scheduled_shifts },
                { label: "Turnos Trab.", value: closingReceipt.total_worked_shifts },
                { label: "Filas Nómina", value: closingReceipt.total_payroll_rows },
              ].map(item => (
                <div key={item.label} className="text-center p-3 bg-background rounded-lg">
                  <div className="text-xl font-bold">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Horas Regular", value: `${closingReceipt.total_regular_hours?.toFixed(1)}h` },
                { label: "Horas OT", value: `${closingReceipt.total_overtime_hours?.toFixed(1)}h` },
                { label: "Pago Hourly", value: fmt(closingReceipt.total_hourly_pay || 0) },
                { label: "Pago Daily", value: fmt(closingReceipt.total_daily_pay || 0) },
                { label: "Pago Ride", value: fmt(closingReceipt.total_ride_pay || 0) },
                { label: "Ajustes Manual", value: fmt(closingReceipt.total_manual_adjustments || 0) },
              ].map(item => (
                <div key={item.label} className="text-center p-2 bg-muted/30 rounded">
                  <div className="font-mono font-semibold text-sm">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <div className="text-3xl font-bold text-primary font-mono">{fmt(closingReceipt.grand_total_posted || 0)}</div>
              <div className="text-sm text-muted-foreground font-medium">TOTAL PUBLICADO</div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          {!isLocked && (
            <Button onClick={onLock} variant="destructive" className="gap-2">
              <Lock className="h-4 w-4" /> Cerrar y Bloquear Periodo
            </Button>
          )}
          {isLocked && (
            <Button variant="outline" onClick={() => setShowReopenDialog(true)} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Reabrir Periodo
            </Button>
          )}
        </div>

        {period.reopen_count > 0 && (
          <Alert variant="default">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Periodo reabierto {period.reopen_count} vez(es)</AlertTitle>
            <AlertDescription>
              Última reapertura: {period.reopened_at ? new Date(period.reopened_at).toLocaleString() : "—"}.
              Razón: {period.reopen_reason || "—"}
            </AlertDescription>
          </Alert>
        )}

        <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-destructive" /> Reabrir Periodo Cerrado
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Esta acción reabrirá el periodo para revisión. Se registrará quién reabrió y por qué.
            </p>
            <Textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder="Razón de la reapertura (obligatorio)..." rows={3} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReopenDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleReopen} disabled={!reopenReason.trim()}>Reabrir Periodo</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Pre-Publish Review
  return (
    <div className="space-y-6">
      {/* Pilot mode banner */}
      {isPilotMode && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <Rocket className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">Modo Piloto Activo</AlertTitle>
          <AlertDescription className="text-amber-600 text-xs">
            Se requiere confirmación supervisada. Revisa todos los totales antes de publicar.
          </AlertDescription>
        </Alert>
      )}

      {/* Validation alerts */}
      {enhancedChecks.errors.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Bloqueos de publicación ({enhancedChecks.errors.length})</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              {enhancedChecks.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {enhancedChecks.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Advertencias ({enhancedChecks.warnings.length})</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              {enhancedChecks.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Truth handoff CTA (guaranteed visible for truth-based periods) */}
      {isTruthBasedPeriod && onGenerateTruthRecords && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Truth-based closure handoff
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              Genera los registros finales publicables desde la reconciliación Truth Validation.
            </p>
            <div className="flex flex-col items-start gap-1 md:items-end">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleGenerateTruthRecords}
                disabled={truthGenerationState === "loading" || isLocked}
              >
                {truthGenerationState === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                {truthGenerationState === "loading"
                  ? "Generando..."
                  : finalRecords.length > 0
                    ? "Regenerar Registros desde Truth"
                    : "Generar Registros desde Truth"}
              </Button>
              {truthGenerationState === "success" && (
                <p className="text-xs font-medium text-primary">Registros generados</p>
              )}
              {truthGenerationState === "error" && (
                <p className="text-xs font-medium text-destructive">Error al generar registros</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary KPIs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" /> Resumen Pre-Publicación — {period.period_label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: "Empleados", value: stats.totalEmployees, icon: User },
              { label: "Turnos Prog.", value: stats.totalScheduled, icon: Calendar },
              { label: "Turnos Trab.", value: stats.totalWorked, icon: Clock },
              { label: "Filas Nómina", value: stats.totalPayrollRows, icon: FileText },
              { label: "Aprobados", value: `${stats.approvedEmployees}/${stats.totalEmployees}`, icon: CheckCircle2 },
            ].map(item => (
              <div key={item.label} className="text-center p-3 bg-muted/30 rounded-lg">
                <item.icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-xl font-bold">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
          <Separator />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Horas Regular", value: `${stats.totalRegularHours.toFixed(1)}h` },
              { label: "Horas Overtime", value: `${stats.totalOvertimeHours.toFixed(1)}h` },
              { label: "Hourly Pay", value: fmt(stats.hourlyPay) },
              { label: "Daily Pay", value: fmt(stats.dailyPay) },
              { label: "Ride Pay", value: fmt(stats.ridePay) },
              { label: "Weekend Pay", value: fmt(stats.weekendPay) },
              { label: "Manual Adj.", value: fmt(stats.manualAdj) },
              { label: "TOTAL", value: fmt(stats.grandTotal), highlight: true },
            ].map(item => (
              <div key={item.label} className={`text-center p-3 rounded-lg ${(item as any).highlight ? "bg-primary/10 border-2 border-primary/30" : "bg-muted/30"}`}>
                <div className={`font-mono font-semibold ${(item as any).highlight ? "text-lg text-primary" : "text-sm"}`}>{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Employee summary table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Detalle por Empleado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Empleado</TableHead>
                  <TableHead className="text-xs text-center">Tipo</TableHead>
                  <TableHead className="text-xs text-right">Días/H.Reg</TableHead>
                  <TableHead className="text-xs text-right">H. OT</TableHead>
                  <TableHead className="text-xs text-right">Calc/Base</TableHead>
                  <TableHead className="text-xs text-right">Ref Payroll</TableHead>
                  <TableHead className="text-xs text-right">Ride</TableHead>
                  <TableHead className="text-xs text-right">Manual</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalRecords.map(r => {
                  const name = employees.get(r.employee_id) || "—";
                  const total = r.grand_total || r.final_total_pay || 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-medium">{name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {(r as any).shift_calculated_total > 0
                            ? ((r as any).shift_full_day_count > 0 ? "full_day" : r.pay_classification)
                            : r.pay_classification}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {(r as any).shift_full_day_count > 0
                          ? `${(r as any).shift_full_day_count}d`
                          : (r.regular_hours || 0).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{(r.overtime_hours || 0).toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {(r as any).shift_calculated_total > 0
                          ? fmt((r as any).shift_calculated_total)
                          : fmt(r.hourly_pay_total || r.base_pay || 0)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">{fmt(r.total_payroll_amount || 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(r.ride_pay_total || r.ride_amount || 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(r.manual_adjustment_total || r.manual_amount || 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{fmt(total)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.reconciliation_status === "approved" || r.reconciliation_status === "resolved" ? "default" : "destructive"} className="text-[10px]">
                          {r.reconciliation_status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Publish button */}
      <div className="flex justify-end gap-3">
        {canPublish ? (
          <Button onClick={() => setConfirmPublish(true)} className="gap-2" disabled={publishing}>
            <CheckCircle2 className="h-4 w-4" /> Publicar a Producción
          </Button>
        ) : period.status !== "approved" ? (
          <p className="text-sm text-muted-foreground">El periodo debe estar en estado "aprobado" para publicar.</p>
        ) : null}
      </div>

      {/* Enhanced confirm dialog with pilot safeguards */}
      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Confirmar Publicación
              {isPilotMode && <Badge variant="outline" className="text-[10px] gap-1"><Rocket className="h-2.5 w-2.5" /> Piloto</Badge>}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Se publicarán <strong>{stats.totalEmployees} empleados</strong> con un total de <strong>{fmt(stats.grandTotal)}</strong> a producción.
            Esta acción es idempotente — no se crearán duplicados.
          </p>

          {enhancedChecks.hasWarnings && (
            <div className="space-y-2">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {enhancedChecks.warnings.length} advertencia(s) no bloqueantes.
                </AlertDescription>
              </Alert>
              <div className="flex items-center space-x-2">
                <Checkbox id="ack-warnings" checked={acknowledgeWarnings} onCheckedChange={(v) => setAcknowledgeWarnings(!!v)} />
                <Label htmlFor="ack-warnings" className="text-xs">He revisado todas las advertencias y acepto publicar</Label>
              </div>
            </div>
          )}

          {isPilotMode && (
            <div className="flex items-center space-x-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20">
              <Checkbox id="supervised" checked={supervisedConfirm} onCheckedChange={(v) => setSupervisedConfirm(!!v)} />
              <Label htmlFor="supervised" className="text-xs text-amber-700 dark:text-amber-400">
                Confirmo que esta publicación fue supervisada (modo piloto)
              </Label>
            </div>
          )}

          <div>
            <Label className="text-xs">Nota de publicación (opcional)</Label>
            <Textarea value={publishNote} onChange={e => setPublishNote(e.target.value)} placeholder="Ej: Primer cierre semanal real..." rows={2} className="mt-1" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(false)}>Cancelar</Button>
            <Button
              onClick={handlePublish}
              disabled={
                publishing ||
                (enhancedChecks.hasWarnings && !acknowledgeWarnings) ||
                (isPilotMode && !supervisedConfirm)
              }
            >
              {publishing ? "Publicando..." : "Confirmar Publicación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
