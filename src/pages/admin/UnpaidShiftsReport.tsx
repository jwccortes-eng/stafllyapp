import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPersonName } from "@/lib/format-helpers";
import { AlertTriangle, DollarSign, Clock, CalendarCheck, Search } from "lucide-react";
import { format } from "date-fns";

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

export default function UnpaidShiftsReport() {
  const { selectedCompanyId } = useCompany();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UnpaidItem[]>([]);
  const [periods, setPeriods] = useState<{ id: string; label: string; start: string; end: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const [filterReason, setFilterReason] = useState<string>("all");

  // Load periods from Jan 2026
  useEffect(() => {
    if (!selectedCompanyId) return;
    (async () => {
      const { data } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date, status")
        .eq("company_id", selectedCompanyId)
        .gte("start_date", "2026-01-01")
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
      const dateFrom = "2026-01-01";
      const dateTo = new Date().toISOString().split("T")[0];

      // Filter by period if selected
      let periodFilter: { start: string; end: string } | null = null;
      if (selectedPeriod !== "all") {
        const p = periods.find((pp) => pp.id === selectedPeriod);
        if (p) periodFilter = { start: p.start, end: p.end };
      }

      const effectiveFrom = periodFilter?.start ?? dateFrom;
      const effectiveTo = periodFilter?.end ?? dateTo;

      // 1. Get all shift assignments in range
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

      // Chunk fetch assignments
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

      // 2. Get time entries in range
      const { data: timeEntries } = await supabase
        .from("time_entries")
        .select("shift_id, employee_id, status")
        .eq("company_id", selectedCompanyId)
        .in("shift_id", shiftIds)
        .neq("status", "rejected");

      // 3. Get employees
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", selectedCompanyId);

      const empMap = new Map<string, string>();
      (employees ?? []).forEach((e) => empMap.set(e.id, formatPersonName(`${e.first_name} ${e.last_name}`)));

      // 4. Get periods map
      const { data: allPeriods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date")
        .eq("company_id", selectedCompanyId)
        .gte("start_date", "2025-12-01");

      // 5. Get base pay records
      const periodIds = (allPeriods ?? []).map((p) => p.id);
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

      const clockedSet = new Set(
        (timeEntries ?? []).map((te) => `${te.shift_id}_${te.employee_id}`)
      );

      const basePaySet = new Set(
        allBasePay.map((bp) => `${bp.period_id}_${bp.employee_id}`)
      );

      // Find period for a date
      const findPeriod = (date: string) => {
        return (allPeriods ?? []).find(
          (p) => date >= p.start_date && date <= p.end_date
        );
      };

      // Build unpaid items
      const result: UnpaidItem[] = [];
      const shiftMap = new Map(shifts.map((s) => [s.id, s]));

      for (const assignment of allAssignments) {
        const shift = shiftMap.get(assignment.shift_id);
        if (!shift) continue;

        const hasClock = clockedSet.has(`${shift.id}_${assignment.employee_id}`);
        const period = findPeriod(shift.date);
        const hasBasePay = period
          ? basePaySet.has(`${period.id}_${assignment.employee_id}`)
          : false;

        // Flag if no clock-in (potential unpaid)
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
    if (filterReason === "all") return items;
    return items.filter((i) => i.reason === filterReason);
  }, [items, filterReason]);

  const stats = useMemo(() => {
    const noClock = items.filter((i) => i.reason === "Sin fichaje").length;
    const noPay = items.filter((i) => i.reason === "Sin pago consolidado").length;
    const uniqueEmps = new Set(items.map((i) => i.employeeId)).size;
    return { total: items.length, noClock, noPay, uniqueEmps };
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

  return (
    <div className="space-y-6">
      <PageHeader
        variant="4"
        eyebrow="AUDITORÍA"
        title="Turnos sin pago"
        subtitle="Programaciones vs fichajes y pagos desde enero 2026"
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
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Total incidencias" value={stats.total} icon={AlertTriangle} />
            <KpiCard label="Sin fichaje" value={stats.noClock} icon={Clock} />
            <KpiCard label="Sin pago consolidado" value={stats.noPay} icon={DollarSign} />
            <KpiCard label="Empleados afectados" value={stats.uniqueEmps} icon={CalendarCheck} />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Filtrar:</label>
            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las razones</SelectItem>
                <SelectItem value="Sin fichaje">Sin fichaje</SelectItem>
                <SelectItem value="Sin pago consolidado">Sin pago consolidado</SelectItem>
              </SelectContent>
            </Select>
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
                        <Badge variant={item.reason === "Sin fichaje" ? "destructive" : "secondary"}>
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
