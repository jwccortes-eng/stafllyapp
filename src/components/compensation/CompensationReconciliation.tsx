import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { type CompensationProfile } from "@/hooks/useCompensation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CompensationHistoryDialog } from "@/components/compensation/CompensationHistoryDialog";
import CompensationEditDialog from "@/components/compensation/CompensationEditDialog";
import { toast } from "sonner";
import {
  Search, CheckCircle, AlertTriangle, XCircle,
  Filter, RefreshCw, User, FileText, Eye, DollarSign,
  ChevronDown, ChevronUp, ShieldCheck, Pencil,
  Users, UserPlus, Calendar,
} from "lucide-react";

/* ── Types ── */
interface ShiftCalcRow {
  employee_id: string;
  employee_name: string;
  employee_role: string | null;
  profile: CompensationProfile | null;
  shiftData: {
    full_day_count: number;
    half_day_count: number;
    shift_calculated_total: number;
    shift_daily_rate_used: number | null;
    shift_half_day_rate_used: number | null;
    payroll_reference_total: number | null;
  } | null;
  validation: {
    configured_daily: number | null;
    configured_half: number | null;
    expected_total: number;
    actual_shift_total: number;
    variance: number;
    variancePct: number;
    payroll_ref: number;
    shift_vs_payroll_diff: number;
  };
  status: ValidationStatus;
  reason: string;
}

type ValidationStatus = "exact_match" | "close_match" | "mismatch" | "needs_review";

const STATUS_CONFIG: Record<ValidationStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  exact_match: { label: "Match exacto", color: "bg-earning/10 text-earning", icon: CheckCircle },
  close_match: { label: "Match cercano", color: "bg-warning/10 text-warning", icon: AlertTriangle },
  mismatch: { label: "Mismatch", color: "bg-destructive/10 text-destructive", icon: XCircle },
  needs_review: { label: "Requiere revisión", color: "bg-muted text-muted-foreground", icon: Eye },
};

const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "exact_match", label: "Match exacto" },
  { value: "close_match", label: "Match cercano" },
  { value: "mismatch", label: "Mismatch" },
  { value: "needs_review", label: "Requiere revisión" },
  { value: "no_profile", label: "Sin perfil" },
  { value: "no_rate", label: "Sin tarifa diaria" },
  { value: "has_shifts", label: "Con turnos" },
];

