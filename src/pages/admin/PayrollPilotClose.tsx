import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { type CompensationProfile } from "@/hooks/useCompensation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle, AlertTriangle, XCircle, Lock, Users, DollarSign, Clock,
  ShieldCheck, Download, Eye, Loader2, Calendar, FileSpreadsheet, BarChart3,
} from "lucide-react";

/* ── Types ── */
interface Period { id: string; start_date: string; end_date: string; status: string; paid_at: string | null; }

type EmpCloseStatus = "ready" | "pending" | "alert" | "mismatch" | "excluded";

interface EmployeeCloseRow {
  employee_id: string;
  name: string;
  role: string | null;
  status: EmpCloseStatus;
  base_pay: number;
  hourly_total: number;
  daily_full: number;
  daily_half: number;
  ride_total: number;
  bonus_total: number;
  manual_adj: number;
  total: number;
  alerts: string[];
  has_profile: boolean;
  hourly_confirmed: boolean;
}

interface ChecklistItem {
  key: string;
  label: string;
  checked: boolean;
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

const STATUS_CONFIG: Record<EmpCloseStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  ready: { label: "Listo", color: "bg-earning/10 text-earning", icon: CheckCircle },
  pending: { label: "Pendiente", color: "bg-warning/10 text-warning", icon: Clock },
  alert: { label: "Alerta", color: "bg-warning/10 text-warning", icon: AlertTriangle },
  mismatch: { label: "Mismatch", color: "bg-destructive/10 text-destructive", icon: XCircle },
  excluded: { label: "Excluido", color: "bg-muted text-muted-foreground", icon: Eye },
};

function classifyMovement(conceptName: string, note: string): string {
  const t = `${conceptName} ${note}`.toLowerCase();
  if (/full|completo|w\.?j\s*compl/i.test(t)) return "daily_full";
  if (/half|medio|w\.?j\s*half/i.test(t)) return "daily_half";
  if (/hourly|hora|waiter|kitchen/i.test(t)) return "hourly";
  if (/ride|ryde/i.test(t)) return "ride";
  if (/bonus|bono|transport/i.test(t)) return "bonus";
  if (/manual|adjustment|ajuste/i.test(t)) return "manual";
  return "other";
}

