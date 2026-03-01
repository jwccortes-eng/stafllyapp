import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, CalendarDays,
  Search, ArrowDownRight, ArrowUpRight, CalendarClock,
  ChevronDown, ChevronRight, Check, Undo2, Eye, EyeOff,
} from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { writeExcelFile } from "@/lib/safe-xlsx";
import { toast } from "sonner";

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
  minutesDiff: number;
  hoursWorked: number;
}

type DiscrepancyType = DiscrepancyItem["type"];

const TYPE_CONFIG: Record<DiscrepancyType, { label: string; icon: React.ReactNode; colorClass: string; bgClass: string; borderClass: string }> = {
  no_show: {
    label: "No ficharon",
    icon: <XCircle className="h-4 w-4" />,
    colorClass: "text-destructive",
    bgClass: "bg-destructive/[0.04]",
    borderClass: "border-destructive/20",
  },
  late_arrival: {
    label: "Llegadas tarde",
    icon: <ArrowDownRight className="h-4 w-4" />,
    colorClass: "text-warning",
    bgClass: "bg-warning/[0.04]",
    borderClass: "border-warning/20",
  },
  early_departure: {
    label: "Salidas temprano",
    icon: <ArrowUpRight className="h-4 w-4" />,
    colorClass: "text-warning",
    bgClass: "bg-warning/[0.04]",
    borderClass: "border-warning/20",
  },
  extra_clock: {
    label: "Sin turno asignado",
    icon: <CalendarClock className="h-4 w-4" />,
    colorClass: "text-primary",
    bgClass: "bg-primary/[0.04]",
    borderClass: "border-primary/20",
  },
  ok: {
    label: "OK — Sin incidencias",
    icon: <CheckCircle2 className="h-4 w-4" />,
    colorClass: "text-success",
    bgClass: "bg-success/[0.04]",
    borderClass: "border-success/20",
  },
};

