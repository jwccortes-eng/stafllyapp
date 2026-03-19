import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useCompensationMutations } from "@/hooks/useCompensation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, AlertTriangle, TrendingUp,
  Pencil, Save, X as XIcon, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

interface AnalysisRow {
  id: string;
  company_id: string;
  employee_id: string;
  first_seen_date: string | null;
  first_known_hourly_rate: number | null;
  current_known_hourly_rate: number | null;
  hourly_rate_change_count: number;
  last_hourly_change_date: string | null;
  daily_payment_detected: boolean;
  ride_payment_detected: boolean;
  manual_adjustment_detected: boolean;
  mixed_compensation_detected: boolean;
  notes: string | null;
  employee_name?: string;
  employee_role?: string;
}

export default function CompensationAnalysisTab() {
  const { selectedCompanyId } = useCompany();
  const { user, role, hasActionPermission } = useAuth();
  const { upsertProfile } = useCompensationMutations();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [correctionDialog, setCorrectionDialog] = useState<AnalysisRow | null>(null);
  const [correctionForm, setCorrectionForm] = useState<Record<string, any>>({});

  const canEdit = role === "owner" || role === "admin" || role === "developer" || hasActionPermission("edit_compensation_analysis");

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["compensation-analysis", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compensation_analysis_summary")
        .select(`*, employees!inner(first_name, last_name, employee_role)`)
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
        employee_role: r.employees?.employee_role,
      })) as AnalysisRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!search || !rows) return rows ?? [];
    const s = search.toLowerCase();
    return rows.filter(r => (r.employee_name ?? "").toLowerCase().includes(s));
  }, [rows, search]);

  const formatDate = (d: string | null) => d ? format(new Date(d + "T00:00:00"), "dd MMM yyyy") : "—";
  const formatRate = (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—";

  const startInlineEdit = (row: AnalysisRow) => {
    setEditingId(row.id);
    setEditForm({
      current_known_hourly_rate: row.current_known_hourly_rate ?? "",
      daily_payment_detected: row.daily_payment_detected,
      ride_payment_detected: row.ride_payment_detected,
      manual_adjustment_detected: row.manual_adjustment_detected,
      mixed_compensation_detected: row.mixed_compensation_detected,
      notes: row.notes ?? "",
    });
  };

  const cancelInlineEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveInlineEdit = async (row: AnalysisRow) => {
    if (!user || !selectedCompanyId) return;
    setSaving(true);
    try {
      const newRate = editForm.current_known_hourly_rate ? Number(editForm.current_known_hourly_rate) : null;
      const oldRate = row.current_known_hourly_rate;

      // Update analysis summary
      const { error } = await supabase
        .from("compensation_analysis_summary")
        .update({
          current_known_hourly_rate: newRate,
          daily_payment_detected: editForm.daily_payment_detected,
          ride_payment_detected: editForm.ride_payment_detected,
          manual_adjustment_detected: editForm.manual_adjustment_detected,
          mixed_compensation_detected: editForm.mixed_compensation_detected,
          notes: editForm.notes || null,
          refreshed_at: new Date().toISOString(),
          ...(newRate !== oldRate ? {
            hourly_rate_change_count: row.hourly_rate_change_count + 1,
            last_hourly_change_date: new Date().toISOString().split("T")[0],
          } : {}),
        })
        .eq("id", row.id);
      if (error) throw error;

      // If rate changed, also update/create compensation profile + log
      if (newRate !== null && newRate !== oldRate) {
        await upsertProfile(row.employee_id, {
          default_hourly_rate: newRate,
          payment_mode: editForm.daily_payment_detected ? (editForm.mixed_compensation_detected ? "mixed" : "daily") : "hourly",
          effective_from: new Date().toISOString().split("T")[0],
          rate_source: "employee_custom" as any,
        }, {
          reason: `Corrección desde análisis: ${editForm.notes || "sin nota"}`,
          sourceType: "inline_edit",
          changedFields: [{
            field: "default_hourly_rate",
            oldVal: oldRate != null ? String(oldRate) : null,
            newVal: String(newRate),
          }],
        });
      }

      toast.success("Análisis actualizado");
      cancelInlineEdit();
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    }
    setSaving(false);
  };

  const openCorrection = (row: AnalysisRow) => {
    setCorrectionDialog(row);
    setCorrectionForm({
      new_rate: row.current_known_hourly_rate ?? "",
      payment_mode: row.daily_payment_detected ? "daily" : "hourly",
      effective_from: new Date().toISOString().split("T")[0],
      reason: "",
    });
  };

  const applyCorrection = async () => {
    if (!correctionDialog || !user || !selectedCompanyId) return;
    setSaving(true);
    try {
      const newRate = Number(correctionForm.new_rate) || null;
      await upsertProfile(correctionDialog.employee_id, {
        default_hourly_rate: newRate,
        payment_mode: correctionForm.payment_mode,
        effective_from: correctionForm.effective_from,
        rate_source: "employee_custom" as any,
      }, {
        reason: correctionForm.reason || "Corrección manual desde análisis",
        sourceType: "admin_edit",
        changedFields: [{
          field: "default_hourly_rate",
          oldVal: correctionDialog.current_known_hourly_rate != null ? String(correctionDialog.current_known_hourly_rate) : null,
          newVal: newRate != null ? String(newRate) : null,
        }],
      });

      // Update analysis summary too
      await supabase
        .from("compensation_analysis_summary")
        .update({
          current_known_hourly_rate: newRate,
          refreshed_at: new Date().toISOString(),
          hourly_rate_change_count: correctionDialog.hourly_rate_change_count + 1,
          last_hourly_change_date: correctionForm.effective_from,
        })
        .eq("id", correctionDialog.id);

      toast.success("Corrección aplicada y registrada");
      setCorrectionDialog(null);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!rows || rows.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="py-12 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay datos de análisis aún.</p>
          <p className="text-xs text-muted-foreground mt-1">Importa archivos de nómina para generar el análisis de compensación.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar empleado...">
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar
        </Button>
      </DataTableToolbar>

      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Primera vez</TableHead>
                  <TableHead className="text-right">1ª Tarifa</TableHead>
                  <TableHead className="text-right">Tarifa actual</TableHead>
                  <TableHead className="text-center">Cambios</TableHead>
                  <TableHead>Últ. cambio</TableHead>
                  <TableHead className="text-center">Diario</TableHead>
                  <TableHead className="text-center">Ride</TableHead>
                  <TableHead className="text-center">Manual</TableHead>
                  <TableHead className="text-center">Mixto</TableHead>
                  {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const isEditing = editingId === r.id;
                  return (
                    <TableRow key={r.id} className={isEditing ? "bg-primary/5" : ""}>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{r.employee_name}</span>
                          {r.employee_role && <span className="text-[10px] text-muted-foreground ml-2">{r.employee_role}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(r.first_seen_date)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatRate(r.first_known_hourly_rate)}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="h-7 w-20 text-right"
                            value={editForm.current_known_hourly_rate}
                            onChange={e => setEditForm(f => ({ ...f, current_known_hourly_rate: e.target.value }))}
                          />
                        ) : (
                          <span className="font-mono text-sm font-semibold">{formatRate(r.current_known_hourly_rate)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.hourly_rate_change_count > 0 ? (
                          <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">{r.hourly_rate_change_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(r.last_hourly_change_date)}</TableCell>
                      <TableCell className="text-center">{r.daily_payment_detected ? <CheckCircle2 className="h-3.5 w-3.5 text-earning mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell className="text-center">{r.ride_payment_detected ? <CheckCircle2 className="h-3.5 w-3.5 text-primary mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell className="text-center">{r.manual_adjustment_detected ? <AlertTriangle className="h-3.5 w-3.5 text-warning mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell className="text-center">{r.mixed_compensation_detected ? <AlertTriangle className="h-3.5 w-3.5 text-destructive mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          {isEditing ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="xs" onClick={() => saveInlineEdit(r)} disabled={saving}>
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              </Button>
                              <Button size="xs" variant="ghost" onClick={cancelInlineEdit}><XIcon className="h-3 w-3" /></Button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-end">
                              <Button size="xs" variant="ghost" onClick={() => startInlineEdit(r)} title="Editar inline">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="xs" variant="ghost" onClick={() => openCorrection(r)} title="Corregir tarifa">
                                <TrendingUp className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Correction Dialog */}
      <Dialog open={!!correctionDialog} onOpenChange={o => !o && setCorrectionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir compensación — {correctionDialog?.employee_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nueva tarifa hora ($)</Label>
                <Input type="number" value={correctionForm.new_rate ?? ""} onChange={e => setCorrectionForm(f => ({ ...f, new_rate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Modo de pago</Label>
                <Select value={correctionForm.payment_mode ?? "hourly"} onValueChange={v => setCorrectionForm(f => ({ ...f, payment_mode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Por hora</SelectItem>
                    <SelectItem value="daily">Por día</SelectItem>
                    <SelectItem value="mixed">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Vigente desde</Label>
              <Input type="date" value={correctionForm.effective_from ?? ""} onChange={e => setCorrectionForm(f => ({ ...f, effective_from: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Razón de la corrección</Label>
              <Input value={correctionForm.reason ?? ""} onChange={e => setCorrectionForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ej: Tarifa incorrecta en importación" />
            </div>
            {correctionDialog && (
              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <p>Tarifa anterior: <strong>{formatRate(correctionDialog.current_known_hourly_rate)}</strong></p>
                <p>Cambios históricos: <strong>{correctionDialog.hourly_rate_change_count}</strong></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionDialog(null)}>Cancelar</Button>
            <Button onClick={applyCorrection} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Aplicar corrección
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
