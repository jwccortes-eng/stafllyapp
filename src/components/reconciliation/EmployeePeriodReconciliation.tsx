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

                {isExpanded && (
                  <CardContent className="pt-0 pb-5 space-y-5">
                    <Separator />

                    {/* ── COMPARISON SUMMARY — what matters most ── */}
                    <div className="rounded-xl border-2 border-primary/20 bg-primary/[0.03] p-4 space-y-3">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Resumen de Comparación
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* System Calculation */}
                        <div className="bg-card rounded-lg border p-3 text-center">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                            Cálculo del Sistema
                          </div>
                          <div className="text-xl font-bold font-mono text-primary">
                            ${(record as any).shift_calculated_total > 0
                              ? (record.grand_total || record.final_total_pay)
                              : record.final_total_pay}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {(record as any).shift_calculated_total > 0
                              ? `${(record as any).shift_full_day_count || 0} días × $${(record as any).shift_daily_rate_used || "?"}`
                              : `${record.total_worked_hours}h trabajadas`
                            }
                            {(record.ride_amount > 0 || record.manual_amount > 0) && (
                              <span> + extras</span>
                            )}
                          </div>
                        </div>

                        {/* Payroll Reference */}
                        <div className="bg-card rounded-lg border p-3 text-center">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                            Referencia Nómina
                          </div>
                          <div className="text-xl font-bold font-mono text-muted-foreground">
                            ${record.total_payroll_amount || 0}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {record.payroll_rows.length} registro(s) importado(s)
                          </div>
                        </div>

                        {/* Variance */}
                        {(() => {
                          const sysTotal = (record as any).shift_calculated_total > 0
                            ? (record.grand_total || record.final_total_pay)
                            : record.final_total_pay;
                          const payRef = record.total_payroll_amount || 0;
                          const diff = sysTotal - payRef;
                          const absDiff = Math.abs(diff);
                          return (
                            <div className={`bg-card rounded-lg border p-3 text-center ${absDiff > 10 ? "border-destructive/40" : absDiff > 0 ? "border-warning/40" : "border-earning/40"}`}>
                              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                Varianza
                              </div>
                              <div className={`text-xl font-bold font-mono ${absDiff > 10 ? "text-destructive" : absDiff > 0 ? "text-warning" : "text-earning"}`}>
                                {diff >= 0 ? "+" : ""}${diff.toFixed(0)}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-1">
                                {absDiff <= 1 ? "✓ Match exacto" : absDiff <= 10 ? "≈ Dentro de tolerancia" : "⚠ Requiere revisión"}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Compensation Validation */}
                        {comp && (
                          <div className={`bg-card rounded-lg border p-3 text-center ${
                            comp.status === "match" ? "border-earning/40" :
                            comp.status === "close_match" ? "border-warning/40" :
                            comp.status === "mismatch" ? "border-destructive/40" : ""
                          }`}>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                              Validación Tarifa
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              {compStatusIcon}
                              <span className="text-sm font-semibold">
                                {comp.status === "match" ? "OK" :
                                 comp.status === "close_match" ? "Cercano" :
                                 comp.status === "mismatch" ? "Error" : "Revisar"}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">{comp.reason}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── SECTION 1: Scheduled Shifts ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" /> Turnos Programados
                        </h4>
                        <Badge variant="secondary" className="text-[10px]">
                          {record.scheduled_shifts.length} turno(s) · {record.total_scheduled_hours}h prog.
                        </Badge>
                      </div>
                      {record.scheduled_shifts.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {record.scheduled_shifts.map((s: any, i: number) => (
                            <div key={i} className="p-2.5 bg-muted/40 rounded-lg border border-border/30">
                              <div className="font-semibold text-xs">{s.date}</div>
                              <div className="text-[11px] text-muted-foreground">{s.title || "Sin título"}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">{s.hours}h programadas</div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground italic">Sin turnos programados en este periodo</p>}
                    </div>

                    {/* ── SECTION 2: Clocked Time ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" /> Horas Fichadas (Reloj)
                        </h4>
                        <Badge variant="secondary" className="text-[10px]">
                          {record.worked_shifts.length} fichaje(s) · {record.total_worked_hours}h total
                        </Badge>
                      </div>
                      {record.worked_shifts.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {record.worked_shifts.map((c: any, i: number) => (
                            <div key={i} className="p-2.5 bg-muted/40 rounded-lg border border-border/30">
                              <div className="font-semibold text-xs">{c.date}</div>
                              <div className="text-[11px] font-mono font-medium">{c.hours}h fichadas</div>
                              {c.clock_in && (
                                <div className="text-[10px] text-muted-foreground">
                                  {c.clock_in?.substring(11, 16)} → {c.clock_out?.substring(11, 16)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground italic">Sin fichajes en este periodo</p>}
                    </div>

                    {/* ── SECTION 3: Imported Payroll Reference ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5" /> Nómina Importada (Referencia)
                        </h4>
                        <Badge variant="outline" className="text-[10px]">
                          {record.payroll_rows.length} fila(s) · ${record.total_payroll_amount || 0} total
                        </Badge>
                      </div>
                      {record.payroll_rows.length > 0 ? (
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="text-[10px] font-semibold uppercase">Fecha</TableHead>
                                <TableHead className="text-[10px] font-semibold uppercase">Horas (fila)</TableHead>
                                <TableHead className="text-[10px] font-semibold uppercase">Monto (fila)</TableHead>
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
                                  <TableCell className="font-mono">
                                    {record.payroll_rows.reduce((s: number, p: any) => s + Number(p.hours || 0), 0).toFixed(1)}h
                                  </TableCell>
                                  <TableCell className="font-mono">${record.total_payroll_amount || 0}</TableCell>
                                  <TableCell />
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      ) : <p className="text-xs text-muted-foreground italic">Sin datos de nómina importada</p>}
                      <p className="text-[10px] text-muted-foreground">
                        ⓘ Estos montos provienen del archivo importado y se usan solo como referencia de comparación. Las horas mostradas son por fila individual, no representan el total del periodo.
                      </p>
                    </div>

                    {/* ── SECTION 4: System Calculation Breakdown ── */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Cálculo del Sistema (Fuente Primaria)
                      </h4>
                      {(record as any).shift_calculated_total > 0 ? (
                        <div className="rounded-xl border-2 border-earning/20 bg-earning/[0.03] p-4">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Días Completos</div>
                              <div className="font-mono font-bold text-sm">{(record as any).shift_full_day_count || 0}</div>
                              <div className="text-[10px] text-muted-foreground">× ${(record as any).shift_daily_rate_used || "?"}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Medios Días</div>
                              <div className="font-mono font-bold text-sm">{(record as any).shift_half_day_count || 0}</div>
                              <div className="text-[10px] text-muted-foreground">× ${(record as any).shift_half_day_rate_used || "?"}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Ride / Transporte</div>
                              <div className="font-mono font-bold text-sm">${record.ride_amount}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Ajuste Manual</div>
                              <div className="font-mono font-bold text-sm">${record.manual_amount}</div>
                            </div>
                            <div className="text-center bg-earning/10 rounded-lg p-2">
                              <div className="text-[10px] text-earning font-bold uppercase">Total Calculado</div>
                              <div className="font-mono font-bold text-lg text-earning">${record.grand_total || record.final_total_pay}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-muted-foreground text-center">
                            Fuente: {(record as any).shift_calculation_source || "shift_calc"} · Primaria: {(record as any).primary_source || "shift_calc"}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border bg-muted/20 p-4">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Pago Base</div>
                              <div className="font-mono font-bold text-sm">${record.base_pay}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Ride</div>
                              <div className="font-mono font-bold text-sm">${record.ride_amount}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Weekend</div>
                              <div className="font-mono font-bold text-sm">${record.weekend_amount}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-muted-foreground uppercase">Manual</div>
                              <div className="font-mono font-bold text-sm">${record.manual_amount}</div>
                            </div>
                            <div className="text-center bg-primary/10 rounded-lg p-2">
                              <div className="text-[10px] text-primary font-bold uppercase">Total</div>
                              <div className="font-mono font-bold text-lg text-primary">${record.final_total_pay}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-muted-foreground text-center">
                            Fuente: payroll (sin cálculo por turnos disponible)
                          </div>
                        </div>
                      )}
                    </div>

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
