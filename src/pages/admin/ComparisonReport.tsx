import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/ui/kpi-card";
import { CalendarDays, Clock, CheckCircle2, XCircle, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { es } from "date-fns/locale";

interface ShiftRow {
  id: string;
  title: string;
  shift_code: string | null;
  date: string;
  start_time: string;
  end_time: string;
  client_id: string | null;
  slots: number | null;
}

interface AssignmentRow {
  shift_id: string;
  employee_id: string;
  status: string;
}

interface TimeEntryRow {
  shift_id: string | null;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  break_minutes: number | null;
}

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
}

interface ClientRow {
  id: string;
  name: string;
}

interface ComparisonItem {
  shiftId: string;
  shiftTitle: string;
  shiftCode: string | null;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  scheduledEmployees: { id: string; name: string }[];
  clockedEmployees: { id: string; name: string; hours: number }[];
  noShows: { id: string; name: string }[];
  extras: { id: string; name: string; hours: number }[];
  status: "full" | "partial" | "empty" | "over";
  scheduledHours: number;
  workedHours: number;
}

export default function ComparisonReport() {
  const { selectedCompanyId } = useCompany();
  const [dateFrom, setDateFrom] = useState(() => format(startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ComparisonItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const analyze = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const [{ data: shifts }, { data: assignments }, { data: timeEntries }, { data: employees }, { data: clients }] = await Promise.all([
      supabase.from("scheduled_shifts").select("id, title, shift_code, date, start_time, end_time, client_id, slots")
        .eq("company_id", selectedCompanyId).is("deleted_at", null)
        .gte("date", dateFrom).lte("date", dateTo).order("date"),
      supabase.from("shift_assignments").select("shift_id, employee_id, status")
        .eq("company_id", selectedCompanyId).in("status", ["accepted", "pending", "confirmed"]),
      supabase.from("time_entries").select("shift_id, employee_id, clock_in, clock_out, status, break_minutes")
        .eq("company_id", selectedCompanyId).neq("status", "rejected"),
      supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId),
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
    ]);

    const empMap = new Map<string, string>();
    (employees ?? []).forEach(e => empMap.set(e.id, `${e.first_name} ${e.last_name}`));
    const clientMap = new Map<string, string>();
    (clients ?? []).forEach(c => clientMap.set(c.id, c.name));

    const shiftIds = new Set((shifts ?? []).map(s => s.id));
    const filteredAssignments = (assignments ?? []).filter(a => shiftIds.has(a.shift_id));
    const filteredEntries = (timeEntries ?? []).filter(te => te.shift_id && shiftIds.has(te.shift_id));

    const result: ComparisonItem[] = (shifts ?? []).map(shift => {
      const sAssign = filteredAssignments.filter(a => a.shift_id === shift.id);
      const sEntries = filteredEntries.filter(te => te.shift_id === shift.id);

      const assignedSet = new Set(sAssign.map(a => a.employee_id));
      const clockedSet = new Set(sEntries.map(te => te.employee_id));

      const scheduledEmployees = sAssign.map(a => ({ id: a.employee_id, name: empMap.get(a.employee_id) ?? "?" }));
      const clockedEmployees = sEntries.map(te => {
        let hours = 0;
        if (te.clock_in && te.clock_out) {
          hours = (new Date(te.clock_out).getTime() - new Date(te.clock_in).getTime()) / 3600000;
          hours -= (te.break_minutes ?? 0) / 60;
        }
        return { id: te.employee_id, name: empMap.get(te.employee_id) ?? "?", hours: Math.round(hours * 100) / 100 };
      });

      const noShows = scheduledEmployees.filter(e => !clockedSet.has(e.id));
      const extras = clockedEmployees.filter(e => !assignedSet.has(e.id));

      // Calc scheduled hours
      const [sh, sm] = shift.start_time.split(":").map(Number);
      const [eh, em] = shift.end_time.split(":").map(Number);
      let scheduledHours = (eh * 60 + em - sh * 60 - sm) / 60;
      if (scheduledHours < 0) scheduledHours += 24;
      scheduledHours *= (shift.slots ?? 1);

      const workedHours = clockedEmployees.reduce((s, e) => s + e.hours, 0);

      let status: ComparisonItem["status"] = "full";
      if (assignedSet.size === 0 && clockedSet.size === 0) status = "empty";
      else if (noShows.length > 0 && clockedSet.size === 0) status = "empty";
      else if (noShows.length > 0) status = "partial";
      else if (extras.length > 0) status = "over";

      return {
        shiftId: shift.id,
        shiftTitle: shift.title,
        shiftCode: shift.shift_code,
        date: shift.date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        clientName: shift.client_id ? (clientMap.get(shift.client_id) ?? "—") : "—",
        scheduledEmployees,
        clockedEmployees,
        noShows,
        extras,
        status,
        scheduledHours: Math.round(scheduledHours * 100) / 100,
        workedHours: Math.round(workedHours * 100) / 100,
      };
    });

    setItems(result);
    setLoading(false);
  };

  useEffect(() => { if (selectedCompanyId) analyze(); }, [selectedCompanyId, dateFrom, dateTo]);

  const filtered = filterStatus === "all" ? items : items.filter(i => i.status === filterStatus);

  const stats = useMemo(() => {
    const total = items.length;
    const full = items.filter(i => i.status === "full").length;
    const partial = items.filter(i => i.status === "partial").length;
    const empty = items.filter(i => i.status === "empty").length;
    const totalScheduled = items.reduce((s, i) => s + i.scheduledHours, 0);
    const totalWorked = items.reduce((s, i) => s + i.workedHours, 0);
    const totalNoShows = items.reduce((s, i) => s + i.noShows.length, 0);
    const totalExtras = items.reduce((s, i) => s + i.extras.length, 0);
    return { total, full, partial, empty, totalScheduled, totalWorked, totalNoShows, totalExtras };
  }, [items]);

  const statusBadge = (s: ComparisonItem["status"]) => {
    switch (s) {
      case "full": return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-[10px]">Completo</Badge>;
      case "partial": return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-[10px]">Parcial</Badge>;
      case "empty": return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-[10px]">Sin fichaje</Badge>;
      case "over": return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px]">Excedido</Badge>;
    }
  };

  const handleExport = () => {
    const rows = filtered.map(i => ({
      Fecha: i.date,
      Código: i.shiftCode ?? "",
      Turno: i.shiftTitle,
      Cliente: i.clientName,
      Horario: `${i.startTime}-${i.endTime}`,
      "Programados": i.scheduledEmployees.map(e => e.name).join(", "),
      "Ficharon": i.clockedEmployees.map(e => `${e.name} (${e.hours}h)`).join(", "),
      "No-shows": i.noShows.map(e => e.name).join(", "),
      "Extras": i.extras.map(e => e.name).join(", "),
      "Horas Prog.": i.scheduledHours,
      "Horas Trab.": i.workedHours,
      Estado: i.status,
    }));
    const headers = Object.keys(rows[0] ?? {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${(r as any)[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comparacion-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        variant="3"
        title="Connecteam vs StaflyApps"
        subtitle="Comparación: programación vs ejecución real"
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">Desde</Label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="block mt-1 border rounded-lg px-3 py-1.5 text-sm bg-background" />
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="full">Completo</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                  <SelectItem value="empty">Sin fichaje</SelectItem>
                  <SelectItem value="over">Excedido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Turnos" value={stats.total} icon={<CalendarDays className="h-4 w-4" />} />
        <KpiCard label="Cobertura completa" value={stats.total > 0 ? `${Math.round((stats.full / stats.total) * 100)}%` : "—"} icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="No-shows" value={stats.totalNoShows} icon={<XCircle className="h-4 w-4" />} />
        <KpiCard label="Horas prog. vs trab." value={`${Math.round(stats.totalScheduled)}h → ${Math.round(stats.totalWorked)}h`} icon={<Clock className="h-4 w-4" />} />
      </div>

      {/* Summary bars */}
      {stats.total > 0 && (
        <Card className="p-4">
          <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
            <div className="bg-emerald-400" style={{ width: `${(stats.full / stats.total) * 100}%` }} title={`Completos: ${stats.full}`} />
            <div className="bg-amber-400" style={{ width: `${(stats.partial / stats.total) * 100}%` }} title={`Parciales: ${stats.partial}`} />
            <div className="bg-red-400" style={{ width: `${(stats.empty / stats.total) * 100}%` }} title={`Sin fichaje: ${stats.empty}`} />
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Completos ({stats.full})</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Parciales ({stats.partial})</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Sin fichaje ({stats.empty})</span>
          </div>
        </Card>
      )}

      {/* Detail table */}
      {loading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Cargando análisis…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No hay turnos en este rango de fechas</Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Código</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Horario</TableHead>
                  <TableHead className="text-xs">Programados</TableHead>
                  <TableHead className="text-xs">Ficharon</TableHead>
                  <TableHead className="text-xs">No-shows</TableHead>
                  <TableHead className="text-xs">Extras</TableHead>
                  <TableHead className="text-xs text-right">Horas</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => (
                  <TableRow key={item.shiftId}>
                    <TableCell className="text-xs tabular-nums">{item.date}</TableCell>
                    <TableCell className="text-xs font-mono">{item.shiftCode ? `#${item.shiftCode.toString().padStart(4, "0")}` : "—"}</TableCell>
                    <TableCell className="text-xs font-medium max-w-32 truncate">{item.clientName}</TableCell>
                    <TableCell className="text-xs tabular-nums">{item.startTime?.slice(0,5)}-{item.endTime?.slice(0,5)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1 max-w-48">
                        {item.scheduledEmployees.slice(0, 3).map(e => (
                          <Badge key={e.id} variant="secondary" className="text-[10px]">{e.name.split(" ")[0]}</Badge>
                        ))}
                        {item.scheduledEmployees.length > 3 && <Badge variant="outline" className="text-[10px]">+{item.scheduledEmployees.length - 3}</Badge>}
                        {item.scheduledEmployees.length === 0 && <span className="text-muted-foreground/40">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1 max-w-48">
                        {item.clockedEmployees.slice(0, 3).map(e => (
                          <Badge key={e.id} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-[10px]">
                            {e.name.split(" ")[0]} ({e.hours}h)
                          </Badge>
                        ))}
                        {item.clockedEmployees.length > 3 && <Badge variant="outline" className="text-[10px]">+{item.clockedEmployees.length - 3}</Badge>}
                        {item.clockedEmployees.length === 0 && <span className="text-muted-foreground/40">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.noShows.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.noShows.map(e => (
                            <Badge key={e.id} className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-[10px]">{e.name.split(" ")[0]}</Badge>
                          ))}
                        </div>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.extras.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.extras.map(e => (
                            <Badge key={e.id} className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px]">{e.name.split(" ")[0]}</Badge>
                          ))}
                        </div>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      <span className="text-muted-foreground">{item.scheduledHours}h</span>
                      <span className="mx-1">→</span>
                      <span className={item.workedHours < item.scheduledHours * 0.9 ? "text-red-600 font-medium" : item.workedHours > item.scheduledHours * 1.1 ? "text-blue-600 font-medium" : "text-emerald-600 font-medium"}>
                        {item.workedHours}h
                      </span>
                    </TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
