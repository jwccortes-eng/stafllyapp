import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, AlertTriangle, XCircle, Shield, User, DollarSign,
  Clock, Calendar, FileText, RotateCcw, Lock,
} from "lucide-react";
import type { EmployeeFinalRecord, PeriodStatus, ClosingReceipt } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  closingReceipt: ClosingReceipt | null;
  employees: Map<string, string>;
  validation: { canPublish: boolean; errors: string[]; warnings: string[] };
  onPublish: () => Promise<boolean | void>;
  onLock: () => void;
  onReopen: (reason: string) => void;
  publishing?: boolean;
}

export default function PrePublishReview({
  period, finalRecords, closingReceipt, employees, validation,
  onPublish, onLock, onReopen, publishing,
}: Props) {
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);

  const stats = useMemo(() => {
    const approved = finalRecords.filter(r => ["resolved", "approved"].includes(r.reconciliation_status));
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
    };
  }, [finalRecords]);

  const isPosted = ["posted", "locked"].includes(period.status);
  const isLocked = period.status === "locked";
  const canPublish = period.status === "approved" && validation.canPublish && !period.publish_idempotency_key;

  const handlePublish = async () => {
    setConfirmPublish(false);
    await onPublish();
  };

  const handleReopen = () => {
    if (reopenReason.trim()) {
      onReopen(reopenReason);
      setShowReopenDialog(false);
      setReopenReason("");
    }
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  // ── Show closing receipt if already posted ──
  if (isPosted && closingReceipt) {
    return (
      <div className="space-y-6">
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

        {/* Reopen dialog */}
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
            <Textarea
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="Razón de la reapertura (obligatorio)..."
              rows={3}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReopenDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleReopen} disabled={!reopenReason.trim()}>
                Reabrir Periodo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Pre-Publish Review ──
  return (
    <div className="space-y-6">
      {/* Validation alerts */}
      {validation.errors.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Bloqueos de publicación</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {validation.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Advertencias</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
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

          {/* Payment breakdown */}
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
              <div key={item.label} className={`text-center p-3 rounded-lg ${
                (item as any).highlight ? "bg-primary/10 border-2 border-primary/30" : "bg-muted/30"
              }`}>
                <div className={`font-mono font-semibold ${(item as any).highlight ? "text-lg text-primary" : "text-sm"}`}>
                  {item.value}
                </div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Employee-by-employee summary table */}
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
                  <TableHead className="text-xs text-right">H. Reg</TableHead>
                  <TableHead className="text-xs text-right">H. OT</TableHead>
                  <TableHead className="text-xs text-right">Hourly</TableHead>
                  <TableHead className="text-xs text-right">Daily</TableHead>
                  <TableHead className="text-xs text-right">Ride</TableHead>
                  <TableHead className="text-xs text-right">Manual</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-center">Estado</TableHead>
                  <TableHead className="text-xs text-center">Avisos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalRecords.map(r => {
                  const name = employees.get(r.employee_id) || "—";
                  const total = r.grand_total || r.final_total_pay || 0;
                  const w = r.warnings || [];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-medium">{name}</TableCell>
                      <TableCell className="text-center"><Badge variant="outline" className="text-[10px]">{r.pay_classification}</Badge></TableCell>
                      <TableCell className="text-xs text-right font-mono">{(r.regular_hours || 0).toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{(r.overtime_hours || 0).toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(r.hourly_pay_total || r.base_pay || 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(r.daily_pay_total || 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(r.ride_pay_total || r.ride_amount || 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(r.manual_adjustment_total || r.manual_amount || 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{fmt(total)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.reconciliation_status === "approved" || r.reconciliation_status === "resolved" ? "default" : "destructive"} className="text-[10px]">
                          {r.reconciliation_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {w.length > 0 ? (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> {w.length}
                          </Badge>
                        ) : "—"}
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

      {/* Confirm publish dialog */}
      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Confirmar Publicación
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Se publicarán <strong>{stats.totalEmployees} empleados</strong> con un total de <strong>{fmt(stats.grandTotal)}</strong> a producción.
            Esta acción es idempotente — no se crearán duplicados.
          </p>
          {validation.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {validation.warnings.length} advertencia(s) no bloqueantes.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(false)}>Cancelar</Button>
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publicando..." : "Confirmar Publicación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
