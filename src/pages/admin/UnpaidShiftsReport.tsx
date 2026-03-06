import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPersonName } from "@/lib/format-helpers";
import { AlertTriangle, DollarSign, Clock, CalendarCheck, Search, X, Sun } from "lucide-react";
import { format, getDay } from "date-fns";

interface UnpaidItem {
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftTitle: string;
  shiftDate: string;
  startTime: string | null;
  endTime: string | null;
  periodId: string | null;
  periodLabel: string;
  hasClock: boolean;
  hasBasePay: boolean;
  reason: string;
}

const REASONS = ["Sin fichaje", "Sin pago consolidado", "Sin Weekend Job"] as const;

export default function UnpaidShiftsReport() {
  const { selectedCompanyId } = useCompany();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UnpaidItem[]>([]);
  const [periods, setPeriods] = useState<{ id: string; label: string; start: string; end: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");

  // Filters
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("");

  useEffect(() => {
    if (!selectedCompanyId) return;
    (async () => {
      const { data } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date, status")
        .eq("company_id", selectedCompanyId)
        .gte("start_date", "2025-01-01")
        .order("start_date", { ascending: false });
      setPeriods(
        (data ?? []).map((p) => ({
          id: p.id,
          label: `${format(new Date(p.start_date + "T12:00:00"), "dd MMM")} – ${format(new Date(p.end_date + "T12:00:00"), "dd MMM yyyy")} (${p.status})`,
          start: p.start_date,
          end: p.end_date,
        }))
      );
    })();
  }, [selectedCompanyId]);

  const analyze = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    try {
      const dateFrom = "2025-01-01";
      const dateTo = new Date().toISOString().split("T")[0];

      let periodFilter: { start: string; end: string } | null = null;
      if (selectedPeriod !== "all") {
        const p = periods.find((pp) => pp.id === selectedPeriod);
        if (p) periodFilter = { start: p.start, end: p.end };
      }

      const effectiveFrom = periodFilter?.start ?? dateFrom;
      const effectiveTo = periodFilter?.end ?? dateTo;

      // 1. Shifts in range
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, title, date, start_time, end_time, company_id, deleted_at")
        .eq("company_id", selectedCompanyId)
        .is("deleted_at", null)
        .gte("date", effectiveFrom)
        .lte("date", effectiveTo)
        .order("date");

      if (!shifts || shifts.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const shiftIds = shifts.map((s) => s.id);

      // Assignments
      const allAssignments: any[] = [];
      for (let i = 0; i < shiftIds.length; i += 200) {
        const chunk = shiftIds.slice(i, i + 200);
        const { data } = await supabase
          .from("shift_assignments")
          .select("shift_id, employee_id, status")
          .eq("company_id", selectedCompanyId)
          .in("shift_id", chunk)
          .in("status", ["accepted", "pending"]);
        if (data) allAssignments.push(...data);
      }

      // Time entries
      const { data: timeEntries } = await supabase
        .from("time_entries")
        .select("shift_id, employee_id, status")
        .eq("company_id", selectedCompanyId)
        .in("shift_id", shiftIds)
        .neq("status", "rejected");

      // Employees
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", selectedCompanyId);

      const empMap = new Map<string, string>();
      (employees ?? []).forEach((e) => empMap.set(e.id, formatPersonName(`${e.first_name} ${e.last_name}`)));

      // Periods
      const { data: allPeriods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date")
        .eq("company_id", selectedCompanyId)
        .gte("start_date", "2024-12-01");

      const periodIds = (allPeriods ?? []).map((p) => p.id);

      // Base pay
      let allBasePay: any[] = [];
      for (let i = 0; i < periodIds.length; i += 200) {
        const chunk = periodIds.slice(i, i + 200);
        const { data } = await supabase
          .from("period_base_pay")
          .select("employee_id, period_id, base_total_pay")
          .eq("company_id", selectedCompanyId)
          .in("period_id", chunk);
        if (data) allBasePay.push(...data);
      }

      // Weekend Job concept
      const { data: weekendConcept } = await supabase
        .from("concepts")
        .select("id")
        .eq("company_id", selectedCompanyId)
        .eq("name", "Weekend Job")
        .eq("is_active", true)
        .maybeSingle();

      // Weekend Job movements
      let weekendMovementSet = new Set<string>();
      if (weekendConcept) {
        let allWkMov: any[] = [];
        for (let i = 0; i < periodIds.length; i += 200) {
          const chunk = periodIds.slice(i, i + 200);
          const { data } = await supabase
            .from("movements")
            .select("employee_id, period_id")
            .eq("company_id", selectedCompanyId)
            .eq("concept_id", weekendConcept.id)
            .in("period_id", chunk);
          if (data) allWkMov.push(...data);
        }
        weekendMovementSet = new Set(allWkMov.map((m) => `${m.period_id}_${m.employee_id}`));
      }

      const clockedSet = new Set(
        (timeEntries ?? []).map((te) => `${te.shift_id}_${te.employee_id}`)
      );
      const basePaySet = new Set(
        allBasePay.map((bp) => `${bp.period_id}_${bp.employee_id}`)
      );

      const findPeriod = (date: string) =>
        (allPeriods ?? []).find((p) => date >= p.start_date && date <= p.end_date);

      const result: UnpaidItem[] = [];
      const shiftMap = new Map(shifts.map((s) => [s.id, s]));

      // Track employees with weekend shifts per period (to flag missing Weekend Job movement)
      const weekendShiftsByEmpPeriod = new Map<string, { employeeId: string; periodId: string; shift: any }>();

      for (const assignment of allAssignments) {
        const shift = shiftMap.get(assignment.shift_id);
        if (!shift) continue;

        const hasClock = clockedSet.has(`${shift.id}_${assignment.employee_id}`);
        const period = findPeriod(shift.date);
        const hasBasePay = period ? basePaySet.has(`${period.id}_${assignment.employee_id}`) : false;

        // Check if weekend (0=Sun, 6=Sat)
        const dayOfWeek = getDay(new Date(shift.date + "T12:00:00"));
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (!hasClock) {
          result.push({
            employeeId: assignment.employee_id,
            employeeName: empMap.get(assignment.employee_id) ?? "Desconocido",
            shiftId: shift.id,
            shiftTitle: shift.title,
            shiftDate: shift.date,
            startTime: shift.start_time,
            endTime: shift.end_time,
            periodId: period?.id ?? null,
            periodLabel: period
              ? `${format(new Date(period.start_date + "T12:00:00"), "dd MMM")} – ${format(new Date(period.end_date + "T12:00:00"), "dd MMM")}`
              : "Sin periodo",
            hasClock: false,
            hasBasePay,
            reason: "Sin fichaje",
          });
        } else if (!hasBasePay && period) {
          result.push({
            employeeId: assignment.employee_id,
            employeeName: empMap.get(assignment.employee_id) ?? "Desconocido",
            shiftId: shift.id,
            shiftTitle: shift.title,
            shiftDate: shift.date,
            startTime: shift.start_time,
            endTime: shift.end_time,
            periodId: period.id,
            periodLabel: `${format(new Date(period.start_date + "T12:00:00"), "dd MMM")} – ${format(new Date(period.end_date + "T12:00:00"), "dd MMM")}`,
            hasClock: true,
            hasBasePay: false,
            reason: "Sin pago consolidado",
          });
        }

        // Track weekend shifts with clock-in for Weekend Job validation
        if (isWeekend && hasClock && period && weekendConcept) {
          const key = `${period.id}_${assignment.employee_id}`;
          if (!weekendShiftsByEmpPeriod.has(key)) {
            weekendShiftsByEmpPeriod.set(key, { employeeId: assignment.employee_id, periodId: period.id, shift });
          }
        }
      }

      // Flag missing Weekend Job movements
      for (const [key, info] of weekendShiftsByEmpPeriod) {
        if (!weekendMovementSet.has(key)) {
          const period = (allPeriods ?? []).find((p) => p.id === info.periodId);
          result.push({
            employeeId: info.employeeId,
            employeeName: empMap.get(info.employeeId) ?? "Desconocido",
            shiftId: info.shift.id,
            shiftTitle: info.shift.title,
            shiftDate: info.shift.date,
            startTime: info.shift.start_time,
            endTime: info.shift.end_time,
            periodId: info.periodId,
            periodLabel: period
              ? `${format(new Date(period.start_date + "T12:00:00"), "dd MMM")} – ${format(new Date(period.end_date + "T12:00:00"), "dd MMM")}`
              : "Sin periodo",
            hasClock: true,
            hasBasePay: true,
            reason: "Sin Weekend Job",
          });
        }
      }

      result.sort((a, b) => b.shiftDate.localeCompare(a.shiftDate));
      setItems(result);
    } catch (err) {
      console.error("UnpaidShiftsReport error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = items;
    if (filterReason !== "all") list = list.filter((i) => i.reason === filterReason);
    if (filterEmployee.trim()) {
      const q = filterEmployee.toLowerCase();
      list = list.filter((i) => i.employeeName.toLowerCase().includes(q));
    }
    return list;
  }, [items, filterReason, filterEmployee]);

  const stats = useMemo(() => {
    const noClock = items.filter((i) => i.reason === "Sin fichaje").length;
    const noPay = items.filter((i) => i.reason === "Sin pago consolidado").length;
    const noWeekend = items.filter((i) => i.reason === "Sin Weekend Job").length;
    const uniqueEmps = new Set(items.map((i) => i.employeeId)).size;
    return { total: items.length, noClock, noPay, noWeekend, uniqueEmps };
  }, [items]);

  const handleExportCSV = (): string[][] => {
    const headers = ["Empleado", "Turno", "Fecha", "Horario", "Periodo", "Razón"];
    const rows = filtered.map((i) => [
      i.employeeName,
      i.shiftTitle,
      i.shiftDate,
      `${i.startTime ?? ""} - ${i.endTime ?? ""}`,
      i.periodLabel,
      i.reason,
    ]);
    return [headers, ...rows];
  };

  const reasonBadgeVariant = (reason: string) => {
    if (reason === "Sin fichaje") return "destructive";
    if (reason === "Sin Weekend Job") return "outline";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        variant="4"
        eyebrow="AUDITORÍA"
        title="Turnos sin pago"
        subtitle="Programaciones vs fichajes y pagos desde enero 2025"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Periodo</label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Todos los periodos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos (desde Ene 2026)</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={analyze} disabled={loading || !selectedCompanyId}>
          <Search className="h-4 w-4 mr-1.5" />
          {loading ? "Analizando…" : "Analizar"}
        </Button>

        {items.length > 0 && (
          <ReportActionsBar title="Turnos sin pago" onExportCSV={handleExportCSV} />
        )}
      </div>

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="Total incidencias" value={stats.total} icon={<AlertTriangle className="h-5 w-5 text-warning" />} accent="warning" />
            <KpiCard label="Sin fichaje" value={stats.noClock} icon={<Clock className="h-5 w-5 text-deduction" />} accent="deduction" />
            <KpiCard label="Sin pago consolidado" value={stats.noPay} icon={<DollarSign className="h-5 w-5 text-primary" />} accent="primary" />
            <KpiCard label="Sin Weekend Job" value={stats.noWeekend} icon={<Sun className="h-5 w-5 text-amber-500" />} accent="warning" />
            <KpiCard label="Empleados afectados" value={stats.uniqueEmps} icon={<CalendarCheck className="h-5 w-5 text-earning" />} accent="earning" />
          </div>

          {/* Filters bar */}
          <div className="flex items-center gap-2 flex-wrap rounded-xl bg-card/40 border border-border/15 shadow-sm px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
              <Input
                placeholder="Buscar empleado..."
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="h-7 text-[11px] pl-7 w-[160px] rounded-lg bg-transparent border-border/20 focus:w-[220px] transition-all"
              />
            </div>

            <div className="h-4 w-px bg-border/20 mx-0.5" />

            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="h-7 text-[10px] w-[180px] rounded-lg bg-transparent border-border/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las razones</SelectItem>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(filterReason !== "all" || filterEmployee) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] px-2 text-muted-foreground/40 rounded-lg ml-auto"
                onClick={() => { setFilterReason("all"); setFilterEmployee(""); }}
              >
                <X className="h-3 w-3 mr-0.5" /> Limpiar
              </Button>
            )}
          </div>
        </>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Sin resultados"
          description="Presiona 'Analizar' para buscar turnos programados sin fichaje o sin pago."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Razón</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item, idx) => (
                    <TableRow key={`${item.shiftId}-${item.employeeId}-${idx}`}>
                      <TableCell className="font-medium">{item.employeeName}</TableCell>
                      <TableCell>{item.shiftTitle}</TableCell>
                      <TableCell>{format(new Date(item.shiftDate + "T12:00:00"), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {item.startTime ?? "–"} — {item.endTime ?? "–"}
                      </TableCell>
                      <TableCell className="text-xs">{item.periodLabel}</TableCell>
                      <TableCell>
                        <Badge variant={reasonBadgeVariant(item.reason)}>
                          {item.reason}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="p-3 text-xs text-muted-foreground border-t">
              Mostrando {filtered.length} de {items.length} incidencias
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