/* ── Main ── */
export default function PayrollPilotClose() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [closing, setClosing] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { key: "comp_reviewed", label: "Compensaciones revisadas", checked: false },
    { key: "hourly_confirmed", label: "Hourly rates confirmados", checked: false },
    { key: "rides_reviewed", label: "Pay rides revisados", checked: false },
    { key: "bonuses_reviewed", label: "Bonos revisados", checked: false },
    { key: "manual_reviewed", label: "Ajustes manuales revisados", checked: false },
    { key: "mismatch_resolved", label: "Mismatches resueltos", checked: false },
    { key: "period_ready", label: "Período listo para cierre", checked: false },
  ]);

  // Fetch periods
  const { data: periods } = useQuery({
    queryKey: ["pilot-close-periods", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("pay_periods")
        .select("id, start_date, end_date, status, paid_at")
        .eq("company_id", selectedCompanyId!)
        .order("start_date", { ascending: false }).limit(20);
      return (data ?? []) as Period[];
    },
  });

  const periodObj = periods?.find(p => p.id === selectedPeriod);

  // Fetch employees + profiles
  const { data: employees } = useQuery({
    queryKey: ["pilot-close-emps", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("employees")
        .select("id, first_name, last_name, employee_role, is_active")
        .eq("company_id", selectedCompanyId!).eq("is_active", true).order("first_name");
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["pilot-close-profiles", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("compensation_profiles")
        .select("*").eq("company_id", selectedCompanyId!).eq("is_active", true);
      return (data ?? []) as CompensationProfile[];
    },
  });

  // Fetch base pay
  const { data: basePays } = useQuery({
    queryKey: ["pilot-close-base", selectedPeriod],
    enabled: !!selectedPeriod,
    queryFn: async () => {
      const { data } = await supabase.from("period_base_pay")
        .select("employee_id, base_total_pay").eq("period_id", selectedPeriod);
      return data ?? [];
    },
  });

  // Fetch movements
  const { data: movements, isLoading } = useQuery({
    queryKey: ["pilot-close-movements", selectedPeriod],
    enabled: !!selectedPeriod,
    queryFn: async () => {
      const { data } = await supabase.from("movements")
        .select("employee_id, quantity, rate, total_value, note, concepts(name, category)")
        .eq("period_id", selectedPeriod).eq("approval_status", "approved");
      return data ?? [];
    },
  });

  // Build rows
  const rows: EmployeeCloseRow[] = useMemo(() => {
    if (!employees || !selectedPeriod) return [];
    const profileMap = new Map<string, CompensationProfile>();
    (profiles ?? []).forEach(p => profileMap.set(p.employee_id, p));
    const baseMap = new Map<string, number>();
    (basePays ?? []).forEach((b: any) => baseMap.set(b.employee_id, Number(b.base_total_pay) || 0));

    // Group movements
    const movMap = new Map<string, Record<string, number>>();
    (movements ?? []).forEach((m: any) => {
      const cn = m.concepts?.name ?? m.note ?? "";
      const cat = classifyMovement(cn, m.note ?? "");
      const total = Number(m.total_value) || 0;
      if (!movMap.has(m.employee_id)) movMap.set(m.employee_id, {});
      const emp = movMap.get(m.employee_id)!;
      emp[cat] = (emp[cat] ?? 0) + total;
    });

    // Only include employees who have base pay OR movements
    const empIds = new Set([...baseMap.keys(), ...movMap.keys()]);

    return employees.filter(e => empIds.has(e.id)).map(e => {
      const p = profileMap.get(e.id) ?? null;
      const base = baseMap.get(e.id) ?? 0;
      const mv = movMap.get(e.id) ?? {};
      const hourly = mv.hourly ?? 0;
      const daily_full = mv.daily_full ?? 0;
      const daily_half = mv.daily_half ?? 0;
      const ride = mv.ride ?? 0;
      const bonus = mv.bonus ?? 0;
      const manual = mv.manual ?? 0;
      const other = mv.other ?? 0;
      const total = base + hourly + daily_full + daily_half + ride + bonus + manual + other;

      const alerts: string[] = [];
      if (!p) alerts.push("Sin perfil de compensación");
      if (p && !p.hourly_rate_override_manual && p.inferred_hourly_rate) alerts.push("Hourly sin confirmar");
      if (total === 0) alerts.push("Total $0");

      let status: EmpCloseStatus = "ready";
      if (alerts.length > 0) status = "alert";
      if (!p) status = "pending";

      return {
        employee_id: e.id,
        name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
        role: e.employee_role,
        status,
        base_pay: base,
        hourly_total: hourly,
        daily_full,
        daily_half,
        ride_total: ride,
        bonus_total: bonus,
        manual_adj: manual,
        total,
        alerts,
        has_profile: !!p,
        hourly_confirmed: !!p?.hourly_rate_override_manual,
      };
    });
  }, [employees, profiles, basePays, movements, selectedPeriod]);

  // Stats
  const stats = useMemo(() => {
    const total = rows.length;
    const ready = rows.filter(r => r.status === "ready").length;
    const pending = rows.filter(r => r.status === "pending").length;
    const withAlerts = rows.filter(r => r.alerts.length > 0).length;
    const withComp = rows.filter(r => r.has_profile).length;
    const conciliated = total > 0 ? Math.round((ready / total) * 100) : 0;
    return { total, ready, pending, withAlerts, withComp, conciliated };
  }, [rows]);

  // Totals
  const totals = useMemo(() => ({
    base: rows.reduce((s, r) => s + r.base_pay, 0),
    hourly: rows.reduce((s, r) => s + r.hourly_total, 0),
    daily_full: rows.reduce((s, r) => s + r.daily_full, 0),
    daily_half: rows.reduce((s, r) => s + r.daily_half, 0),
    ride: rows.reduce((s, r) => s + r.ride_total, 0),
    bonus: rows.reduce((s, r) => s + r.bonus_total, 0),
    manual: rows.reduce((s, r) => s + r.manual_adj, 0),
    grand: rows.reduce((s, r) => s + r.total, 0),
  }), [rows]);

  const checklistComplete = checklist.every(c => c.checked);
  const toggleCheck = (key: string) => setChecklist(prev => prev.map(c => c.key === key ? { ...c, checked: !c.checked } : c));

  // Close period
  const closePeriod = useCallback(async () => {
    if (!selectedPeriod || !selectedCompanyId || !user?.id) return;
    setClosing(true);
    const { error } = await supabase.from("pay_periods")
      .update({ status: "closed" } as any).eq("id", selectedPeriod);
    if (error) {
      toast.error("Error al cerrar período: " + error.message);
    } else {
      // Log audit
      await supabase.from("activity_log").insert({
        user_id: user.id,
        company_id: selectedCompanyId,
        action: "period_pilot_close",
        entity_type: "pay_period",
        entity_id: selectedPeriod,
        details: {
          checklist: checklist.reduce((acc, c) => ({ ...acc, [c.key]: c.checked }), {}),
          totals,
          employee_count: rows.length,
          ready_count: stats.ready,
        },
      });
      toast.success("Período cerrado exitosamente");
      qc.invalidateQueries({ queryKey: ["pilot-close-periods"] });
    }
    setClosing(false);
  }, [selectedPeriod, selectedCompanyId, user?.id, checklist, totals, rows.length, stats.ready, qc]);

  // Export CSV
  const exportCSV = useCallback(() => {
    const header = ["Empleado", "Rol", "Estado", "Base Pay", "Hourly", "Full Day", "Half Day", "Pay Ride", "Bonos", "Ajustes", "Total"];
    const csvRows = rows.map(r => [
      r.name, r.role ?? "", r.status, r.base_pay.toFixed(2), r.hourly_total.toFixed(2),
      r.daily_full.toFixed(2), r.daily_half.toFixed(2), r.ride_total.toFixed(2),
      r.bonus_total.toFixed(2), r.manual_adj.toFixed(2), r.total.toFixed(2),
    ]);
    const csv = [header, ...csvRows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cierre-piloto-${periodObj?.start_date ?? "period"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, periodObj]);

  const isPeriodClosed = periodObj?.status === "closed" || periodObj?.status === "paid" || periodObj?.status === "published";

  return (
    <div className="space-y-6">
      <PageHeader title="Cierre Piloto de Nómina" subtitle="Validación operativa de período real" badge="Piloto" />

      {/* Period selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full sm:w-[320px]">
                  <SelectValue placeholder="Seleccionar período..." />
                </SelectTrigger>
                <SelectContent>
                  {(periods ?? []).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.start_date} → {p.end_date} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {periodObj && (
              <div className="flex items-center gap-2">
                <Badge variant={isPeriodClosed ? "default" : "secondary"} className="gap-1">
                  {isPeriodClosed ? <Lock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {periodObj.status}
                </Badge>
                {periodObj.paid_at && (
                  <Badge className="bg-earning/10 text-earning border-0 text-[10px]">
                    ✓ Pagado {new Date(periodObj.paid_at).toLocaleDateString("es")}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedPeriod ? (
        <EmptyState icon={Calendar} title="Selecciona un período" description="Elige un período de nómina para iniciar el flujo de cierre piloto." />
      ) : isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando datos del período...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Empleados" value={stats.total} icon={<Users className="h-4 w-4" />} />
            <KpiCard label="Listos" value={stats.ready} icon={<CheckCircle className="h-4 w-4" />} accent="primary" />
            <KpiCard label="Pendientes" value={stats.pending} icon={<Clock className="h-4 w-4" />} accent="warning" />
            <KpiCard label="Con alertas" value={stats.withAlerts} icon={<AlertTriangle className="h-4 w-4" />} accent={stats.withAlerts > 0 ? "deduction" : "muted"} />
            <KpiCard label="Con compensación" value={stats.withComp} icon={<DollarSign className="h-4 w-4" />} accent="primary" />
            <KpiCard label="% Listo" value={`${stats.conciliated}%`} icon={<ShieldCheck className="h-4 w-4" />} accent={stats.conciliated >= 80 ? "primary" : "warning"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Employee table */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Estado por Empleado ({rows.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px]">Empleado</TableHead>
                          <TableHead className="text-[10px] text-center">Estado</TableHead>
                          <TableHead className="text-[10px] text-right">Base</TableHead>
                          <TableHead className="text-[10px] text-right">Hourly</TableHead>
                          <TableHead className="text-[10px] text-right">Full Day</TableHead>
                          <TableHead className="text-[10px] text-right">½ Day</TableHead>
                          <TableHead className="text-[10px] text-right">Ride</TableHead>
                          <TableHead className="text-[10px] text-right">Bono</TableHead>
                          <TableHead className="text-[10px] text-right">Manual</TableHead>
                          <TableHead className="text-[10px] text-right font-bold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map(r => {
                          const sc = STATUS_CONFIG[r.status];
                          const Icon = sc.icon;
                          return (
                            <TableRow key={r.employee_id}>
                              <TableCell>
                                <div className="text-xs font-medium">{r.name}</div>
                                {r.role && <div className="text-[9px] text-muted-foreground">{r.role}</div>}
                                {r.alerts.length > 0 && (
                                  <div className="text-[9px] text-destructive mt-0.5">{r.alerts.join(" · ")}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className={`text-[9px] border-0 gap-0.5 ${sc.color}`}>
                                  <Icon className="h-2.5 w-2.5" /> {sc.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{fmt(r.base_pay)}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{fmt(r.hourly_total)}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{fmt(r.daily_full)}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{fmt(r.daily_half)}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{fmt(r.ride_total)}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{fmt(r.bonus_total)}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{fmt(r.manual_adj)}</TableCell>
                              <TableCell className="text-right font-mono text-[11px] font-bold">{fmt(r.total)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Totals row */}
                        <TableRow className="bg-muted/30 font-bold">
                          <TableCell className="text-xs" colSpan={2}>TOTAL</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.base)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.hourly)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.daily_full)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.daily_half)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.ride)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.bonus)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.manual)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(totals.grand)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right panel: checklist + summary + actions */}
            <div className="space-y-4">
              {/* Payroll summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resumen de Nómina</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <SummaryRow label="Base Pay" value={totals.base} />
                  <SummaryRow label="Hourly Total" value={totals.hourly} />
                  <SummaryRow label="Weekend Full Day" value={totals.daily_full} />
                  <SummaryRow label="Weekend Half Day" value={totals.daily_half} />
                  <SummaryRow label="Pay Ride" value={totals.ride} />
                  <SummaryRow label="Bonos" value={totals.bonus} />
                  <SummaryRow label="Ajustes Manuales" value={totals.manual} />
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total General</span>
                    <span className="tabular-nums text-primary">{fmt(totals.grand)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Checklist */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Checklist de Cierre
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {checklist.map(item => (
                    <label key={item.key} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={() => toggleCheck(item.key)}
                        disabled={isPeriodClosed}
                      />
                      <span className={item.checked ? "text-foreground" : "text-muted-foreground"}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                  <Progress value={(checklist.filter(c => c.checked).length / checklist.length) * 100} className="mt-3 h-2" />
                  <p className="text-[10px] text-muted-foreground text-center mt-1">
                    {checklist.filter(c => c.checked).length} / {checklist.length} completados
                  </p>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="space-y-2">
                <Button className="w-full gap-2" onClick={exportCSV} variant="outline">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
                {!isPeriodClosed && (
                  <Button
                    className="w-full gap-2"
                    disabled={!checklistComplete || closing || rows.length === 0}
                    onClick={closePeriod}
                  >
                    {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Cerrar Período
                  </Button>
                )}
                {isPeriodClosed && (
                  <div className="text-center text-sm text-earning font-medium py-2 bg-earning/5 rounded-lg">
                    ✓ Período cerrado
                  </div>
                )}
                {!checklistComplete && !isPeriodClosed && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Completa el checklist para habilitar el cierre
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Small components ── */
function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{fmt(value)}</span>
    </div>
  );
}
