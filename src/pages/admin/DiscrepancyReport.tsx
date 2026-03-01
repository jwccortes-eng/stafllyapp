import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  AlertTriangle, CheckCircle2, Clock, Users, XCircle, CalendarDays,
  Search, Download, Filter, ArrowDownRight, ArrowUpRight, CalendarClock,
} from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { writeExcelFile } from "@/lib/safe-xlsx";

interface DiscrepancyItem {
  shiftId: string;
  shiftTitle: string;
  shiftCode: string | null;
  date: string;
  payType: string;
  scheduledStart: string;
  scheduledEnd: string;
  employeeId: string;
  employeeName: string;
  type: "no_show" | "late_arrival" | "early_departure" | "extra_clock" | "ok";
  clockIn: string | null;
  clockOut: string | null;
  minutesDiff: number; // positive = late/short, negative = early/extra
  hoursWorked: number;
}

function getTypeLabel(type: DiscrepancyItem["type"]) {
  switch (type) {
    case "no_show": return { label: "No fichó", color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-950/30" };
    case "late_arrival": return { label: "Llegada tarde", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950/30" };
    case "early_departure": return { label: "Salida temprana", color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-950/30" };
    case "extra_clock": return { label: "Sin turno", color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950/30" };
    case "ok": return { label: "OK", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950/30" };
  }
}

const LATE_THRESHOLD_MINUTES = 5;

export default function DiscrepancyReport() {
  const { selectedCompanyId } = useCompany();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<DiscrepancyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const analyze = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    try {
      // Fetch shifts, assignments, time_entries, employees in parallel
      const [{ data: shifts }, { data: employees }] = await Promise.all([
        supabase
          .from("scheduled_shifts")
          .select("id, title, shift_code, date, start_time, end_time, pay_type, client_id")
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null)
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date"),
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("company_id", selectedCompanyId),
      ]);

      if (!shifts || !employees) {
        setItems([]);
        setLoading(false);
        return;
      }

      const shiftIds = shifts.map(s => s.id);
      if (shiftIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const [{ data: assignments }, { data: timeEntries }] = await Promise.all([
        supabase
          .from("shift_assignments")
          .select("shift_id, employee_id, status")
          .eq("company_id", selectedCompanyId)
          .in("shift_id", shiftIds)
          .in("status", ["accepted", "pending", "confirmed"]),
        supabase
          .from("time_entries")
          .select("shift_id, employee_id, clock_in, clock_out, status, break_minutes")
          .eq("company_id", selectedCompanyId)
          .neq("status", "rejected")
          .gte("clock_in", `${dateFrom}T00:00:00`)
          .lte("clock_in", `${dateTo}T23:59:59`),
      ]);

      const empMap = new Map<string, string>();
      employees.forEach(e => empMap.set(e.id, formatPersonName(`${e.first_name} ${e.last_name}`)));

      const result: DiscrepancyItem[] = [];

      // For each shift, check each assigned employee
      for (const shift of shifts) {
        const shiftAssignments = (assignments ?? []).filter(a => a.shift_id === shift.id);
        const shiftEntries = (timeEntries ?? []).filter(te => te.shift_id === shift.id);
        const clockedEmployeeIds = new Set(shiftEntries.map(te => te.employee_id));

        for (const assignment of shiftAssignments) {
          const empName = empMap.get(assignment.employee_id) ?? "Desconocido";
          const entry = shiftEntries.find(te => te.employee_id === assignment.employee_id);

          if (!entry) {
            // No-show: assigned but no clock-in
            result.push({
              shiftId: shift.id,
              shiftTitle: shift.title,
              shiftCode: shift.shift_code,
              date: shift.date,
              payType: shift.pay_type ?? "hourly",
              scheduledStart: shift.start_time,
              scheduledEnd: shift.end_time,
              employeeId: assignment.employee_id,
              employeeName: empName,
              type: "no_show",
              clockIn: null,
              clockOut: null,
              minutesDiff: 0,
              hoursWorked: 0,
            });
            continue;
          }

          // Has clock entry — check for lateness/early departure
          const hoursWorked = entry.clock_in && entry.clock_out
            ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000 - (entry.break_minutes ?? 0) / 60
            : 0;

          // For daily-pay shifts, just mark as OK if they showed up
          if (shift.pay_type === "daily") {
            result.push({
              shiftId: shift.id, shiftTitle: shift.title, shiftCode: shift.shift_code,
              date: shift.date, payType: "daily",
              scheduledStart: shift.start_time, scheduledEnd: shift.end_time,
              employeeId: assignment.employee_id, employeeName: empName,
              type: "ok", clockIn: entry.clock_in, clockOut: entry.clock_out,
              minutesDiff: 0, hoursWorked: Math.round(hoursWorked * 100) / 100,
            });
            continue;
          }

          // Hourly: check late arrival
          let type: DiscrepancyItem["type"] = "ok";
          let minutesDiff = 0;

          if (entry.clock_in) {
            const scheduledStartDT = new Date(`${shift.date}T${shift.start_time}`);
            const clockInDT = new Date(entry.clock_in);
            const lateMin = differenceInMinutes(clockInDT, scheduledStartDT);
            if (lateMin > LATE_THRESHOLD_MINUTES) {
              type = "late_arrival";
              minutesDiff = lateMin;
            }
          }

          // Check early departure
          if (entry.clock_out && type === "ok") {
            const scheduledEndDT = new Date(`${shift.date}T${shift.end_time}`);
            const clockOutDT = new Date(entry.clock_out);
            const earlyMin = differenceInMinutes(scheduledEndDT, clockOutDT);
            if (earlyMin > LATE_THRESHOLD_MINUTES) {
              type = "early_departure";
              minutesDiff = earlyMin;
            }
          }

          result.push({
            shiftId: shift.id, shiftTitle: shift.title, shiftCode: shift.shift_code,
            date: shift.date, payType: "hourly",
            scheduledStart: shift.start_time, scheduledEnd: shift.end_time,
            employeeId: assignment.employee_id, employeeName: empName,
            type, clockIn: entry.clock_in, clockOut: entry.clock_out,
            minutesDiff, hoursWorked: Math.round(hoursWorked * 100) / 100,
          });
        }

        // Extra clocks: time entries for this shift from non-assigned employees
        for (const entry of shiftEntries) {
          if (!shiftAssignments.find(a => a.employee_id === entry.employee_id)) {
            const hoursWorked = entry.clock_in && entry.clock_out
              ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000 - (entry.break_minutes ?? 0) / 60
              : 0;
            result.push({
              shiftId: shift.id, shiftTitle: shift.title, shiftCode: shift.shift_code,
              date: shift.date, payType: shift.pay_type ?? "hourly",
              scheduledStart: shift.start_time, scheduledEnd: shift.end_time,
              employeeId: entry.employee_id,
              employeeName: empMap.get(entry.employee_id) ?? "Desconocido",
              type: "extra_clock", clockIn: entry.clock_in, clockOut: entry.clock_out,
              minutesDiff: 0, hoursWorked: Math.round(hoursWorked * 100) / 100,
            });
          }
        }
      }

      // Also find time entries NOT linked to any shift (unplanned work)
      const unlinkedEntries = (timeEntries ?? []).filter(te => !te.shift_id);
      for (const entry of unlinkedEntries) {
        const hoursWorked = entry.clock_in && entry.clock_out
          ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000 - (entry.break_minutes ?? 0) / 60
          : 0;
        result.push({
          shiftId: "", shiftTitle: "(Sin turno programado)", shiftCode: null,
          date: entry.clock_in ? new Date(entry.clock_in).toISOString().slice(0, 10) : "",
          payType: "hourly",
          scheduledStart: "", scheduledEnd: "",
          employeeId: entry.employee_id,
          employeeName: empMap.get(entry.employee_id) ?? "Desconocido",
          type: "extra_clock", clockIn: entry.clock_in, clockOut: entry.clock_out,
          minutesDiff: 0, hoursWorked: Math.round(hoursWorked * 100) / 100,
        });
      }

      // Sort: issues first, then by date
      result.sort((a, b) => {
        const typeOrder = { no_show: 0, late_arrival: 1, early_departure: 2, extra_clock: 3, ok: 4 };
        const diff = typeOrder[a.type] - typeOrder[b.type];
        return diff !== 0 ? diff : a.date.localeCompare(b.date);
      });

      setItems(result);
    } catch (err) {
      console.error("Discrepancy analysis error:", err);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (selectedCompanyId) analyze();
  }, [selectedCompanyId]);

  const noShows = items.filter(i => i.type === "no_show");
  const lateArrivals = items.filter(i => i.type === "late_arrival");
  const earlyDepartures = items.filter(i => i.type === "early_departure");
  const extraClocks = items.filter(i => i.type === "extra_clock");
  const okItems = items.filter(i => i.type === "ok");
  const issues = items.filter(i => i.type !== "ok");

  const filtered = activeTab === "all" ? items
    : activeTab === "issues" ? issues
    : items.filter(i => i.type === activeTab);

  const handleExport = async () => {
    const data = filtered.map(i => ({
      Fecha: i.date,
      Turno: i.shiftCode ? `#${i.shiftCode.padStart(4, "0")} ${i.shiftTitle}` : i.shiftTitle,
      Tipo_Pago: i.payType === "daily" ? "Diario" : "Por hora",
      Empleado: i.employeeName,
      Estado: getTypeLabel(i.type).label,
      Hora_Programada: i.scheduledStart ? `${i.scheduledStart} - ${i.scheduledEnd}` : "—",
      Entrada: i.clockIn ? format(new Date(i.clockIn), "HH:mm") : "—",
      Salida: i.clockOut ? format(new Date(i.clockOut), "HH:mm") : "—",
      Horas: i.hoursWorked.toFixed(2),
      Diferencia_Min: i.minutesDiff || "—",
    }));
    await writeExcelFile(data, "Discrepancias", `discrepancias_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Discrepancias"
        subtitle="Programado vs. ejecutado — turnos y registros de reloj"
      />

      {/* Date filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">Desde</Label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
            </div>
            <Button onClick={analyze} disabled={loading} size="sm" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {loading ? "Analizando…" : "Analizar"}
            </Button>
            {items.length > 0 && (
              <ReportActionsBar
                title="Discrepancias"
                subtitle={`${dateFrom} — ${dateTo}`}
                onExportCSV={() => {
                  handleExport();
                  return [];
                }}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="No ficharon" value={noShows.length}
            icon={<XCircle className="h-4 w-4" />}
            className={noShows.length > 0 ? "border-rose-200 dark:border-rose-900" : ""} />
          <KpiCard label="Llegadas tarde" value={lateArrivals.length}
            icon={<ArrowDownRight className="h-4 w-4" />}
            className={lateArrivals.length > 0 ? "border-amber-200 dark:border-amber-900" : ""} />
          <KpiCard label="Salidas temprano" value={earlyDepartures.length}
            icon={<ArrowUpRight className="h-4 w-4" />}
            className={earlyDepartures.length > 0 ? "border-orange-200 dark:border-orange-900" : ""} />
          <KpiCard label="Sin turno" value={extraClocks.length}
            icon={<CalendarClock className="h-4 w-4" />}
            className={extraClocks.length > 0 ? "border-blue-200 dark:border-blue-900" : ""} />
          <KpiCard label="OK" value={okItems.length}
            icon={<CheckCircle2 className="h-4 w-4" />}
            className="border-emerald-200 dark:border-emerald-900" />
        </div>
      )}

      {/* Tabs + Table */}
      {items.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all" className="text-xs gap-1">
              Todos <Badge variant="secondary" className="text-[9px] px-1.5">{items.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="issues" className="text-xs gap-1">
              <AlertTriangle className="h-3 w-3" /> Incidencias <Badge variant="secondary" className="text-[9px] px-1.5">{issues.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="no_show" className="text-xs gap-1">
              🔴 No fichó <Badge variant="secondary" className="text-[9px] px-1.5">{noShows.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="extra_clock" className="text-xs gap-1">
              🔵 Sin turno <Badge variant="secondary" className="text-[9px] px-1.5">{extraClocks.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <Card className="mt-3">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Turno</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Empleado</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Programado</TableHead>
                    <TableHead className="text-xs">Real</TableHead>
                    <TableHead className="text-xs text-right">Horas</TableHead>
                    <TableHead className="text-xs text-right">Dif (min)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        Sin registros para este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.slice(0, 200).map((item, i) => {
                    const typeInfo = getTypeLabel(item.type);
                    return (
                      <TableRow key={`${item.shiftId}-${item.employeeId}-${i}`}>
                        <TableCell className="text-xs capitalize">
                          {item.date ? format(parseISO(item.date), "EEE d MMM", { locale: es }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.shiftCode && (
                            <span className="font-mono text-primary/60 mr-1">#{item.shiftCode.padStart(4, "0")}</span>
                          )}
                          <span className="font-medium">{item.shiftTitle}</span>
                          {item.payType === "daily" && (
                            <Badge variant="outline" className="ml-1.5 text-[8px] px-1 py-0">📅 Diario</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={cn("text-[9px]", typeInfo.bg, typeInfo.color)}>
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.employeeName}</TableCell>
                        <TableCell className="text-xs">
                          {item.type === "no_show" ? (
                            <span className="text-rose-600 font-medium">Ausente</span>
                          ) : item.type === "ok" ? (
                            <span className="text-emerald-600">✓</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {item.scheduledStart && item.scheduledEnd
                            ? `${item.scheduledStart.slice(0, 5)} – ${item.scheduledEnd.slice(0, 5)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {item.clockIn ? format(new Date(item.clockIn), "HH:mm") : "—"}
                          {item.clockOut ? ` – ${format(new Date(item.clockOut), "HH:mm")}` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {item.hoursWorked > 0 ? item.hoursWorked.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {item.minutesDiff > 0 ? (
                            <span className={cn(
                              item.type === "late_arrival" ? "text-amber-600" : "text-orange-600",
                              "font-medium"
                            )}>
                              +{item.minutesDiff}
                            </span>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length > 200 && (
                <p className="text-xs text-muted-foreground p-3">Mostrando 200 de {filtered.length} registros. Exporta para ver todos.</p>
              )}
            </CardContent>
          </Card>
        </Tabs>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Selecciona un rango de fechas y presiona "Analizar" para ver las discrepancias entre turnos programados y registros de reloj.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
