import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Wrench, ArrowRight, Save, Undo2, BookOpen,
  ChevronDown, ChevronRight, ShieldAlert, ShieldCheck,
} from "lucide-react";
import type { EmployeeFinalRecord } from "@/hooks/useReconciliationPeriod";

interface Props {
  companyId: string | null;
  periodStatusId: string;
  finalRecords: EmployeeFinalRecord[];
  employees: Map<string, string>;
  onRefresh: () => void;
}

const PAY_TYPE_OPTIONS = [
  { value: "hourly", label: "Hourly" },
  { value: "full_day", label: "Full Day" },
  { value: "half_day", label: "Half Day" },
  { value: "mixed_daily", label: "Mixed Daily" },
  { value: "pay_ride", label: "Ride" },
  { value: "manual_adjustment", label: "Manual Adj." },
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

interface EmployeeOverride {
  employee_id: string;
  override_type: string;
}

export default function VarianceWorkbench({ companyId, periodStatusId, finalRecords, employees, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [savedOverrides, setSavedOverrides] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [showLearnDialog, setShowLearnDialog] = useState(false);
  const [learnForm, setLearnForm] = useState({ label: "", save_for_employee: false });
  const [currentLearnData, setCurrentLearnData] = useState<{ empId: string; overrideType: string } | null>(null);

  // Load existing overrides from DB
  useEffect(() => {
    if (!companyId || !periodStatusId) return;
    supabase.from("reconciliation_overrides" as any)
      .select("employee_id, override_type")
      .eq("company_id", companyId)
      .eq("period_status_id", periodStatusId)
      .then(({ data }) => {
        const map = new Map<string, string>();
        for (const row of (data || []) as any[]) {
          map.set(row.employee_id, row.override_type);
        }
        setSavedOverrides(map);
      });
  }, [companyId, periodStatusId]);

  const recordsWithVariance = useMemo(() => {
    return finalRecords
      .map(r => ({
        ...r,
        name: employees.get(r.employee_id) || "—",
        variance: Math.abs((r.variance_amount ?? 0)),
      }))
      .sort((a, b) => b.variance - a.variance);
  }, [finalRecords, employees]);

  const setEmployeeOverride = (empId: string, newType: string) => {
    setOverrides(prev => {
      const next = new Map(prev);
      next.set(empId, newType);
      return next;
    });
  };

  const revertOverride = (empId: string) => {
    setOverrides(prev => {
      const next = new Map(prev);
      next.delete(empId);
      return next;
    });
  };

  const applyOverrides = async () => {
    if (!companyId || !user?.id || overrides.size === 0) return;
    setSaving(true);

    for (const [empId, overrideType] of overrides) {
      await supabase.from("reconciliation_overrides" as any).upsert({
        company_id: companyId,
        period_status_id: periodStatusId,
        employee_id: empId,
        override_type: overrideType,
        override_source: "variance_workbench",
        notes: `Manual override: ${overrideType}`,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "company_id,period_status_id,employee_id" });
    }

    toast({ title: `${overrides.size} override(s) guardados`, description: "Reprocesa el período para aplicar los cambios al cálculo." });

    // Merge into saved
    setSavedOverrides(prev => {
      const next = new Map(prev);
      for (const [k, v] of overrides) next.set(k, v);
      return next;
    });
    setOverrides(new Map());
    setSaving(false);
    onRefresh();
  };

  const removeOverride = async (empId: string) => {
    if (!companyId) return;
    await supabase.from("reconciliation_overrides" as any)
      .delete()
      .eq("company_id", companyId)
      .eq("period_status_id", periodStatusId)
      .eq("employee_id", empId);
    setSavedOverrides(prev => {
      const next = new Map(prev);
      next.delete(empId);
      return next;
    });
    toast({ title: "Override eliminado", description: "Reprocesa para volver al cálculo automático." });
    onRefresh();
  };

  const openLearnDialog = (empId: string, overrideType: string) => {
    setCurrentLearnData({ empId, overrideType });
    const label = PAY_TYPE_OPTIONS.find(o => o.value === overrideType)?.label || overrideType;
    setLearnForm({ label: `${employees.get(empId) || empId} → ${label}`, save_for_employee: false });
    setShowLearnDialog(true);
  };

  const saveLearnedRule = async () => {
    if (!companyId || !user?.id || !currentLearnData) return;
    await supabase.from("reconciliation_learned_rules" as any).insert({
      company_id: companyId,
      source_type: "variance_correction",
      rule_label: learnForm.label,
      match_criteria: { field: "employee_id", operator: "equals", value: currentLearnData.empId },
      result_action: { override_type: currentLearnData.overrideType },
      employee_id: learnForm.save_for_employee ? currentLearnData.empId : null,
      created_by: user.id,
    } as any);
    toast({ title: "Regla aprendida guardada" });
    setShowLearnDialog(false);
    setCurrentLearnData(null);
  };

  const pendingCount = overrides.size;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          <h3 className="font-semibold text-sm">Variance Workbench</h3>
          {pendingCount > 0 && (
            <Badge variant="secondary">{pendingCount} override(s) pendientes</Badge>
          )}
          {savedOverrides.size > 0 && (
            <Badge className="bg-primary/20 text-primary text-[10px]">
              <ShieldCheck className="h-3 w-3 mr-1" /> {savedOverrides.size} override(s) activos
            </Badge>
          )}
        </div>
        {pendingCount > 0 && (
          <Button size="sm" onClick={applyOverrides} disabled={saving} className="gap-1">
            <Save className="h-3 w-3" /> {saving ? "Guardando..." : "Aplicar Overrides"}
          </Button>
        )}
      </div>

      {/* Employee List */}
      {recordsWithVariance.map(record => {
        const isExpanded = expandedEmployee === record.employee_id;
        const pendingOverride = overrides.get(record.employee_id);
        const activeOverride = savedOverrides.get(record.employee_id);
        const currentOverrideType = pendingOverride || activeOverride || null;
        const hasPendingChange = !!pendingOverride;
        const hasActiveOverride = !!activeOverride;
        const varianceStatus = record.variance_status || "unresolved";
        const varianceBadge = varianceStatus === "exact_match" ? "default"
          : varianceStatus === "minor_variance" ? "secondary" : "destructive";
        const primarySource = (record as any).primary_source || (record as any).shift_calculation_source || "auto";

        return (
          <Card key={record.employee_id} className={hasPendingChange ? "border-primary/50" : hasActiveOverride ? "border-accent/50" : ""}>
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setExpandedEmployee(isExpanded ? null : record.employee_id)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium text-sm">{record.name}</span>
                <Badge variant="outline" className="text-[10px]">{record.pay_classification}</Badge>
                <Badge variant={varianceBadge as any} className="text-[10px]">
                  {varianceStatus === "exact_match" ? "Exacto" : varianceStatus === "minor_variance" ? "Menor" : "Mayor"}
                </Badge>
                {hasActiveOverride && (
                  <Badge className="text-[10px] bg-accent text-accent-foreground gap-1">
                    <ShieldAlert className="h-3 w-3" /> Override: {PAY_TYPE_OPTIONS.find(o => o.value === activeOverride)?.label || activeOverride}
                  </Badge>
                )}
                {hasPendingChange && (
                  <Badge className="text-[10px] bg-primary/20 text-primary">Pendiente</Badge>
                )}
                {primarySource && (
                  <Badge variant="outline" className="text-[9px] font-mono">{primarySource}</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Calc:</span>{" "}
                  <span className="font-semibold">{fmt(record.grand_total || record.final_total_pay || 0)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Payroll:</span>{" "}
                  <span className="font-semibold">{fmt(record.total_payroll_amount || 0)}</span>
                </div>
                <div className={`font-bold ${Math.abs(record.variance_amount || 0) > 50 ? "text-destructive" : Math.abs(record.variance_amount || 0) > 10 ? "text-warning" : "text-muted-foreground"}`}>
                  Δ {fmt(record.variance_amount || 0)}
                </div>
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 space-y-4">
                <Separator />

                {/* Employee-Level Override Selector */}
                <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                  <Label className="text-xs font-semibold whitespace-nowrap">Override de clasificación:</Label>
                  <Select
                    value={currentOverrideType || record.pay_classification || ""}
                    onValueChange={v => setEmployeeOverride(record.employee_id, v)}
                  >
                    <SelectTrigger className="h-8 w-48 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAY_TYPE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasPendingChange && (
                    <Button variant="ghost" size="sm" onClick={() => revertOverride(record.employee_id)} className="h-7 text-xs gap-1">
                      <Undo2 className="h-3 w-3" /> Revertir
                    </Button>
                  )}
                  {hasActiveOverride && !hasPendingChange && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => removeOverride(record.employee_id)} className="h-7 text-xs text-destructive gap-1">
                        <Undo2 className="h-3 w-3" /> Eliminar Override
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openLearnDialog(record.employee_id, activeOverride)} className="h-7 text-xs gap-1">
                        <BookOpen className="h-3 w-3" /> Guardar Regla
                      </Button>
                    </>
                  )}
                </div>

                {/* Source Evidence */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Evidencia Fuente (Nómina)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Fecha</TableHead>
                        <TableHead className="text-[10px]">Horas</TableHead>
                        <TableHead className="text-[10px] text-right">Monto</TableHead>
                        <TableHead className="text-[10px]">Tipo</TableHead>
                        <TableHead className="text-[10px]">Shift/Location</TableHead>
                        <TableHead className="text-[10px]">Fuente</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(record.payroll_rows || []).map((row: any, i: number) => {
                        const isUnmapped = row?.classified_type === "unmapped" || row?.type === "other" || row?.type === "unclassified";
                        return (
                          <TableRow key={row.id || i} className={isUnmapped ? "bg-warning/5" : ""}>
                            <TableCell className="text-xs">{row.date || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{row.hours?.toFixed(1) || "—"}</TableCell>
                            <TableCell className={`text-xs text-right font-mono font-semibold ${isUnmapped ? "text-warning" : ""}`}>{fmt(row.pay || 0)}</TableCell>
                            <TableCell className="space-x-1">
                              <Badge variant="outline" className="text-[10px]">{row.type || "?"}</Badge>
                              {row.classified_type && <Badge variant={isUnmapped ? "warning" : "secondary"} className="text-[10px]">{row.classified_type}</Badge>}
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground max-w-[180px]">
                              <div className="truncate">{row.shift_source || "—"}</div>
                              <div className="truncate">{row.location_source || row.client_location_source || "—"}</div>
                            </TableCell>
                            <TableCell className="text-[10px]">
                              <Badge variant="outline" className="text-[10px]">{row.classification_source || "fallback"}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(record.payroll_rows || []).length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground text-center">Sin filas de nómina</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Context cards */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-muted-foreground mb-1">Turnos programados <span className="text-[10px] text-warning">(estimado)</span></div>
                    <div className="font-semibold text-muted-foreground">{(record.scheduled_shifts || []).length} turnos — {record.total_scheduled_hours?.toFixed(1)}h</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-muted-foreground mb-1">Fichajes trabajados</div>
                    <div className="font-semibold">{(record.worked_shifts || []).length} turnos — {record.total_worked_hours?.toFixed(1)}h</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-muted-foreground mb-1">Fuente primaria</div>
                    <div className="font-semibold">{primarySource}</div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {recordsWithVariance.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>Genera los registros finales primero para usar el Workbench.</p>
        </div>
      )}

      {/* Learn Dialog */}
      <Dialog open={showLearnDialog} onOpenChange={setShowLearnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Guardar como Regla Aprendida
            </DialogTitle>
          </DialogHeader>
          {currentLearnData && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                En futuros periodos, este empleado se clasificará automáticamente como{" "}
                <Badge variant="secondary">{PAY_TYPE_OPTIONS.find(o => o.value === currentLearnData.overrideType)?.label}</Badge>.
              </p>
              <div>
                <Label className="text-xs">Etiqueta</Label>
                <Input value={learnForm.label} onChange={e => setLearnForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={learnForm.save_for_employee} onCheckedChange={v => setLearnForm(f => ({ ...f, save_for_employee: v }))} />
                <Label className="text-xs">Solo para este empleado</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLearnDialog(false)}>Cancelar</Button>
            <Button onClick={saveLearnedRule}>Guardar Regla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
