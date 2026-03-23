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

  const getCompValidation = useCallback((record: EmployeeFinalRecord): CompValidation | null => {
    const fullDays = (record as any).shift_full_day_count || 0;
    const halfDays = (record as any).shift_half_day_count || 0;
    if (fullDays === 0 && halfDays === 0) return null;

    const profile = compProfiles.get(record.employee_id);
    const configuredDaily = profile?.daily ?? null;
    const configuredHalf = profile?.half ?? null;
    const rateUsed = (record as any).shift_daily_rate_used ?? null;
    const halfRateUsed = (record as any).shift_half_day_rate_used ?? null;
    const shiftCalcTotal = (record as any).shift_calculated_total || 0;

    if (configuredDaily === null && configuredHalf === null) {
      return { configuredDailyRate: null, configuredHalfRate: null, expectedTotal: 0, shiftCalcTotal, variance: 0, variancePct: 0, status: "needs_review", reason: "Falta tarifa configurada" };
    }

    const expectedTotal = (fullDays * (configuredDaily ?? 0)) + (halfDays * (configuredHalf ?? 0));
    const variance = expectedTotal - shiftCalcTotal;
    const variancePct = shiftCalcTotal > 0 ? (variance / shiftCalcTotal) * 100 : (expectedTotal > 0 ? 100 : 0);
    const absDiff = Math.abs(variance);

    let status: CompStatus = "needs_review";
    let reason = "";

    if (configuredDaily !== null && rateUsed !== null && Math.abs(configuredDaily - rateUsed) > 0.01) {
      status = "mismatch";
      reason = `Tarifa config ($${configuredDaily}) ≠ usada ($${rateUsed})`;
    } else if (absDiff <= 1) {
      status = "match";
      reason = "Coincidencia exacta";
    } else if (Math.abs(variancePct) <= 5) {
      status = "close_match";
      reason = `Dentro de tolerancia (${variancePct.toFixed(1)}%)`;
    } else {
      status = "mismatch";
      reason = `Diferencia: $${variance.toFixed(0)} (${variancePct.toFixed(1)}%)`;
    }

    return { configuredDailyRate: configuredDaily, configuredHalfRate: configuredHalf, expectedTotal, shiftCalcTotal, variance, variancePct, status, reason };
  }, [compProfiles]);

  const compStats = useMemo(() => {
    let match = 0, close = 0, mismatch = 0, review = 0, noShift = 0;
    finalRecords.forEach(r => {
      const v = getCompValidation(r);
      if (!v) { noShift++; return; }
      if (v.status === "match") match++;
      else if (v.status === "close_match") close++;
      else if (v.status === "mismatch") mismatch++;
      else review++;
    });
    return { match, close, mismatch, review, noShift };
  }, [finalRecords, getCompValidation]);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {resolvedCount} resueltos</Badge>
          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {pendingCount} pendientes</Badge>
          <Badge variant="secondary">{finalRecords.length} empleados</Badge>
          <Separator orientation="vertical" className="h-5" />
          <Badge variant="default" className="gap-1 bg-earning/15 text-earning border-earning/30"><ShieldCheck className="h-3 w-3" /> {compStats.match} match</Badge>
          {compStats.close > 0 && <Badge variant="warning" className="gap-1">{compStats.close} cercano</Badge>}
          {compStats.mismatch > 0 && <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" /> {compStats.mismatch} mismatch</Badge>}
          {compStats.review > 0 && <Badge variant="secondary" className="gap-1">{compStats.review} sin tarifa</Badge>}
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
          <div className="grid grid-cols-16 gap-1 px-3 py-2 text-[10px] font-medium text-muted-foreground border-b uppercase tracking-wider">
            <div className="col-span-1 flex items-center">
              <input type="checkbox" checked={bulkSelection.size === finalRecords.length} onChange={selectAll} className="rounded" />
            </div>
            <div className="col-span-2">Empleado</div>
            <div className="col-span-1 text-center">Días</div>
            <div className="col-span-1 text-center">H. Trab.</div>
            <div className="col-span-1 text-center">Calc $</div>
            <div className="col-span-1 text-center">Payroll $</div>
            <div className="col-span-1 text-center">Tipo</div>
            <div className="col-span-1 text-center">Tarifa</div>
            <div className="col-span-1 text-center">Esperado</div>
            <div className="col-span-1 text-center">Varianza</div>
            <div className="col-span-1 text-center">Comp.</div>
            <div className="col-span-1 text-center">Conflictos</div>
            <div className="col-span-2 text-right">Estado</div>
          </div>

          {finalRecords.map(record => {
            const name = employees.get(record.employee_id) || "Desconocido";
            const isExpanded = expandedEmp === record.employee_id;
            const comp = getCompValidation(record);

            const compStatusIcon = comp ? {
              match: <ShieldCheck className="h-3.5 w-3.5 text-earning" />,
              close_match: <ShieldCheck className="h-3.5 w-3.5 text-warning" />,
              mismatch: <ShieldAlert className="h-3.5 w-3.5 text-destructive" />,
              needs_review: <Info className="h-3.5 w-3.5 text-muted-foreground" />,
            }[comp.status] : null;

            return (
              <Card key={record.id} className={comp?.status === "mismatch" ? "border-destructive/30" : record.conflict_count > 0 ? "border-warning/30" : ""}>
                <div
                  className="grid grid-cols-16 gap-1 px-3 py-3 items-center cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(record.employee_id)}
                >
                  <div className="col-span-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={bulkSelection.has(record.id)} onChange={() => toggleBulkSelect(record.id)} className="rounded" />
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="col-span-2 font-medium text-xs flex items-center gap-1 truncate">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {name}
                  </div>
                  <div className="col-span-1 text-center text-xs font-mono">
                    {(record as any).shift_full_day_count > 0 || (record as any).shift_half_day_count > 0
                      ? `${(record as any).shift_full_day_count || 0}d${(record as any).shift_half_day_count > 0 ? `+${(record as any).shift_half_day_count}½` : ""}`
                      : `${record.total_scheduled_hours}h`}
                  </div>
                  <div className={`col-span-1 text-center text-xs font-mono ${Math.abs(record.total_scheduled_hours - record.total_worked_hours) > 1 ? "text-destructive font-semibold" : ""}`}>
                    {record.total_worked_hours}
                  </div>
                  <div className="col-span-1 text-center text-xs font-mono font-semibold">
                    {(record as any).shift_calculated_total > 0
                      ? `$${(record as any).shift_calculated_total}`
                      : `$${record.grand_total || record.final_total_pay}`}
                  </div>
                  <div className="col-span-1 text-center text-xs font-mono text-muted-foreground">
                    ${record.total_payroll_amount || 0}
                  </div>
                  <div className="col-span-1 text-center">
                    <Badge variant="outline" className="text-[10px]">
                      {(record as any).shift_calculated_total > 0
                        ? ((record as any).shift_full_day_count > 0 ? "full_day" : record.pay_classification)
                        : record.pay_classification}
                    </Badge>
                  </div>
                  {/* Tarifa configurada */}
                  <div className="col-span-1 text-center text-xs font-mono">
                    {comp?.configuredDailyRate != null ? (
                      <span className={comp.configuredDailyRate !== ((record as any).shift_daily_rate_used ?? comp.configuredDailyRate) ? "text-destructive font-semibold" : ""}>
                        ${comp.configuredDailyRate}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                  {/* Esperado */}
                  <div className="col-span-1 text-center text-xs font-mono">
                    {comp ? `$${comp.expectedTotal}` : "—"}
                  </div>
                  {/* Varianza */}
                  <div className="col-span-1 text-center text-xs font-mono">
                    {comp ? (
                      <span className={Math.abs(comp.variance) > 1 ? (comp.variance > 0 ? "text-earning" : "text-destructive") : "text-muted-foreground"}>
                        {comp.variance >= 0 ? "+" : ""}${comp.variance.toFixed(0)}
                      </span>
                    ) : "—"}
                  </div>
                  {/* Comp status */}
                  <div className="col-span-1 text-center">
                    {comp ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-0.5 cursor-help">
                            {compStatusIcon}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[200px]">{comp.reason}</TooltipContent>
                      </Tooltip>
                    ) : <span className="text-[10px] text-muted-foreground">n/a</span>}
                  </div>
                  <div className="col-span-1 text-center">
                    {record.conflict_count > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">{record.conflict_count}</Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                  <div className="col-span-2 text-right">
                    <Badge variant={STATUS_COLORS[record.reconciliation_status] as any || "outline"} className="text-[10px]">
                      {record.reconciliation_status}
                    </Badge>
                  </div>
                </div>

                {isExpanded && (() => {
                  const sysTotal = (record as any).shift_calculated_total > 0
                    ? (record.grand_total || record.final_total_pay)
                    : record.final_total_pay;
                  const payRef = record.total_payroll_amount || 0;
                  const variance = sysTotal - payRef;
                  const absVar = Math.abs(variance);
                  const payrollRefHours = record.payroll_rows.reduce((s: number, p: any) => s + Number(p.hours || 0), 0);
                  const hasShiftCalc = (record as any).shift_calculated_total > 0;

                  return (
                  <CardContent className="pt-0 pb-5 space-y-4">
                    <Separator />

                    {/* ═══ AT-A-GLANCE: Plain-language summary ═══ */}
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider mb-3">
                        Resumen del Periodo — Vista Rápida
                      </h4>
                      <div className="space-y-1.5">
                        {/* Each row: label → value */}
                        <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                          <span className="text-xs text-muted-foreground">📅 Turnos programados en el periodo</span>
                          <span className="text-sm font-semibold font-mono">{record.scheduled_shifts.length} turnos · {record.total_scheduled_hours}h</span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                          <span className="text-xs text-muted-foreground">⏱ Total horas fichadas en el periodo</span>
                          <span className="text-sm font-semibold font-mono">{record.total_worked_hours}h</span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                          <span className="text-xs text-muted-foreground">📄 Referencia nómina importada (horas)</span>
                          <span className="text-sm font-mono text-muted-foreground">
                            {payrollRefHours > 0 ? `${payrollRefHours.toFixed(1)}h` : "—"}
                            <span className="text-[10px] ml-1">(suma de {record.payroll_rows.length} fila{record.payroll_rows.length !== 1 ? "s" : ""})</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                          <span className="text-xs text-muted-foreground">📄 Referencia nómina importada (monto)</span>
                          <span className="text-sm font-mono text-muted-foreground">${payRef.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-border/30">
                          <span className="text-xs text-foreground font-semibold">💰 Propuesta calculada por el sistema</span>
                          <span className="text-sm font-bold font-mono text-primary">${sysTotal.toLocaleString()}</span>
                        </div>
                        <div className={`flex items-center justify-between py-2 rounded-lg px-2 -mx-2 ${absVar > 10 ? "bg-destructive/[0.06]" : absVar > 0 ? "bg-warning/[0.06]" : "bg-earning/[0.06]"}`}>
                          <span className={`text-xs font-semibold ${absVar > 10 ? "text-destructive" : absVar > 0 ? "text-warning" : "text-earning"}`}>
                            {absVar <= 1 ? "✅" : absVar <= 10 ? "⚠️" : "🔴"} Diferencia vs referencia nómina
                          </span>
                          <span className={`text-sm font-bold font-mono ${absVar > 10 ? "text-destructive" : absVar > 0 ? "text-warning" : "text-earning"}`}>
                            {variance >= 0 ? "+" : ""}${variance.toFixed(0)}
                            <span className="text-[10px] font-normal ml-1">
                              {absVar <= 1 ? "Match exacto" : absVar <= 10 ? "Tolerancia" : "Revisar"}
                            </span>
                          </span>
                        </div>
                      </div>
                      {hasShiftCalc && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Cálculo basado en {(record as any).shift_full_day_count || 0} día(s) completo(s) × ${(record as any).shift_daily_rate_used || "?"}
                          {((record as any).shift_half_day_count || 0) > 0 && ` + ${(record as any).shift_half_day_count} medio(s) día`}
                          {(record.ride_amount > 0) && ` + $${record.ride_amount} transporte`}
                          {(record.manual_amount > 0) && ` + $${record.manual_amount} ajuste manual`}
                        </p>
                      )}
                    </div>

                    {/* ═══ DETAIL SECTIONS — collapsible for power users ═══ */}

                    {/* Scheduled Shifts detail */}
                    {record.scheduled_shifts.length > 0 && (
                      <details className="group">
                        <summary className="flex items-center justify-between cursor-pointer py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Detalle de Turnos Programados</span>
                          <Badge variant="secondary" className="text-[10px]">{record.scheduled_shifts.length} turnos</Badge>
                        </summary>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                          {record.scheduled_shifts.map((s: any, i: number) => (
                            <div key={i} className="p-2.5 bg-muted/40 rounded-lg border border-border/30">
                              <div className="font-semibold text-xs">{s.date}</div>
                              <div className="text-[11px] text-muted-foreground">{s.title || "Sin título"}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">{s.hours}h este turno</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Clock entries detail */}
                    {record.worked_shifts.length > 0 && (
                      <details className="group">
                        <summary className="flex items-center justify-between cursor-pointer py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Detalle de Fichajes</span>
                          <Badge variant="secondary" className="text-[10px]">{record.worked_shifts.length} fichaje(s) · {record.total_worked_hours}h total periodo</Badge>
                        </summary>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                          {record.worked_shifts.map((c: any, i: number) => (
                            <div key={i} className="p-2.5 bg-muted/40 rounded-lg border border-border/30">
                              <div className="font-semibold text-xs">{c.date}</div>
                              <div className="text-[11px] font-mono font-medium">{c.hours}h este fichaje</div>
                              {c.clock_in && (
                                <div className="text-[10px] text-muted-foreground">
                                  {c.clock_in?.substring(11, 16)} → {c.clock_out?.substring(11, 16)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Payroll reference detail */}
                    {record.payroll_rows.length > 0 && (
                      <details className="group">
                        <summary className="flex items-center justify-between cursor-pointer py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                          <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Detalle de Nómina Importada</span>
                          <Badge variant="outline" className="text-[10px]">{record.payroll_rows.length} fila(s) · ${payRef} total</Badge>
                        </summary>
                        <div className="mt-2 rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="text-[10px] font-semibold uppercase">Fecha</TableHead>
                                <TableHead className="text-[10px] font-semibold uppercase">Horas (esta fila)</TableHead>
                                <TableHead className="text-[10px] font-semibold uppercase">Monto (esta fila)</TableHead>
                                <TableHead className="text-[10px] font-semibold uppercase">Tipo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {record.payroll_rows.map((p: any, i: number) => (
                                <TableRow key={i} className="text-xs">
                                  <TableCell className="font-mono">{p.date || "—"}</TableCell>
                                  <TableCell className="font-mono">{p.hours ?? "—"}</TableCell>
                                  <TableCell className="font-mono font-semibold">${p.pay ?? 0}</TableCell>
                                  <TableCell><Badge variant="outline" className="text-[10px]">{p.type || "?"}</Badge></TableCell>
                                </TableRow>
                              ))}
                              {record.payroll_rows.length > 1 && (
                                <TableRow className="bg-muted/20 font-semibold">
                                  <TableCell className="text-[10px] uppercase">Total Referencia</TableCell>
                                  <TableCell className="font-mono">{payrollRefHours.toFixed(1)}h</TableCell>
                                  <TableCell className="font-mono">${payRef}</TableCell>
                                  <TableCell />
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                          <p className="text-[10px] text-muted-foreground px-3 py-1.5 bg-muted/20">
                            ⓘ Cada fila es un registro individual del archivo importado. Las horas y montos son por fila, no totales del periodo.
                          </p>
                        </div>
                      </details>
                    )}

                    {/* System calculation breakdown — component-level for mixed compensation */}
                    <details className="group" open>
                      <summary className="flex items-center justify-between cursor-pointer py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                        <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Desglose del Cálculo del Sistema</span>
                        <Badge variant="default" className="text-[10px]">${sysTotal.toLocaleString()}</Badge>
                      </summary>
                      <div className="mt-2">
                        {(() => {
                          const hourlyPay = Number((record as any).hourly_pay_total) || 0;
                          const dailyPay = Number((record as any).daily_pay_total) || 0;
                          const weekendPay = Number(record.weekend_amount) || 0;
                          const ridePay = Number(record.ride_amount) || Number((record as any).ride_pay_total) || 0;
                          const manualAdj = Number(record.manual_amount) || Number((record as any).manual_adjustment_total) || 0;
                          const shiftCalcVal = Number((record as any).shift_calculated_total) || 0;
                          const fullDays = (record as any).shift_full_day_count || 0;
                          const halfDays = (record as any).shift_half_day_count || 0;
                          const dailyRate = (record as any).shift_daily_rate_used;
                          const halfRate = (record as any).shift_half_day_rate_used;
                          const hourlyRate = (record as any).hourly_rate || 0;
                          const workedHours = record.total_worked_hours || 0;

                          // Determine if mixed: has hourly AND daily/shift components
                          const isMixed = hourlyPay > 0 && (dailyPay > 0 || weekendPay > 0 || shiftCalcVal > 0);
                          const hasHourly = hourlyPay > 0;
                          const hasDaily = dailyPay > 0 || weekendPay > 0 || (shiftCalcVal > 0 && fullDays > 0);

                          // Build component rows for display
                          const components: { label: string; sublabel: string; value: number; highlight?: boolean }[] = [];

                          if (hasHourly) {
                            components.push({
                              label: "Pago por Hora (Base)",
                              sublabel: hourlyRate > 0 ? `${workedHours}h × $${hourlyRate}` : `${workedHours}h trabajadas`,
                              value: hourlyPay,
                            });
                          }

                          if (hasDaily || shiftCalcVal > 0) {
                            if (fullDays > 0 && dailyRate) {
                              components.push({
                                label: "Pago por Día",
                                sublabel: `${fullDays} día(s) × $${dailyRate}${halfDays > 0 ? ` + ${halfDays} medio(s) × $${halfRate || "?"}` : ""}`,
                                value: shiftCalcVal > 0 && !hasHourly ? shiftCalcVal : dailyPay + weekendPay,
                              });
                            } else if (dailyPay > 0 || weekendPay > 0) {
                              components.push({
                                label: "Pago por Día / Weekend",
                                sublabel: `Pagos diarios acumulados`,
                                value: dailyPay + weekendPay,
                              });
                            }
                          }

                          if (!hasHourly && !hasDaily && shiftCalcVal > 0) {
                            components.push({
                              label: "Cálculo por Turnos",
                              sublabel: `${fullDays} día(s) × $${dailyRate || "?"}`,
                              value: shiftCalcVal,
                            });
                          }

                          if (ridePay > 0) {
                            components.push({ label: "Transporte (Ryde)", sublabel: "Componente de transporte", value: ridePay });
                          }

                          if (manualAdj > 0) {
                            components.push({ label: "Ajuste Manual", sublabel: "Ajustes manuales aplicados", value: manualAdj });
                          }

                          // If no components were detected, show base_pay fallback
                          if (components.length === 0) {
                            components.push({
                              label: "Pago Base",
                              sublabel: "Sin desglose disponible",
                              value: record.base_pay || record.final_total_pay || 0,
                            });
                          }

                          const componentTotal = components.reduce((s, c) => s + c.value, 0);

                          return (
                            <div className={`rounded-xl border-2 p-4 ${isMixed ? "border-primary/20 bg-primary/[0.02]" : hasShiftCalc ? "border-earning/20 bg-earning/[0.03]" : "border-border bg-muted/20"}`}>
                              {isMixed && (
                                <div className="flex items-center gap-1.5 mb-3">
                                  <Badge variant="secondary" className="text-[10px] gap-1">
                                    <Info className="h-3 w-3" /> Compensación Mixta
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">Este empleado tiene múltiples tipos de compensación</span>
                                </div>
                              )}
                              <div className="space-y-2">
                                {components.map((comp, i) => (
                                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                                    <div>
                                      <div className="text-xs font-semibold">{comp.label}</div>
                                      <div className="text-[10px] text-muted-foreground">{comp.sublabel}</div>
                                    </div>
                                    <div className="font-mono font-bold text-sm">${comp.value.toLocaleString()}</div>
                                  </div>
                                ))}
                              </div>
                              <div className={`flex items-center justify-between mt-3 pt-3 border-t-2 ${isMixed ? "border-primary/20" : hasShiftCalc ? "border-earning/20" : "border-border"} rounded-lg px-3 py-2 ${isMixed ? "bg-primary/[0.06]" : hasShiftCalc ? "bg-earning/10" : "bg-primary/10"}`}>
                                <div className="text-[10px] font-bold uppercase">Total Calculado</div>
                                <div className={`font-mono font-bold text-lg ${isMixed ? "text-primary" : hasShiftCalc ? "text-earning" : "text-primary"}`}>${sysTotal.toLocaleString()}</div>
                              </div>
                              {Math.abs(componentTotal - sysTotal) > 1 && componentTotal > 0 && (
                                <p className="text-[10px] text-warning mt-1.5">
                                  ⚠ Suma de componentes (${componentTotal.toLocaleString()}) difiere del total registrado (${sysTotal.toLocaleString()})
                                </p>
                              )}
                              <div className="mt-2 text-[10px] text-muted-foreground text-center">
                                Fuente: {isMixed ? "compensación mixta (horaria + diaria)" : hasShiftCalc ? "cálculo por turnos (shift-calc)" : "nómina importada"}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </details>

                    {/* Compensation validation inline */}
                    {comp && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                        comp.status === "match" ? "border-earning/30 bg-earning/[0.04]" :
                        comp.status === "close_match" ? "border-warning/30 bg-warning/[0.04]" :
                        comp.status === "mismatch" ? "border-destructive/30 bg-destructive/[0.04]" : "border-border"
                      }`}>
                        {compStatusIcon}
                        <span className="font-semibold">Validación de tarifa:</span>
                        <span className="text-muted-foreground">{comp.reason}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap pt-1">
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
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                        <strong>Nota:</strong> {record.resolution_notes}
                      </div>
                    )}
                  </CardContent>
                  );
                })()}
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
