import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { usePageView, useRecordView } from "@/hooks/useAuditLog";
import AuditPanel from "@/components/audit/AuditPanel";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, DollarSign, TrendingUp, TrendingDown, Pencil, Save, X, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";

interface ShiftRow {
  id: string;
  shift_start_date: string | null;
  shift_hours: number | null;
  hourly_rate_usd: number | null;
  daily_total_pay_usd: number | null;
  daily_total_hours: number | null;
  type: string | null;
  customer: string | null;
  job_code: string | null;
}

interface MovementRow {
  id: string;
  total_value: number;
  quantity: number | null;
  rate: number | null;
  note: string | null;
  concept_name: string;
  category: string;
}

interface BasePay {
  id?: string;
  base_total_pay: number;
  total_work_hours: number | null;
  total_overtime: number | null;
  total_paid_hours: number | null;
  total_regular: number | null;
}

interface EditableBasePay {
  base_total_pay: string;
  total_work_hours: string;
  total_overtime: string;
  total_paid_hours: string;
  total_regular: string;
}

export default function EmployeePeriodDetail() {
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get("employeeId");
  const periodId = searchParams.get("periodId");
  const { toast } = useToast();

  usePageView("Detalle empleado periodo");
  useRecordView("employee_period", employeeId);

  const [employee, setEmployee] = useState<{ first_name: string; last_name: string } | null>(null);
  const [period, setPeriod] = useState<{ start_date: string; end_date: string; status: string } | null>(null);
  const [basePay, setBasePay] = useState<BasePay | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState<EditableBasePay>({
    base_total_pay: "0",
    total_work_hours: "0",
    total_overtime: "0",
    total_paid_hours: "0",
    total_regular: "0",
  });

  const isClosed = period?.status === "closed";

  const load = async () => {
    if (!employeeId || !periodId) return;
    setLoading(true);

    const [empRes, periodRes, baseRes, shiftsRes, movRes] = await Promise.all([
      supabase.from("employees").select("first_name, last_name").eq("id", employeeId).single(),
      supabase.from("pay_periods").select("start_date, end_date, status").eq("id", periodId).single(),
      supabase.from("period_base_pay").select("id, base_total_pay, total_work_hours, total_overtime, total_paid_hours, total_regular").eq("employee_id", employeeId).eq("period_id", periodId).maybeSingle(),
      supabase.from("shifts").select("id, shift_start_date, shift_hours, hourly_rate_usd, daily_total_pay_usd, daily_total_hours, type, customer, job_code").eq("employee_id", employeeId).eq("period_id", periodId).order("shift_start_date"),
      supabase.from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)").eq("employee_id", employeeId).eq("period_id", periodId),
    ]);

    setEmployee(empRes.data);
    setPeriod(periodRes.data as any);
    setBasePay(baseRes.data as BasePay | null);
    setShifts((shiftsRes.data as ShiftRow[]) ?? []);
    setMovements(
      (movRes.data ?? []).map((m: any) => ({
        id: m.id,
        total_value: Number(m.total_value) || 0,
        quantity: m.quantity,
        rate: m.rate,
        note: m.note,
        concept_name: m.concepts?.name ?? "—",
        category: m.concepts?.category ?? "extra",
      }))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId, periodId]);

  const startEditing = () => {
    if (isClosed) {
      toast({ title: "Periodo cerrado", description: "No se pueden editar datos en un periodo cerrado.", variant: "destructive" });
      return;
    }
    setEditValues({
      base_total_pay: String(basePay?.base_total_pay ?? 0),
      total_work_hours: String(basePay?.total_work_hours ?? 0),
      total_overtime: String(basePay?.total_overtime ?? 0),
      total_paid_hours: String(basePay?.total_paid_hours ?? 0),
      total_regular: String(basePay?.total_regular ?? 0),
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!employeeId || !periodId) return;

    // Validate numbers
    const values = {
      base_total_pay: parseFloat(editValues.base_total_pay),
      total_work_hours: parseFloat(editValues.total_work_hours),
      total_overtime: parseFloat(editValues.total_overtime),
      total_paid_hours: parseFloat(editValues.total_paid_hours),
      total_regular: parseFloat(editValues.total_regular),
    };

    if (Object.values(values).some(v => isNaN(v))) {
      toast({ title: "Error", description: "Todos los campos deben ser números válidos.", variant: "destructive" });
      return;
    }

    // Double-check period is still open
    const { data: currentPeriod } = await supabase.from("pay_periods").select("status").eq("id", periodId).single();
    if (currentPeriod?.status === "closed") {
      toast({ title: "Periodo cerrado", description: "Este periodo fue cerrado. No se pueden guardar cambios.", variant: "destructive" });
      setEditing(false);
      load();
      return;
    }

    setSaving(true);

    if (basePay?.id) {
      // Update existing
      const { error } = await supabase
        .from("period_base_pay")
        .update(values)
        .eq("id", basePay.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Datos base actualizados" });
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from("period_base_pay")
        .insert({ ...values, employee_id: employeeId, period_id: periodId });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Datos base creados" });
      }
    }

    setSaving(false);
    setEditing(false);
    load();
  };

  const updateField = (field: keyof EditableBasePay, value: string) => {
    setEditValues(prev => ({ ...prev, [field]: value }));
  };

  if (!employeeId || !periodId) {
    return <div className="py-12 text-center text-muted-foreground">Parámetros inválidos</div>;
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Cargando detalle...</div>;
  }

  const extras = movements.filter(m => m.category === "extra");
  const deductions = movements.filter(m => m.category === "deduction");
  const extrasTotal = extras.reduce((s, m) => s + m.total_value, 0);
  const deductionsTotal = deductions.reduce((s, m) => s + m.total_value, 0);
  const base = basePay?.base_total_pay ?? 0;
  const finalTotal = base + extrasTotal - deductionsTotal;

  return (
    <div>
      <div>
        <Link to={`/app/summary?periodId=${periodId}`}>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver al resumen
          </Button>
        </Link>
        <PageHeader
          variant="3"
          title={`${employee?.first_name} ${employee?.last_name}`}
          subtitle={`Periodo: ${period?.start_date} → ${period?.end_date}${isClosed ? " · Cerrado" : ""}`}
        />
      </div>

      {isClosed && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Periodo cerrado — los datos base no pueden ser modificados.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Pago base</p>
            <p className="text-xl font-bold font-mono">${base.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Extras</p>
            <p className="text-xl font-bold font-mono text-earning">+${extrasTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Deducciones</p>
            <p className="text-xl font-bold font-mono text-deduction">−${deductionsTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Total final</p>
            <p className="text-xl font-bold font-mono">${finalTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Base pay details — editable */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Resumen de horas y pago base</CardTitle>
          {!editing && !isClosed && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          )}
          {editing && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                <X className="h-3 w-3 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-3 w-3 mr-1" /> {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Pago base ($)</label>
                <Input type="number" step="0.01" value={editValues.base_total_pay} onChange={e => updateField("base_total_pay", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Horas trabajadas</label>
                <Input type="number" step="0.1" value={editValues.total_work_hours} onChange={e => updateField("total_work_hours", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Horas regulares</label>
                <Input type="number" step="0.1" value={editValues.total_regular} onChange={e => updateField("total_regular", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Horas extra</label>
                <Input type="number" step="0.1" value={editValues.total_overtime} onChange={e => updateField("total_overtime", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Horas pagadas</label>
                <Input type="number" step="0.1" value={editValues.total_paid_hours} onChange={e => updateField("total_paid_hours", e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div><span className="text-muted-foreground">Pago base:</span> <span className="font-mono font-medium">${(basePay?.base_total_pay ?? 0).toFixed(2)}</span></div>
              <div><span className="text-muted-foreground">Horas trabajadas:</span> <span className="font-mono font-medium">{basePay?.total_work_hours?.toFixed(1) ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Horas regulares:</span> <span className="font-mono font-medium">{basePay?.total_regular?.toFixed(1) ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Horas extra:</span> <span className="font-mono font-medium">{basePay?.total_overtime?.toFixed(1) ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Horas pagadas:</span> <span className="font-mono font-medium">{basePay?.total_paid_hours?.toFixed(1) ?? "—"}</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shifts */}
      {shifts.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">Turnos ({shifts.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs text-right">Horas</TableHead>
                  <TableHead className="text-xs text-right">Tarifa/hr</TableHead>
                  <TableHead className="text-xs text-right">Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{s.shift_start_date ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.type ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.customer ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{s.shift_hours?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{s.hourly_rate_usd != null ? `$${s.hourly_rate_usd.toFixed(2)}` : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{s.daily_total_pay_usd != null ? `$${s.daily_total_pay_usd.toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Movements */}
      {movements.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Novedades ({movements.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Concepto</TableHead>
                  <TableHead className="text-xs text-center">Tipo</TableHead>
                  <TableHead className="text-xs text-right">Cantidad</TableHead>
                  <TableHead className="text-xs text-right">Tarifa</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs">Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm font-medium">{m.concept_name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={m.category === "extra" ? "default" : "destructive"} className="text-xs">
                        {m.category === "extra" ? "Extra" : "Deducción"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{m.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{m.rate != null ? `$${m.rate}` : "—"}</TableCell>
                    <TableCell className={`text-right font-mono text-xs font-bold ${m.category === "extra" ? "text-earning" : "text-deduction"}`}>
                      {m.category === "extra" ? "+" : "−"}${m.total_value.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-40 truncate">{m.note ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Record audit trail */}
      <div className="mt-8">
        <AuditPanel
          entityType="employee"
          entityId={employeeId ?? undefined}
          title="Historial del empleado"
          hideViews
          compact
        />
      </div>
    </div>
  );
}