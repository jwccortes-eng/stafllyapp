import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Wrench, ArrowRight, Save, Undo2, BookOpen, SplitSquareVertical,
  Link2Off, UserCheck, ChevronDown, ChevronRight,
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
  { value: "hourly", label: "Hourly", color: "bg-blue-100 text-blue-700" },
  { value: "daily", label: "Daily Pay", color: "bg-green-100 text-green-700" },
  { value: "pay_ride", label: "Ride", color: "bg-orange-100 text-orange-700" },
  { value: "weekend_job", label: "Weekend Job", color: "bg-purple-100 text-purple-700" },
  { value: "manual_adjustment", label: "Manual Adj.", color: "bg-yellow-100 text-yellow-800" },
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

interface PayrollRowEdit {
  id: string;
  original_pay_type: string;
  new_pay_type: string;
  total_pay: number;
  total_hours: number;
  work_date: string;
  description: string;
}

export default function VarianceWorkbench({ companyId, periodStatusId, finalRecords, employees, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [edits, setEdits] = useState<Map<string, PayrollRowEdit>>(new Map());
  const [saving, setSaving] = useState(false);
  const [showLearnDialog, setShowLearnDialog] = useState(false);
  const [learnForm, setLearnForm] = useState({ label: "", save_for_employee: false });
  const [currentEdit, setCurrentEdit] = useState<PayrollRowEdit | null>(null);

  const recordsWithVariance = useMemo(() => {
    return finalRecords
      .map(r => ({
        ...r,
        name: employees.get(r.employee_id) || "—",
        variance: Math.abs((r.variance_amount ?? 0)),
      }))
      .sort((a, b) => b.variance - a.variance);
  }, [finalRecords, employees]);

  const setPayType = (rowId: string, payrollRow: any, newType: string) => {
    setEdits(prev => {
      const next = new Map(prev);
      next.set(rowId, {
        id: rowId,
        original_pay_type: payrollRow.type || "unknown",
        new_pay_type: newType,
        total_pay: payrollRow.pay || 0,
        total_hours: payrollRow.hours || 0,
        work_date: payrollRow.date || "",
        description: payrollRow.description || "",
      });
      return next;
    });
  };

  const revertEdit = (rowId: string) => {
    setEdits(prev => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
  };

  const applyEdits = async () => {
    if (!companyId || edits.size === 0) return;
    setSaving(true);

    for (const [rowId, edit] of edits) {
      // Update the normalized payroll row's pay_type
      await supabase.from("normalized_payroll_rows" as any)
        .update({ pay_type: edit.new_pay_type, updated_at: new Date().toISOString() } as any)
        .eq("id", rowId);
    }

    toast({ title: `${edits.size} clasificación(es) actualizadas`, description: "Regenera los registros finales para ver el efecto." });
    setEdits(new Map());
    setSaving(false);
    onRefresh();
  };

  const openLearnDialog = (edit: PayrollRowEdit, empId: string) => {
    setCurrentEdit(edit);
    setLearnForm({
      label: `${edit.total_pay} → ${PAY_TYPE_OPTIONS.find(o => o.value === edit.new_pay_type)?.label || edit.new_pay_type}`,
      save_for_employee: false,
    });
    setShowLearnDialog(true);
  };

  const saveLearnedRule = async () => {
    if (!companyId || !user?.id || !currentEdit) return;

    const empId = expandedEmployee;
    await supabase.from("reconciliation_learned_rules" as any).insert({
      company_id: companyId,
      source_type: "variance_correction",
      rule_label: learnForm.label,
      match_criteria: {
        field: "amount",
        operator: "equals",
        value: String(currentEdit.total_pay),
      },
      result_action: {
        pay_type: currentEdit.new_pay_type,
        description: `Auto: ${currentEdit.original_pay_type} → ${currentEdit.new_pay_type}`,
      },
      employee_id: learnForm.save_for_employee ? empId : null,
      created_by: user.id,
    } as any);

    toast({ title: "Regla aprendida guardada" });
    setShowLearnDialog(false);
    setCurrentEdit(null);
  };

  const computeNewTotal = (record: EmployeeFinalRecord) => {
    let total = 0;
    for (const row of (record.payroll_rows || [])) {
      const edit = edits.get(row.id);
      total += row.pay || 0;
      // The actual amount doesn't change — only classification changes
    }
    return total || record.grand_total || record.final_total_pay || 0;
  };

  const pendingEditCount = edits.size;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          <h3 className="font-semibold text-sm">Variance Workbench</h3>
          {pendingEditCount > 0 && (
            <Badge variant="secondary">{pendingEditCount} cambio(s) pendientes</Badge>
          )}
        </div>
        {pendingEditCount > 0 && (
          <Button size="sm" onClick={applyEdits} disabled={saving} className="gap-1">
            <Save className="h-3 w-3" /> {saving ? "Guardando..." : "Aplicar Cambios"}
          </Button>
        )}
      </div>

      {/* Employee List */}
      {recordsWithVariance.map(record => {
        const isExpanded = expandedEmployee === record.employee_id;
        const hasEdits = (record.payroll_rows || []).some((r: any) => edits.has(r.id));
        const varianceStatus = record.variance_status || "unresolved";
        const varianceBadge = varianceStatus === "exact_match" ? "default"
          : varianceStatus === "minor_variance" ? "secondary"
          : "destructive";
        const cleanHistorical = record.source_payroll_total || 0;
        const grossHistorical = record.total_payroll_amount || 0;
        const excludedUnmapped = Math.max(0, grossHistorical - cleanHistorical);
        const unmappedCount = (record.payroll_rows || []).filter((row: any) => row?.classified_type === "unmapped" || row?.type === "other" || row?.type === "unclassified").length;

        return (
          <Card key={record.employee_id} className={hasEdits ? "border-primary/50" : ""}>
            {/* Employee Header */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setExpandedEmployee(isExpanded ? null : record.employee_id)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium text-sm">{record.name}</span>
                <Badge variant="outline" className="text-[10px]">{record.pay_classification}</Badge>
                <Badge variant={varianceBadge as any} className="text-[10px]">
                  {varianceStatus === "exact_match" ? "Exacto" : varianceStatus === "minor_variance" ? "Menor" : varianceStatus === "major_variance" ? "Mayor" : "Sin resolver"}
                </Badge>
                {hasEdits && <Badge className="text-[10px] bg-primary/20 text-primary">Editado</Badge>}
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Histórico limpio:</span>{" "}
                  <span className="font-semibold">{fmt(cleanHistorical)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Histórico total:</span>{" "}
                  <span className="font-semibold">{fmt(grossHistorical)}</span>
                </div>
                {excludedUnmapped > 0 && (
                  <div>
                    <span className="text-muted-foreground">Excluido:</span>{" "}
                    <span className="font-semibold text-destructive">{fmt(excludedUnmapped)} ({unmappedCount})</span>
                  </div>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Reconciliado:</span>{" "}
                  <span className="font-semibold">{fmt(record.grand_total || record.final_total_pay || 0)}</span>
                </div>
                <div className={`font-bold ${Math.abs(record.variance_amount || 0) > 10 ? "text-destructive" : "text-primary"}`}>
                  Δ {fmt(record.variance_amount || 0)}
                </div>
              </div>
            </div>

            {/* Expanded Detail */}
            {isExpanded && (
              <CardContent className="pt-0 space-y-4">
                <Separator />

                {/* Side by side: Source Evidence vs System Interpretation */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Left: Source payroll rows */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Evidencia Fuente (Nómina)</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px]">Fecha</TableHead>
                          <TableHead className="text-[10px]">Horas</TableHead>
                          <TableHead className="text-[10px] text-right">Monto</TableHead>
                          <TableHead className="text-[10px]">Tipo Original</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(record.payroll_rows || []).map((row: any, i: number) => (
                          <TableRow key={row.id || i}>
                            <TableCell className="text-xs">{row.date || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{row.hours?.toFixed(1) || "—"}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-semibold">{fmt(row.pay || 0)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{row.type || "?"}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(record.payroll_rows || []).length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground text-center">Sin filas de nómina</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Right: Editable classification */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Resolución Editable</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px]">Monto</TableHead>
                          <TableHead className="text-[10px]">Clasificar como</TableHead>
                          <TableHead className="text-[10px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(record.payroll_rows || []).map((row: any, i: number) => {
                          const edit = edits.get(row.id);
                          const currentType = edit?.new_pay_type || row.type || "unknown";
                          return (
                            <TableRow key={row.id || i} className={edit ? "bg-primary/5" : ""}>
                              <TableCell className="text-xs font-mono font-semibold">{fmt(row.pay || 0)}</TableCell>
                              <TableCell>
                                <Select value={currentType} onValueChange={v => setPayType(row.id, row, v)}>
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PAY_TYPE_OPTIONS.map(o => (
                                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="flex gap-1">
                                {edit && (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => revertEdit(row.id)} className="h-6 w-6 p-0">
                                      <Undo2 className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => openLearnDialog(edit, record.employee_id)} className="h-6 w-6 p-0" title="Guardar como regla">
                                      <BookOpen className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Additional context rows */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-muted-foreground mb-1">Turnos programados</div>
                    <div className="font-semibold">{(record.scheduled_shifts || []).length} turnos — {record.total_scheduled_hours?.toFixed(1)}h</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-muted-foreground mb-1">Fichajes trabajados</div>
                    <div className="font-semibold">{(record.worked_shifts || []).length} turnos — {record.total_worked_hours?.toFixed(1)}h</div>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <div className="text-muted-foreground mb-1">Warnings</div>
                    <div className="font-semibold">{(record.warnings || []).length > 0 ? (record.warnings || []).join(", ") : "Ninguno"}</div>
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
          {currentEdit && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cuando el sistema vea <span className="font-mono font-bold">{fmt(currentEdit.total_pay)}</span> en futuros periodos, automáticamente lo clasificará como{" "}
                <Badge variant="secondary">{PAY_TYPE_OPTIONS.find(o => o.value === currentEdit.new_pay_type)?.label}</Badge>.
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