/* ── Main Component ── */
export default function CompensationReconciliation() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyEmp, setHistoryEmp] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; profile: CompensationProfile | null } | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("latest");
  const [bulkCreating, setBulkCreating] = useState(false);

  // Fetch pay periods
  const { data: periods } = useQuery({
    queryKey: ["comp-recon-periods", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("pay_periods")
        .select("id, start_date, end_date, status")
        .eq("company_id", selectedCompanyId!)
        .order("start_date", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const activePeriodId = useMemo(() => {
    if (!periods?.length) return null;
    if (selectedPeriodId !== "latest") return selectedPeriodId;
    return periods[0]?.id ?? null;
  }, [periods, selectedPeriodId]);

  const activePeriod = useMemo(() => {
    if (!periods?.length || !activePeriodId) return null;
    return periods.find(p => p.id === activePeriodId) ?? null;
  }, [periods, activePeriodId]);

  // Fetch employees
  const { data: employees } = useQuery({
    queryKey: ["comp-recon-employees", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("employees")
        .select("id, first_name, last_name, employee_role, is_active")
        .eq("company_id", selectedCompanyId!).eq("is_active", true).order("first_name");
      return data ?? [];
    },
  });

  // Fetch profiles
  const { data: profiles } = useQuery({
    queryKey: ["comp-recon-profiles", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("compensation_profiles")
        .select("*").eq("company_id", selectedCompanyId!).eq("is_active", true);
      return (data ?? []) as CompensationProfile[];
    },
  });

  // Fetch reconciliation_final_records for the active period (shift-calc data)
  const { data: finalRecords, isLoading } = useQuery({
    queryKey: ["comp-recon-final-records", selectedCompanyId, activePeriodId],
    enabled: !!selectedCompanyId && !!activePeriodId,
    queryFn: async () => {
      // Find period_status_id for this period
      const { data: ps } = await supabase.from("reconciliation_period_status" as any)
        .select("id")
        .eq("company_id", selectedCompanyId!)
        .eq("period_id", activePeriodId!)
        .neq("status", "superseded")
        .limit(1);
      const statusId = (ps as any)?.[0]?.id;
      if (!statusId) return [];

      const { data } = await supabase.from("reconciliation_final_records")
        .select("employee_id, shift_full_day_count, shift_half_day_count, shift_calculated_total, shift_daily_rate_used, shift_half_day_rate_used, payroll_reference_total, shift_vs_payroll_diff, pay_classification, daily_rate, hourly_rate")
        .eq("company_id", selectedCompanyId!)
        .eq("period_status_id", statusId);
      return data ?? [];
    },
  });

  // Build rows
  const rows: ShiftCalcRow[] = useMemo(() => {
    if (!employees) return [];
    const profileMap = new Map<string, CompensationProfile>();
    (profiles ?? []).forEach(p => profileMap.set(p.employee_id, p));

    const recordMap = new Map<string, any>();
    (finalRecords ?? []).forEach((r: any) => {
      // Keep only the first (or merge if needed)
      if (!recordMap.has(r.employee_id)) recordMap.set(r.employee_id, r);
    });

    return employees.map(e => {
      const p = profileMap.get(e.id) ?? null;
      const rec = recordMap.get(e.id);
      const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();

      const fullDays = rec?.shift_full_day_count ?? 0;
      const halfDays = rec?.shift_half_day_count ?? 0;
      const shiftCalcTotal = rec?.shift_calculated_total ?? 0;
      const dailyRateUsed = rec?.shift_daily_rate_used ?? null;
      const halfRateUsed = rec?.shift_half_day_rate_used ?? null;
      const payrollRef = rec?.payroll_reference_total ?? 0;

      const hasShiftData = fullDays > 0 || halfDays > 0;

      const shiftData = hasShiftData ? {
        full_day_count: fullDays,
        half_day_count: halfDays,
        shift_calculated_total: shiftCalcTotal,
        shift_daily_rate_used: dailyRateUsed,
        shift_half_day_rate_used: halfRateUsed,
        payroll_reference_total: payrollRef,
      } : null;

      // Validation: compare configured rates × counts vs shift_calculated_total
      const configuredDaily = p?.default_daily_rate ?? null;
      const configuredHalf = p?.default_half_day_rate ?? null;

      const expectedTotal = (fullDays * (configuredDaily ?? 0)) + (halfDays * (configuredHalf ?? 0));
      const actualShiftTotal = shiftCalcTotal;
      const variance = expectedTotal - actualShiftTotal;
      const variancePct = actualShiftTotal !== 0
        ? (variance / Math.abs(actualShiftTotal)) * 100
        : expectedTotal !== 0 ? 100 : 0;

      // Determine status and reason
      let status: ValidationStatus;
      let reason: string;

      if (!hasShiftData && !rec) {
        status = "needs_review";
        reason = "Sin datos de turnos en el período";
      } else if (!p) {
        status = "needs_review";
        reason = "Sin perfil de compensación";
      } else if (configuredDaily == null && fullDays > 0) {
        status = "needs_review";
        reason = "Falta tarifa diaria configurada";
      } else if (configuredHalf == null && halfDays > 0) {
        status = "needs_review";
        reason = "Falta tarifa medio día configurada";
      } else if (!hasShiftData) {
        status = "needs_review";
        reason = "Sin turnos shift-calc en período";
      } else {
        const absDiff = Math.abs(variance);
        if (absDiff === 0) {
          status = "exact_match";
          reason = "Configuración = Shift-Calc";
        } else if (absDiff <= 1 || Math.abs(variancePct) <= 1) {
          status = "exact_match";
          reason = "Dentro de tolerancia mínima";
        } else if (Math.abs(variancePct) <= 5) {
          status = "close_match";
          reason = "Diferencia dentro de 5%";
        } else {
          status = "mismatch";
          // Determine specific reason
          if (dailyRateUsed && configuredDaily && dailyRateUsed !== configuredDaily) {
            reason = `Tarifa diaria: config $${configuredDaily} vs usado $${dailyRateUsed}`;
          } else if (halfRateUsed && configuredHalf && halfRateUsed !== configuredHalf) {
            reason = `Tarifa ½día: config $${configuredHalf} vs usado $${halfRateUsed}`;
          } else {
            reason = `Diferencia de ${Math.abs(variancePct).toFixed(1)}%`;
          }
        }
      }

      return {
        employee_id: e.id,
        employee_name: name,
        employee_role: e.employee_role,
        profile: p,
        shiftData,
        validation: {
          configured_daily: configuredDaily,
          configured_half: configuredHalf,
          expected_total: expectedTotal,
          actual_shift_total: actualShiftTotal,
          variance,
          variancePct,
          payroll_ref: payrollRef,
          shift_vs_payroll_diff: rec?.shift_vs_payroll_diff ?? 0,
        },
        status,
        reason,
      };
    });
  }, [employees, profiles, finalRecords]);

  // Filter
  const filtered = useMemo(() => {
    let result = rows;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r => r.employee_name.toLowerCase().includes(s));
    }
    switch (filter) {
      case "exact_match": result = result.filter(r => r.status === "exact_match"); break;
      case "close_match": result = result.filter(r => r.status === "close_match"); break;
      case "mismatch": result = result.filter(r => r.status === "mismatch"); break;
      case "needs_review": result = result.filter(r => r.status === "needs_review"); break;
      case "no_profile": result = result.filter(r => !r.profile); break;
      case "no_rate": result = result.filter(r => r.profile && r.profile.default_daily_rate == null); break;
      case "has_shifts": result = result.filter(r => r.shiftData != null); break;
    }
    return result;
  }, [rows, search, filter]);

  // Stats
  const stats = useMemo(() => {
    const withShifts = rows.filter(r => r.shiftData != null);
    const total = withShifts.length;
    const exact = withShifts.filter(r => r.status === "exact_match").length;
    const close = withShifts.filter(r => r.status === "close_match").length;
    const mismatch = withShifts.filter(r => r.status === "mismatch").length;
    const review = withShifts.filter(r => r.status === "needs_review").length;
    const conciliated = total > 0 ? Math.round(((exact + close) / total) * 100) : 0;
    const noRate = withShifts.filter(r => r.profile && r.profile.default_daily_rate == null).length;
    return { total, exact, close, mismatch, review, conciliated, totalAll: rows.length, noRate };
  }, [rows]);

  // Profile actions
  const noProfileIds = useMemo(() => rows.filter(r => !r.profile && r.shiftData).map(r => r.employee_id), [rows]);

  const createProfileForEmployee = useCallback(async (employeeId: string): Promise<CompensationProfile | null> => {
    if (!user || !selectedCompanyId) return null;
    const { data, error } = await supabase.from("compensation_profiles").insert({
      company_id: selectedCompanyId,
      employee_id: employeeId,
      payment_mode: "daily" as any,
      is_active: true,
      effective_from: new Date().toISOString().split("T")[0],
      created_by: user.id,
      updated_by: user.id,
    }).select("*").single();
    if (error) { toast.error(error.message); return null; }
    await supabase.from("compensation_change_log").insert({
      company_id: selectedCompanyId,
      employee_id: employeeId,
      compensation_profile_id: data.id,
      action_type: "created" as any,
      changed_field: "profile",
      new_value: "created_daily",
      reason: "Perfil creado desde validación shift-calc",
      source_type: "admin_edit" as any,
      changed_by: user.id,
    });
    return data as unknown as CompensationProfile;
  }, [user, selectedCompanyId]);

  const bulkCreateProfiles = useCallback(async (ids: string[]) => {
    if (!user || !selectedCompanyId || ids.length === 0) return;
    setBulkCreating(true);
    try {
      const inserts = ids.map(eid => ({
        company_id: selectedCompanyId,
        employee_id: eid,
        payment_mode: "daily" as any,
        is_active: true,
        effective_from: new Date().toISOString().split("T")[0],
        created_by: user.id,
        updated_by: user.id,
      }));
      const { data, error } = await supabase.from("compensation_profiles").insert(inserts).select("id, employee_id");
      if (error) throw error;
      const logs = (data ?? []).map((d: any) => ({
        company_id: selectedCompanyId,
        employee_id: d.employee_id,
        compensation_profile_id: d.id,
        action_type: "created" as any,
        changed_field: "profile",
        new_value: "created_daily",
        reason: "Perfil creado en lote (shift-calc)",
        source_type: "admin_edit" as any,
        changed_by: user.id,
      }));
      if (logs.length > 0) await supabase.from("compensation_change_log").insert(logs);
      qc.invalidateQueries({ queryKey: ["comp-recon-profiles"] });
      qc.invalidateQueries({ queryKey: ["comp-validation-profiles"] });
      toast.success(`${data?.length ?? 0} perfiles creados`);
    } catch (err: any) {
      toast.error(err.message ?? "Error");
    } finally {
      setBulkCreating(false);
    }
  }, [user, selectedCompanyId, qc]);

  const handleEditOrCreate = useCallback(async (row: ShiftCalcRow) => {
    if (row.profile) {
      setEditTarget({ id: row.employee_id, name: row.employee_name, profile: row.profile });
      return;
    }
    toast.info("Creando perfil...");
    const newP = await createProfileForEmployee(row.employee_id);
    if (newP) {
      qc.invalidateQueries({ queryKey: ["comp-recon-profiles"] });
      qc.invalidateQueries({ queryKey: ["comp-validation-profiles"] });
      setEditTarget({ id: row.employee_id, name: row.employee_name, profile: newP });
      toast.success("Perfil creado");
    }
  }, [createProfileForEmployee, qc]);

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">Período:</span>
        <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
          <SelectTrigger className="w-[280px] h-8">
            <SelectValue placeholder="Seleccionar período..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Más reciente</SelectItem>
            {(periods ?? []).map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.start_date} → {p.end_date} ({p.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activePeriod && (
          <Badge variant="outline" className="text-[10px]">
            {activePeriod.start_date} → {activePeriod.end_date} · {activePeriod.status}
          </Badge>
        )}
      </div>

      {/* KPIs — shift-calc based */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <KpiCard label="Total empleados" value={stats.totalAll} icon={<User className="h-4 w-4" />} />
        <KpiCard label="Con turnos" value={stats.total} icon={<Calendar className="h-4 w-4" />} accent="primary" />
        <KpiCard label="Match exacto" value={stats.exact} icon={<CheckCircle className="h-4 w-4" />} accent="primary" />
        <KpiCard label="Match cercano" value={stats.close} icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
        <KpiCard label="Mismatch" value={stats.mismatch} icon={<XCircle className="h-4 w-4" />} accent="deduction" />
        <KpiCard label="Sin tarifa" value={stats.noRate} icon={<DollarSign className="h-4 w-4" />} accent="deduction" />
        <KpiCard label="% Conciliado" value={`${stats.conciliated}%`} icon={<ShieldCheck className="h-4 w-4" />} accent={stats.conciliated >= 80 ? "primary" : "warning"} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {noProfileIds.length > 0 && (
          <Button variant="default" disabled={bulkCreating} onClick={() => bulkCreateProfiles(noProfileIds)}>
            <Users className="h-4 w-4 mr-1.5" />
            {bulkCreating ? "Creando..." : `Generar ${noProfileIds.length} perfiles`}
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="text-[11px] text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 border border-border/30">
        <strong>Fuente primaria: Shift-Calc.</strong> La validación compara <code>tarifa configurada × días programados</code> contra el <code>shift_calculated_total</code> del período. El payroll se muestra solo como referencia.
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando datos del período...</div>
      ) : !activePeriodId ? (
        <EmptyState icon={Calendar} title="Sin período" description="No hay períodos disponibles para validar." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={DollarSign} title="Sin resultados" description="No hay empleados que coincidan con los filtros." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Empleado</TableHead>
                    <TableHead className="text-xs text-center">Estado</TableHead>
                    <TableHead className="text-xs text-center">Días</TableHead>
                    <TableHead className="text-xs text-right">Tarifa Config.</TableHead>
                    <TableHead className="text-xs text-right">Esperado</TableHead>
                    <TableHead className="text-xs text-right">Shift-Calc</TableHead>
                    <TableHead className="text-xs text-right">Varianza</TableHead>
                    <TableHead className="text-xs text-right">Payroll Ref</TableHead>
                    <TableHead className="text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(row => {
                    const sc = STATUS_CONFIG[row.status];
                    const Icon = sc.icon;
                    const expanded = expandedId === row.employee_id;
                    const sd = row.shiftData;
                    const v = row.validation;

                    return (
                      <>
                        <TableRow
                          key={row.employee_id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setExpandedId(expanded ? null : row.employee_id)}
                        >
                          <TableCell>
                            <div className="text-sm font-medium">{row.employee_name}</div>
                            {row.employee_role && <span className="text-[10px] text-muted-foreground">{row.employee_role}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-[10px] border-0 gap-1 ${sc.color}`}>
                              <Icon className="h-3 w-3" /> {sc.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-xs tabular-nums">
                            {sd ? (
                              <span>
                                {sd.full_day_count > 0 && <span className="font-bold">{sd.full_day_count}d</span>}
                                {sd.half_day_count > 0 && <span className="text-muted-foreground ml-1">+{sd.half_day_count}½</span>}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {v.configured_daily != null ? (
                              <div>
                                <span className="font-medium">${v.configured_daily}</span>
                                <span className="text-[9px] text-muted-foreground">/día</span>
                              </div>
                            ) : (
                              <span className="text-destructive text-[10px]">Sin tarifa</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">
                            {v.expected_total > 0 ? fmt(v.expected_total) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-primary">
                            {v.actual_shift_total > 0 ? fmt(v.actual_shift_total) : "—"}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs font-bold ${
                            Math.abs(v.variance) > 1 ? "text-destructive" : "text-earning"
                          }`}>
                            {sd ? `${v.variance >= 0 ? "+" : ""}${fmt(v.variance)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {v.payroll_ref > 0 ? fmt(v.payroll_ref) : "—"}
                          </TableCell>
                          <TableCell>
                            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                        </TableRow>

                        {expanded && (
                          <TableRow key={`${row.employee_id}-detail`}>
                            <TableCell colSpan={9} className="p-0 border-b-2 border-border/20">
                              <div className="bg-muted/10 p-4 space-y-3">
                                {/* Reason */}
                                <div className="text-xs">
                                  <span className="font-semibold text-muted-foreground">Motivo: </span>
                                  <span>{row.reason}</span>
                                </div>

                                {/* Breakdown */}
                                {sd && (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                    <DetailItem label="Full Days" value={`${sd.full_day_count}`} />
                                    <DetailItem label="Half Days" value={`${sd.half_day_count}`} />
                                    <DetailItem label="Tarifa día usada" value={sd.shift_daily_rate_used != null ? `$${sd.shift_daily_rate_used}` : "—"} />
                                    <DetailItem label="Tarifa ½día usada" value={sd.shift_half_day_rate_used != null ? `$${sd.shift_half_day_rate_used}` : "—"} />
                                    <DetailItem label="Tarifa día config." value={v.configured_daily != null ? `$${v.configured_daily}` : "—"} />
                                    <DetailItem label="Tarifa ½día config." value={v.configured_half != null ? `$${v.configured_half}` : "—"} />
                                    <DetailItem label="Esperado (config)" value={fmt(v.expected_total)} />
                                    <DetailItem label="Shift-Calc Total" value={fmt(v.actual_shift_total)} />
                                    <DetailItem label="Payroll Referencia" value={v.payroll_ref > 0 ? fmt(v.payroll_ref) : "—"} />
                                    <DetailItem label="Shift vs Payroll" value={v.shift_vs_payroll_diff !== 0 ? `${v.shift_vs_payroll_diff >= 0 ? "+" : ""}${fmt(v.shift_vs_payroll_diff)}` : "—"} />
                                    <DetailItem label="Varianza %" value={`${v.variancePct.toFixed(1)}%`} />
                                    <DetailItem label="Modo perfil" value={row.profile?.payment_mode ?? "—"} />
                                  </div>
                                )}

                                {/* Rate mismatch alert */}
                                {sd && v.configured_daily != null && sd.shift_daily_rate_used != null && v.configured_daily !== sd.shift_daily_rate_used && (
                                  <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-[11px]">
                                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                                    <span>
                                      <strong>Conflicto de tarifa:</strong> El perfil tiene ${v.configured_daily}/día pero el cálculo usó ${sd.shift_daily_rate_used}/día.
                                      Actualiza el perfil para alinear.
                                    </span>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/20">
                                  {!row.profile && (
                                    <Button size="sm" variant="default" className="h-7 text-[11px]"
                                      onClick={(e) => { e.stopPropagation(); handleEditOrCreate(row); }}>
                                      <UserPlus className="h-3 w-3 mr-1" /> Crear perfil
                                    </Button>
                                  )}
                                  <Button size="sm" variant={row.profile ? "default" : "secondary"} className="h-7 text-[11px]"
                                    onClick={(e) => { e.stopPropagation(); handleEditOrCreate(row); }}>
                                    <Pencil className="h-3 w-3 mr-1" /> Editar compensación
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                                    onClick={(e) => { e.stopPropagation(); setHistoryEmp({ id: row.employee_id, name: row.employee_name }); }}>
                                    <FileText className="h-3 w-3 mr-1" /> Historial
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                                    onClick={(e) => { e.stopPropagation(); window.open(`/app/employees?id=${row.employee_id}`, "_blank"); }}>
                                    <User className="h-3 w-3 mr-1" /> Perfil
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {historyEmp && (
        <CompensationHistoryDialog
          open={!!historyEmp}
          onOpenChange={() => setHistoryEmp(null)}
          employeeId={historyEmp.id}
          employeeName={historyEmp.name}
        />
      )}

      {editTarget && (
        <CompensationEditDialog
          open={!!editTarget}
          onOpenChange={() => setEditTarget(null)}
          employeeId={editTarget.id}
          employeeName={editTarget.name}
          profile={editTarget.profile}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["comp-recon-profiles"] });
            qc.invalidateQueries({ queryKey: ["comp-recon-final-records"] });
          }}
        />
      )}
    </div>
  );
}

/* ── Small components ── */
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded-lg px-2 py-1.5">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="font-medium truncate">{value}</p>
    </div>
  );
}