function getTypeLabel(type: DiscrepancyType) {
  const cfg = TYPE_CONFIG[type];
  return { label: cfg.label, color: cfg.colorClass, bg: cfg.bgClass };
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
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hideResolved, setHideResolved] = useState(false);

  const itemKey = (item: DiscrepancyItem, i: number) => `${item.shiftId}-${item.employeeId}-${item.type}-${i}`;

  const toggleResolved = (key: string) => {
    setResolvedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const resolveGroup = (type: DiscrepancyType) => {
    const groupItems = items
      .map((item, i) => ({ item, key: itemKey(item, i) }))
      .filter(({ item }) => item.type === type);
    setResolvedKeys(prev => {
      const next = new Set(prev);
      groupItems.forEach(({ key }) => next.add(key));
      return next;
    });
    toast.success(`${groupItems.length} incidencias marcadas como resueltas`);
  };

  const toggleGroup = (type: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const analyze = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    try {
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

      for (const shift of shifts) {
        const shiftAssignments = (assignments ?? []).filter(a => a.shift_id === shift.id);
        const shiftEntries = (timeEntries ?? []).filter(te => te.shift_id === shift.id);

        for (const assignment of shiftAssignments) {
          const empName = empMap.get(assignment.employee_id) ?? "Desconocido";
          const entry = shiftEntries.find(te => te.employee_id === assignment.employee_id);

          if (!entry) {
            result.push({
              shiftId: shift.id, shiftTitle: shift.title, shiftCode: shift.shift_code,
              date: shift.date, payType: shift.pay_type ?? "hourly",
              scheduledStart: shift.start_time, scheduledEnd: shift.end_time,
              employeeId: assignment.employee_id, employeeName: empName,
              type: "no_show", clockIn: null, clockOut: null, minutesDiff: 0, hoursWorked: 0,
            });
            continue;
          }

          const hoursWorked = entry.clock_in && entry.clock_out
            ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000 - (entry.break_minutes ?? 0) / 60
            : 0;

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

          let type: DiscrepancyType = "ok";
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

      result.sort((a, b) => {
        const typeOrder = { no_show: 0, late_arrival: 1, early_departure: 2, extra_clock: 3, ok: 4 };
        const diff = typeOrder[a.type] - typeOrder[b.type];
        return diff !== 0 ? diff : a.date.localeCompare(b.date);
      });

      setItems(result);
      setResolvedKeys(new Set());
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

  // Group filtered items by type
  const groupOrder: DiscrepancyType[] = ["no_show", "late_arrival", "early_departure", "extra_clock", "ok"];
  const grouped = groupOrder
    .map(type => ({
      type,
      config: TYPE_CONFIG[type],
      items: filtered.filter(i => i.type === type),
    }))
    .filter(g => g.items.length > 0);

  const resolvedCount = resolvedKeys.size;
  const unresolvedIssues = issues.filter((item, i) => !resolvedKeys.has(itemKey(item, i)));

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
      Resuelta: resolvedKeys.has(itemKey(i, filtered.indexOf(i))) ? "Sí" : "No",
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
                className="block mt-1 border border-border/40 rounded-lg px-3 py-1.5 text-sm bg-background" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="block mt-1 border border-border/40 rounded-lg px-3 py-1.5 text-sm bg-background" />
            </div>
            <Button onClick={analyze} disabled={loading} size="sm" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {loading ? "Analizando…" : "Analizar"}
            </Button>
            {items.length > 0 && (
              <>
                <ReportActionsBar
                  title="Discrepancias"
                  subtitle={`${dateFrom} — ${dateTo}`}
                  onExportCSV={() => {
                    handleExport();
                    return [];
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 ml-auto"
                  onClick={() => setHideResolved(!hideResolved)}
                >
                  {hideResolved ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {hideResolved ? "Mostrar resueltas" : "Ocultar resueltas"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="No ficharon" value={noShows.length}
            icon={<XCircle className="h-4 w-4" />}
            className={noShows.length > 0 ? "border-destructive/20" : ""} />
          <KpiCard label="Llegadas tarde" value={lateArrivals.length}
            icon={<ArrowDownRight className="h-4 w-4" />}
            className={lateArrivals.length > 0 ? "border-warning/20" : ""} />
          <KpiCard label="Salidas temprano" value={earlyDepartures.length}
            icon={<ArrowUpRight className="h-4 w-4" />}
            className={earlyDepartures.length > 0 ? "border-warning/20" : ""} />
          <KpiCard label="Sin turno" value={extraClocks.length}
            icon={<CalendarClock className="h-4 w-4" />}
            className={extraClocks.length > 0 ? "border-primary/20" : ""} />
          <KpiCard label="Resueltas" value={resolvedCount}
            icon={<CheckCircle2 className="h-4 w-4" />}
            className="border-success/20" />
        </div>
      )}

      {/* Tabs */}
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
              No fichó <Badge variant="secondary" className="text-[9px] px-1.5">{noShows.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="extra_clock" className="text-xs gap-1">
              Sin turno <Badge variant="secondary" className="text-[9px] px-1.5">{extraClocks.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* Grouped View */}
          <div className="mt-3 space-y-3">
            {grouped.map(group => {
              const isCollapsed = collapsedGroups.has(group.type);
              const groupResolved = group.items.filter((item, i) => {
                const globalIdx = items.indexOf(item);
                return resolvedKeys.has(itemKey(item, globalIdx));
              });
              const allResolved = groupResolved.length === group.items.length;

              return (
                <Card key={group.type} className={cn("overflow-hidden", group.config.borderClass)}>
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group.type)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30",
                      group.config.bgClass
                    )}
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                    <span className={cn("shrink-0", group.config.colorClass)}>{group.config.icon}</span>
                    <span className="font-semibold text-sm flex-1">{group.config.label}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {groupResolved.length > 0
                        ? `${groupResolved.length}/${group.items.length} resueltas`
                        : group.items.length}
                    </Badge>
                    {group.type !== "ok" && !allResolved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-success hover:text-success"
                        onClick={(e) => {
                          e.stopPropagation();
                          resolveGroup(group.type);
                        }}
                      >
                        <Check className="h-3 w-3" /> Resolver todas
                      </Button>
                    )}
                  </button>

                  {/* Group Table */}
                  {!isCollapsed && (
                    <CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-10"></TableHead>
                            <TableHead className="text-xs">Fecha</TableHead>
                            <TableHead className="text-xs">Turno</TableHead>
                            <TableHead className="text-xs">Empleado</TableHead>
                            <TableHead className="text-xs">Programado</TableHead>
                            <TableHead className="text-xs">Real</TableHead>
                            <TableHead className="text-xs text-right">Horas</TableHead>
                            <TableHead className="text-xs text-right">Dif (min)</TableHead>
                            <TableHead className="text-xs text-right">Acción</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.items.map((item, i) => {
                            const globalIdx = items.indexOf(item);
                            const key = itemKey(item, globalIdx);
                            const isResolved = resolvedKeys.has(key);

                            if (hideResolved && isResolved) return null;

                            return (
                              <TableRow
                                key={key}
                                className={cn(
                                  isResolved && "opacity-50 bg-success/[0.02]"
                                )}
                              >
                                <TableCell className="text-center">
                                  {isResolved && <CheckCircle2 className="h-3.5 w-3.5 text-success mx-auto" />}
                                </TableCell>
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
                                <TableCell className="text-xs font-medium">{item.employeeName}</TableCell>
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
                                      item.type === "late_arrival" ? "text-warning" : "text-warning",
                                      "font-medium"
                                    )}>
                                      +{item.minutesDiff}
                                    </span>
                                  ) : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {item.type !== "ok" && (
                                    <Button
                                      size="sm"
                                      variant={isResolved ? "ghost" : "outline"}
                                      className={cn(
                                        "h-7 text-xs gap-1",
                                        isResolved
                                          ? "text-muted-foreground"
                                          : "text-success hover:text-success hover:border-success/30"
                                      )}
                                      onClick={() => toggleResolved(key)}
                                    >
                                      {isResolved ? (
                                        <><Undo2 className="h-3 w-3" /> Deshacer</>
                                      ) : (
                                        <><Check className="h-3 w-3" /> Resolver</>
                                      )}
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
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
