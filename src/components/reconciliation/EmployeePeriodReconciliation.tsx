import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  User, Calendar, Clock, DollarSign, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, ArrowRight, Link2, Unlink, Tag, Trash2, FileText,
  ShieldCheck, ShieldAlert, Info,
} from "lucide-react";
import type { EmployeeFinalRecord } from "@/hooks/useReconciliationPeriod";

interface Props {
  companyId: string | null;
  periodStatusId: string;
  finalRecords: EmployeeFinalRecord[];
  onRefresh: () => void;
  onSaveMapping: (type: string, source: string, targetId: string, targetValue: string) => void;
}

const PAY_TYPES = [
  { value: "hourly", label: "Por hora" },
  { value: "daily", label: "Diario" },
  { value: "pay_ride", label: "Pay Ride" },
  { value: "weekend_job", label: "Weekend Job" },
  { value: "manual_adjustment", label: "Ajuste Manual" },
  { value: "mixed", label: "Mixto" },
  { value: "unknown", label: "Desconocido" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "destructive",
  partial: "secondary",
  resolved: "default",
  approved: "default",
  posted: "outline",
};

type CompStatus = "match" | "close_match" | "mismatch" | "needs_review";

interface CompValidation {
  configuredDailyRate: number | null;
  configuredHalfRate: number | null;
  expectedTotal: number;
  shiftCalcTotal: number;
  variance: number;
  variancePct: number;
  status: CompStatus;
  reason: string;
}

export default function EmployeePeriodReconciliation({ companyId, periodStatusId, finalRecords, onRefresh, onSaveMapping }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Map<string, string>>(new Map());
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{ record: EmployeeFinalRecord; action: string } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(new Set());
  const [compProfiles, setCompProfiles] = useState<Map<string, { daily: number | null; half: number | null }>>(new Map());

  useEffect(() => {
    if (!companyId) return;
    supabase.from("employees").select("id, first_name, last_name").eq("company_id", companyId)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data || []).forEach(e => map.set(e.id, `${e.first_name} ${e.last_name}`));
        setEmployees(map);
      });
    // Fetch active compensation profiles
    supabase.from("compensation_profiles").select("employee_id, default_daily_rate, default_half_day_rate")
      .eq("company_id", companyId).eq("is_active", true)
      .then(({ data }) => {
        const map = new Map<string, { daily: number | null; half: number | null }>();
        (data || []).forEach(p => map.set(p.employee_id, { daily: p.default_daily_rate, half: p.default_half_day_rate }));
        setCompProfiles(map);
      });
  }, [companyId]);

  const toggleExpand = (empId: string) => {
    setExpandedEmp(prev => prev === empId ? null : empId);
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (bulkSelection.size === finalRecords.length) {
      setBulkSelection(new Set());
    } else {
      setBulkSelection(new Set(finalRecords.map(r => r.id)));
    }
  };

  const updateRecordStatus = async (recordId: string, status: string, notes?: string) => {
    await supabase.from("reconciliation_final_records" as any)
      .update({
        reconciliation_status: status,
        resolution_notes: notes || null,
        approved_by: status === "approved" ? user?.id : null,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", recordId);
    onRefresh();
  };

  const updatePayClassification = async (recordId: string, classification: string) => {
    await supabase.from("reconciliation_final_records" as any)
      .update({ pay_classification: classification, updated_at: new Date().toISOString() } as any)
      .eq("id", recordId);
    onRefresh();
  };

  const logAction = async (record: EmployeeFinalRecord, actionType: string, data?: any) => {
    if (!companyId || !user?.id) return;
    await supabase.from("reconciliation_row_actions" as any).insert({
      company_id: companyId,
      period_status_id: periodStatusId,
      employee_id: record.employee_id,
      action_type: actionType,
      action_data: data || {},
      reason: actionNote,
      performed_by: user.id,
    } as any);
  };

  const handleAction = async () => {
    if (!actionDialog) return;
    const { record, action } = actionDialog;
    await logAction(record, action, { note: actionNote });

    if (action === "approve") {
      await updateRecordStatus(record.id, "approved", actionNote);
    } else if (action === "mark_manual") {
      await updatePayClassification(record.id, "manual_adjustment");
      await updateRecordStatus(record.id, "resolved", actionNote || "Marked as manual adjustment");
    } else if (action === "mark_not_worked") {
      await supabase.from("reconciliation_final_records" as any)
        .update({ total_worked_hours: 0, reconciliation_status: "resolved", resolution_notes: actionNote || "Not worked" } as any)
        .eq("id", record.id);
      onRefresh();
    } else if (action === "ignore") {
      await updateRecordStatus(record.id, "resolved", actionNote || "Ignored");
    }

    setActionDialog(null);
    setActionNote("");
    toast({ title: "Acción registrada" });
  };

  // Bulk actions
  const bulkApprove = async () => {
    for (const id of bulkSelection) {
      await supabase.from("reconciliation_final_records" as any)
        .update({ reconciliation_status: "approved", approved_by: user?.id, approved_at: new Date().toISOString() } as any)
        .eq("id", id);
    }
    setBulkSelection(new Set());
    onRefresh();
    toast({ title: `${bulkSelection.size} registros aprobados` });
  };

  const bulkClassify = async (classification: string) => {
    for (const id of bulkSelection) {
      await supabase.from("reconciliation_final_records" as any)
        .update({ pay_classification: classification } as any)
        .eq("id", id);
    }
    setBulkSelection(new Set());
    onRefresh();
    toast({ title: `${bulkSelection.size} registros clasificados como ${classification}` });
  };

  const resolvedCount = finalRecords.filter(r => ["resolved", "approved", "posted"].includes(r.reconciliation_status)).length;
  const pendingCount = finalRecords.filter(r => r.reconciliation_status === "pending" || r.reconciliation_status === "partial").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {resolvedCount} resueltos</Badge>
          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {pendingCount} pendientes</Badge>
          <Badge variant="secondary">{finalRecords.length} empleados</Badge>
        </div>
        {bulkSelection.size > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground">{bulkSelection.size} seleccionados</span>
            <Button size="sm" variant="default" onClick={bulkApprove}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
            </Button>
            <Select onValueChange={bulkClassify}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Clasificar como..." />
              </SelectTrigger>
              <SelectContent>
                {PAY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {finalRecords.length === 0 ? (
        <EmptyState icon={User} title="Sin registros" description="Genera los registros finales desde el flujo de periodo." />
      ) : (
        <div className="space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            <div className="col-span-1 flex items-center">
              <input type="checkbox" checked={bulkSelection.size === finalRecords.length} onChange={selectAll} className="rounded" />
            </div>
            <div className="col-span-3">Empleado</div>
            <div className="col-span-1 text-center">Días</div>
            <div className="col-span-1 text-center">H. Trab.</div>
            <div className="col-span-1 text-center">Calc $</div>
            <div className="col-span-1 text-center">Payroll $</div>
            <div className="col-span-1 text-center">Tipo</div>
            <div className="col-span-1 text-center">Conflictos</div>
            <div className="col-span-2 text-right">Estado</div>
          </div>

          {finalRecords.map(record => {
            const name = employees.get(record.employee_id) || "Desconocido";
            const isExpanded = expandedEmp === record.employee_id;
            const hasHoursIssue = Math.abs(record.total_scheduled_hours - record.total_worked_hours) > 1;

            return (
              <Card key={record.id} className={record.conflict_count > 0 ? "border-destructive/30" : ""}>
                <div
                  className="grid grid-cols-12 gap-2 px-3 py-3 items-center cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(record.employee_id)}
                >
                  <div className="col-span-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={bulkSelection.has(record.id)} onChange={() => toggleBulkSelect(record.id)} className="rounded" />
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="col-span-3 font-medium text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> {name}
                  </div>
                  <div className="col-span-1 text-center text-sm font-mono">
                    {(record as any).shift_full_day_count > 0 || (record as any).shift_half_day_count > 0
                      ? `${(record as any).shift_full_day_count || 0}d${(record as any).shift_half_day_count > 0 ? `+${(record as any).shift_half_day_count}½` : ""}`
                      : `${record.total_scheduled_hours}h`}
                  </div>
                  <div className={`col-span-1 text-center text-sm font-mono ${Math.abs(record.total_scheduled_hours - record.total_worked_hours) > 1 ? "text-destructive font-semibold" : ""}`}>
                    {record.total_worked_hours}
                  </div>
                  <div className="col-span-1 text-center text-sm font-mono font-semibold">
                    {(record as any).shift_calculated_total > 0
                      ? `$${(record as any).shift_calculated_total}`
                      : `$${record.grand_total || record.final_total_pay}`}
                  </div>
                  <div className="col-span-1 text-center text-sm font-mono text-muted-foreground">
                    ${record.total_payroll_amount || 0}
                  </div>
                  <div className="col-span-1 text-center">
                    <Badge variant="outline" className="text-xs">
                      {(record as any).shift_calculated_total > 0
                        ? ((record as any).shift_full_day_count > 0 ? "full_day" : record.pay_classification)
                        : record.pay_classification}
                    </Badge>
                  </div>
                  <div className="col-span-1 text-center">
                    {record.conflict_count > 0 ? (
                      <Badge variant="destructive" className="text-xs">{record.conflict_count}</Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                  <div className="col-span-2 text-right">
                    <Badge variant={STATUS_COLORS[record.reconciliation_status] as any || "outline"} className="text-xs">
                      {record.reconciliation_status}
                    </Badge>
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 space-y-4">
                    <Separator />
                    {/* Scheduled Shifts */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Turnos Programados ({record.scheduled_shifts.length})
                      </h4>
                      {record.scheduled_shifts.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1 text-xs">
                          {record.scheduled_shifts.map((s: any, i: number) => (
                            <div key={i} className="p-2 bg-muted/50 rounded-md">
                              <div className="font-medium">{s.date}</div>
                              <div className="text-muted-foreground">{s.hours}h — {s.title || "—"}</div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground">Sin turnos programados</p>}
                    </div>

                    {/* Clock Records */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Fichajes ({record.worked_shifts.length})
                      </h4>
                      {record.worked_shifts.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1 text-xs">
                          {record.worked_shifts.map((c: any, i: number) => (
                            <div key={i} className="p-2 bg-muted/50 rounded-md">
                              <div className="font-medium">{c.date}</div>
                              <div className="text-muted-foreground">{c.hours}h</div>
                              {c.clock_in && <div className="text-muted-foreground">{c.clock_in?.substring(11, 16)} → {c.clock_out?.substring(11, 16)}</div>}
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground">Sin fichajes</p>}
                    </div>

                    {/* Payroll Rows */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Nómina ({record.payroll_rows.length})
                      </h4>
                      {record.payroll_rows.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs">Horas</TableHead>
                              <TableHead className="text-xs">Pago</TableHead>
                              <TableHead className="text-xs">Tipo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {record.payroll_rows.map((p: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{p.date || "—"}</TableCell>
                                <TableCell className="text-xs font-mono">{p.hours ?? "—"}</TableCell>
                                <TableCell className="text-xs font-mono font-semibold">${p.pay ?? 0}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{p.type || "?"}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : <p className="text-xs text-muted-foreground">Sin datos de nómina</p>}
                    </div>

                    {/* Summary — shift-calc primary */}
                    {(record as any).shift_calculated_total > 0 ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-5 gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Full Days</div>
                            <div className="font-mono font-semibold text-sm">{(record as any).shift_full_day_count || 0} × ${(record as any).shift_daily_rate_used || "?"}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Half Days</div>
                            <div className="font-mono text-sm">{(record as any).shift_half_day_count || 0} × ${(record as any).shift_half_day_rate_used || "?"}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Ride</div>
                            <div className="font-mono text-sm">${record.ride_amount}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Manual</div>
                            <div className="font-mono text-sm">${record.manual_amount}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-primary font-bold">TOTAL CALC</div>
                            <div className="font-mono font-bold text-sm text-primary">${record.grand_total || record.final_total_pay}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-lg p-2 text-[11px]">
                          <div className="text-center">
                            <div className="text-muted-foreground">Referencia Payroll</div>
                            <div className="font-mono font-medium text-muted-foreground">${record.total_payroll_amount || 0}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-muted-foreground">Diferencia</div>
                            <div className={`font-mono font-medium ${Math.abs((record as any).shift_vs_payroll_diff || 0) > 10 ? "text-destructive" : "text-muted-foreground"}`}>
                              {((record as any).shift_vs_payroll_diff || 0) >= 0 ? "+" : ""}${(record as any).shift_vs_payroll_diff || 0}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-muted-foreground">Fuente</div>
                            <div className="font-mono truncate">{(record as any).shift_calculation_source?.split(":")[0] || "—"}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 gap-3 bg-muted/30 rounded-lg p-3">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Base</div>
                          <div className="font-mono font-semibold text-sm">${record.base_pay}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Ride</div>
                          <div className="font-mono text-sm">${record.ride_amount}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Weekend</div>
                          <div className="font-mono text-sm">${record.weekend_amount}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Manual</div>
                          <div className="font-mono text-sm">${record.manual_amount}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground font-bold">TOTAL</div>
                          <div className="font-mono font-bold text-sm text-primary">${record.final_total_pay}</div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      <Select value={record.pay_classification} onValueChange={(v) => updatePayClassification(record.id, v)}>
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      {record.reconciliation_status !== "approved" && (
                        <Button size="sm" variant="default" className="h-8 text-xs" onClick={() => setActionDialog({ record, action: "approve" })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Aprobar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setActionDialog({ record, action: "mark_manual" })}>
                        <FileText className="h-3 w-3 mr-1" /> Manual
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setActionDialog({ record, action: "mark_not_worked" })}>
                        <XCircle className="h-3 w-3 mr-1" /> No trabajó
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setActionDialog({ record, action: "ignore" })}>
                        <Trash2 className="h-3 w-3 mr-1" /> Ignorar
                      </Button>
                    </div>

                    {record.resolution_notes && (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                        <strong>Nota:</strong> {record.resolution_notes}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => { setActionDialog(null); setActionNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.action === "approve" && "Aprobar Reconciliación"}
              {actionDialog?.action === "mark_manual" && "Marcar como Ajuste Manual"}
              {actionDialog?.action === "mark_not_worked" && "Marcar como No Trabajado"}
              {actionDialog?.action === "ignore" && "Ignorar Registro"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Empleado: <strong>{actionDialog ? employees.get(actionDialog.record.employee_id) : ""}</strong>
            </p>
            <Textarea
              placeholder="Nota o razón (opcional)..."
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setActionNote(""); }}>Cancelar</Button>
            <Button onClick={handleAction}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
