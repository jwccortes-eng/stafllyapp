import { useState, useEffect, useMemo } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertTriangle, CheckCircle2, XCircle, CalendarDays,
  Search, ArrowDownRight, ArrowUpRight, CalendarClock,
  Check, Eye, EyeOff, AlertCircle, Copy as CopyIcon,
} from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { writeExcelFile } from "@/lib/safe-xlsx";
import { toast } from "sonner";

/* ── Legacy operational types (kept for KPIs/grouping) ── */
type LegacyType = "no_show" | "late_arrival" | "early_departure" | "extra_clock" | "ok";

/* ── Extended discrepancy model (coexists with legacy type) ── */
type DiscrepancyStatus = "ready" | "review" | "duplicate" | "resolved";
type IssueType =
  | "missing_clock"
  | "unknown_employee"
  | "assignment_without_time_entry"
  | "duplicate_discrepancy";

interface DiscrepancyItem {
  shiftId: string;
  shiftTitle: string;
  shiftCode: string | null;
  date: string;
  payType: string;
  scheduledStart: string;
  scheduledEnd: string;
  employeeId: string | null;
  employeeName: string;
  /** Legacy operational classification (drives KPIs and group view). */
  type: LegacyType;
  clockIn: string | null;
  clockOut: string | null;
  minutesDiff: number;
  hoursWorked: number;

  /* ── Extended model ── */
  issue_type: IssueType;
  status: DiscrepancyStatus;
  duplicate_key: string;
  is_duplicate: boolean;
  reason?: string;
  suggestion?: string;

  /* Evidence for drawer */
  client_name?: string | null;
  location_name?: string | null;
  assigned_employee_ids?: string[];
  matched_employee_ids?: string[];
  time_entries?: { employee_id: string; clock_in?: string | null; clock_out?: string | null }[];
}

const TYPE_CONFIG: Record<LegacyType, { label: string; icon: React.ReactNode; colorClass: string; bgClass: string; borderClass: string }> = {
  no_show: { label: "No ficharon", icon: <XCircle className="h-4 w-4" />, colorClass: "text-destructive", bgClass: "bg-destructive/[0.04]", borderClass: "border-destructive/20" },
  late_arrival: { label: "Llegadas tarde", icon: <ArrowDownRight className="h-4 w-4" />, colorClass: "text-warning", bgClass: "bg-warning/[0.04]", borderClass: "border-warning/20" },
  early_departure: { label: "Salidas temprano", icon: <ArrowUpRight className="h-4 w-4" />, colorClass: "text-warning", bgClass: "bg-warning/[0.04]", borderClass: "border-warning/20" },
  extra_clock: { label: "Sin turno asignado", icon: <CalendarClock className="h-4 w-4" />, colorClass: "text-primary", bgClass: "bg-primary/[0.04]", borderClass: "border-primary/20" },
  ok: { label: "OK — Sin incidencias", icon: <CheckCircle2 className="h-4 w-4" />, colorClass: "text-success", bgClass: "bg-success/[0.04]", borderClass: "border-success/20" },
};

const STATUS_META: Record<DiscrepancyStatus, { label: string; tone: string; actionLabel: string }> = {
  ready:     { label: "Listo",        tone: "bg-success/10 text-success border-success/20",       actionLabel: "Resolver" },
  review:    { label: "Requiere revisión", tone: "bg-warning/10 text-warning border-warning/20",  actionLabel: "Revisar" },
  duplicate: { label: "Duplicada",    tone: "bg-muted text-muted-foreground border-border",       actionLabel: "Ver" },
  resolved:  { label: "Resuelta",     tone: "bg-primary/10 text-primary border-primary/20",       actionLabel: "Ver" },
};

const LATE_THRESHOLD_MINUTES = 5;

/** Map legacy operational type → extended issue_type */
function deriveIssueType(item: { type: LegacyType; employeeId: string | null }): IssueType {
  if (!item.employeeId) return "unknown_employee";
  if (item.type === "no_show") return "missing_clock";
  if (item.type === "extra_clock") return "assignment_without_time_entry";
  // late_arrival / early_departure / ok → bucket as missing_clock evidence-bearing
  return "missing_clock";
}

/** Classification rules per spec */
function deriveStatus(args: {
  isDuplicate: boolean;
  employeeId: string | null;
  issueType: IssueType;
  isResolved: boolean;
}): DiscrepancyStatus {
  if (args.isResolved) return "resolved";
  if (args.isDuplicate) return "duplicate";
  if (!args.employeeId) return "review";
  if (args.issueType === "missing_clock") return "ready";
  return "review";
}

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
  const [activeTab, setActiveTab] = useState<"ready" | "review" | "resolved">("ready");
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [hideResolved, setHideResolved] = useState(false);
  const [drawerItem, setDrawerItem] = useState<DiscrepancyItem | null>(null);

  const itemKey = (item: DiscrepancyItem, i: number) => `${item.shiftId}-${item.employeeId ?? "unknown"}-${item.type}-${i}`;

  const toggleResolved = (key: string) => {
    setResolvedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const analyze = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    try {
      const [{ data: shifts }, { data: employees }, { data: clients }] = await Promise.all([
        supabase
          .from("scheduled_shifts")
          .select("id, title, shift_code, date, start_time, end_time, pay_type, client_id, location_id")
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null)
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date"),
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("company_id", selectedCompanyId),
        supabase
          .from("clients")
          .select("id, name")
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

      const [{ data: assignments }, { data: timeEntries }, { data: locations }] = await Promise.all([
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
        supabase
          .from("locations")
          .select("id, name")
          .eq("company_id", selectedCompanyId),
      ]);

      const empMap = new Map<string, string>();
      employees.forEach(e => empMap.set(e.id, formatPersonName(`${e.first_name} ${e.last_name}`)));
      const clientMap = new Map<string, string>();
      (clients ?? []).forEach((c: any) => clientMap.set(c.id, c.name));
      const locMap = new Map<string, string>();
      (locations ?? []).forEach((l: any) => locMap.set(l.id, l.name));

      const result: DiscrepancyItem[] = [];

      const buildBase = (shift: any) => ({
        shiftId: shift.id,
        shiftTitle: shift.title,
        shiftCode: shift.shift_code,
        date: shift.date,
        payType: shift.pay_type ?? "hourly",
        scheduledStart: shift.start_time,
        scheduledEnd: shift.end_time,
        client_name: shift.client_id ? clientMap.get(shift.client_id) ?? null : null,
        location_name: shift.location_id ? locMap.get(shift.location_id) ?? null : null,
      });

      for (const shift of shifts) {
        const shiftAssignments = (assignments ?? []).filter(a => a.shift_id === shift.id);
        const shiftEntries = (timeEntries ?? []).filter(te => te.shift_id === shift.id);
        const assignedIds = shiftAssignments.map(a => a.employee_id);
        const matchedIds = shiftEntries.map(te => te.employee_id);
        const evidence = {
          assigned_employee_ids: assignedIds,
          matched_employee_ids: matchedIds,
          time_entries: shiftEntries.map(te => ({
            employee_id: te.employee_id,
            clock_in: te.clock_in,
            clock_out: te.clock_out,
          })),
        };

        for (const assignment of shiftAssignments) {
          const empName = empMap.get(assignment.employee_id) ?? "No identificado";
          const entry = shiftEntries.find(te => te.employee_id === assignment.employee_id);

          if (!entry) {
            result.push({
              ...buildBase(shift),
              employeeId: assignment.employee_id,
              employeeName: empName,
              type: "no_show",
              clockIn: null, clockOut: null, minutesDiff: 0, hoursWorked: 0,
              issue_type: "missing_clock",
              status: "ready",
              duplicate_key: "",
              is_duplicate: false,
              reason: "Asignado pero sin fichaje registrado.",
              suggestion: "Confirmar si trabajó y registrar fichaje manual o marcar ausencia.",
              ...evidence,
            });
            continue;
          }

          const hoursWorked = entry.clock_in && entry.clock_out
            ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000 - (entry.break_minutes ?? 0) / 60
            : 0;

          if (shift.pay_type === "daily") {
            result.push({
              ...buildBase(shift),
              employeeId: assignment.employee_id,
              employeeName: empName,
              type: "ok",
              clockIn: entry.clock_in, clockOut: entry.clock_out,
              minutesDiff: 0, hoursWorked: Math.round(hoursWorked * 100) / 100,
              issue_type: "missing_clock",
              status: "resolved",
              duplicate_key: "",
              is_duplicate: false,
              ...evidence,
            });
            continue;
          }

          let type: LegacyType = "ok";
          let minutesDiff = 0;

          if (entry.clock_in) {
            const scheduledStartDT = new Date(`${shift.date}T${shift.start_time}`);
            const lateMin = differenceInMinutes(new Date(entry.clock_in), scheduledStartDT);
            if (lateMin > LATE_THRESHOLD_MINUTES) {
              type = "late_arrival";
              minutesDiff = lateMin;
            }
          }

          if (entry.clock_out && type === "ok") {
            const scheduledEndDT = new Date(`${shift.date}T${shift.end_time}`);
            const earlyMin = differenceInMinutes(scheduledEndDT, new Date(entry.clock_out));
            if (earlyMin > LATE_THRESHOLD_MINUTES) {
              type = "early_departure";
              minutesDiff = earlyMin;
            }
          }

          result.push({
            ...buildBase(shift),
            employeeId: assignment.employee_id,
            employeeName: empName,
            type,
            clockIn: entry.clock_in, clockOut: entry.clock_out,
            minutesDiff, hoursWorked: Math.round(hoursWorked * 100) / 100,
            issue_type: "missing_clock",
            status: type === "ok" ? "resolved" : "review",
            duplicate_key: "",
            is_duplicate: false,
            reason: type === "late_arrival" ? `Llegó ${minutesDiff} min tarde.` : type === "early_departure" ? `Salió ${minutesDiff} min antes.` : undefined,
            ...evidence,
          });
        }

        for (const entry of shiftEntries) {
          if (!shiftAssignments.find(a => a.employee_id === entry.employee_id)) {
            const hoursWorked = entry.clock_in && entry.clock_out
              ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000 - (entry.break_minutes ?? 0) / 60
              : 0;
            result.push({
              ...buildBase(shift),
              employeeId: entry.employee_id,
              employeeName: empMap.get(entry.employee_id) ?? "No identificado",
              type: "extra_clock",
              clockIn: entry.clock_in, clockOut: entry.clock_out,
              minutesDiff: 0, hoursWorked: Math.round(hoursWorked * 100) / 100,
              issue_type: "assignment_without_time_entry",
              status: "review",
              duplicate_key: "",
              is_duplicate: false,
              reason: "Fichó sin estar asignado al turno.",
              suggestion: "Asignar al turno si corresponde, o reclasificar el fichaje.",
              ...evidence,
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
          client_name: null, location_name: null,
          employeeId: entry.employee_id,
          employeeName: empMap.get(entry.employee_id) ?? "No identificado",
          type: "extra_clock",
          clockIn: entry.clock_in, clockOut: entry.clock_out,
          minutesDiff: 0, hoursWorked: Math.round(hoursWorked * 100) / 100,
          issue_type: "assignment_without_time_entry",
          status: "review",
          duplicate_key: "",
          is_duplicate: false,
          reason: "Fichaje sin turno programado.",
          suggestion: "Vincular a un turno o aprobar como tiempo no programado.",
          assigned_employee_ids: [],
          matched_employee_ids: [entry.employee_id],
          time_entries: [{ employee_id: entry.employee_id, clock_in: entry.clock_in, clock_out: entry.clock_out }],
        });
      }

      /* ── Duplicate detection ── */
      const keyCounts = new Map<string, number>();
      for (const it of result) {
        // Step 1: derive issue_type properly (employee may be null)
        it.issue_type = deriveIssueType({ type: it.type, employeeId: it.employeeId });
        if (!it.employeeId) {
          it.employeeName = "No identificado";
          it.issue_type = "unknown_employee";
        }
        const key = `${it.date}|${it.shiftId}|${it.issue_type}|${it.employeeId ?? "unknown"}`;
        it.duplicate_key = key;
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }
      for (const it of result) {
        const dup = (keyCounts.get(it.duplicate_key) ?? 0) > 1;
        it.is_duplicate = dup;
        if (dup) it.issue_type = "duplicate_discrepancy";
      }

      result.sort((a, b) => {
        const typeOrder: Record<LegacyType, number> = { no_show: 0, late_arrival: 1, early_departure: 2, extra_clock: 3, ok: 4 };
        const diff = typeOrder[a.type] - typeOrder[b.type];
        return diff !== 0 ? diff : a.date.localeCompare(b.date);
      });

      setItems(result);
      setResolvedKeys(new Set());
    } catch (err) {
      console.error("Discrepancy analysis error:", err);
      toast.error("Error al analizar discrepancias");
    }

    setLoading(false);
  };

  useEffect(() => {
    if (selectedCompanyId) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  /** Items with computed status (taking resolved overrides into account) */
  const itemsWithStatus = useMemo(() => {
    return items.map((it, i) => {
      const key = itemKey(it, i);
      const isResolved = resolvedKeys.has(key);
      const status = deriveStatus({
        isDuplicate: it.is_duplicate,
        employeeId: it.employeeId,
        issueType: it.issue_type,
        isResolved: isResolved || it.status === "resolved",
      });
      return { ...it, status, _key: key };
    });
  }, [items, resolvedKeys]);

  const noShows = items.filter(i => i.type === "no_show");
  const lateArrivals = items.filter(i => i.type === "late_arrival");
  const earlyDepartures = items.filter(i => i.type === "early_departure");
  const extraClocks = items.filter(i => i.type === "extra_clock");

  const readyItems = itemsWithStatus.filter(i => i.status === "ready");
  const reviewItems = itemsWithStatus.filter(i => i.status === "review" || i.status === "duplicate");
  const resolvedItems = itemsWithStatus.filter(i => i.status === "resolved");

  const tabItems = activeTab === "ready" ? readyItems
                 : activeTab === "review" ? reviewItems
                 : resolvedItems;

  const visibleTabItems = hideResolved ? tabItems.filter(i => i.status !== "resolved") : tabItems;

  const handleExport = async () => {
    const data = itemsWithStatus.map(i => ({
      Fecha: i.date,
      Turno: i.shiftCode ? `#${i.shiftCode.padStart(4, "0")} ${i.shiftTitle}` : i.shiftTitle,
      Tipo_Pago: i.payType === "daily" ? "Diario" : "Por hora",
      Empleado: i.employeeName,
      Issue_Type: i.issue_type,
      Estado: STATUS_META[i.status].label,
      Es_Duplicado: i.is_duplicate ? "Sí" : "No",
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
                  onExportCSV={() => { handleExport(); return []; }}
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

      {/* KPIs (legacy operational summary) */}
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
          <KpiCard label="Resueltas" value={resolvedItems.length}
            icon={<CheckCircle2 className="h-4 w-4" />}
            className="border-success/20" />
        </div>
      )}

      {/* Status tabs */}
      {items.length > 0 && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="ready" className="text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> Listos para resolver
              <Badge variant="secondary" className="text-[9px] px-1.5">{readyItems.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="review" className="text-xs gap-1">
              <AlertCircle className="h-3 w-3" /> Requieren revisión
              <Badge variant="secondary" className="text-[9px] px-1.5">{reviewItems.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="resolved" className="text-xs gap-1">
              Resueltos
              <Badge variant="secondary" className="text-[9px] px-1.5">{resolvedItems.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-3">
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Fecha</TableHead>
                      <TableHead className="text-xs">Turno</TableHead>
                      <TableHead className="text-xs">Empleado</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="text-xs">Programado</TableHead>
                      <TableHead className="text-xs">Real</TableHead>
                      <TableHead className="text-xs text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTabItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                          Sin discrepancias en esta categoría.
                        </TableCell>
                      </TableRow>
                    )}
                    {visibleTabItems.map((item) => {
                      const meta = STATUS_META[item.status];
                      const cfg = TYPE_CONFIG[item.type];
                      const onAction = () => {
                        if (item.status === "ready") {
                          toggleResolved(item._key);
                          toast.success("Discrepancia resuelta");
                        } else {
                          setDrawerItem(item);
                        }
                      };
                      return (
                        <TableRow
                          key={item._key}
                          className={cn(item.is_duplicate && "opacity-70")}
                        >
                          <TableCell className="text-xs capitalize">
                            {item.date ? format(parseISO(item.date), "EEE d MMM", { locale: es }) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.shiftCode && (
                              <span className="font-mono text-primary/60 mr-1">#{item.shiftCode.padStart(4, "0")}</span>
                            )}
                            <span className="font-medium">{item.shiftTitle}</span>
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            <span className={cn(!item.employeeId && "text-muted-foreground italic")}>
                              {item.employeeName}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className={cn("inline-flex items-center gap-1", cfg.colorClass)}>
                              {cfg.icon}
                              {item.is_duplicate ? "Duplicada" : cfg.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px]", meta.tone)}>
                              {item.is_duplicate && <CopyIcon className="h-2.5 w-2.5 mr-1" />}
                              {meta.label}
                            </Badge>
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
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={item.status === "ready" ? "default" : "outline"}
                              className="h-7 text-xs gap-1"
                              onClick={onAction}
                            >
                              {item.status === "ready" && <Check className="h-3 w-3" />}
                              {meta.actionLabel}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
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

      {/* Lateral drawer */}
      <Sheet open={!!drawerItem} onOpenChange={(open) => !open && setDrawerItem(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {drawerItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Detalle de discrepancia
                </SheetTitle>
                <SheetDescription>
                  Evidencia operativa para resolver el caso.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-4 text-sm">
                <DetailRow label="Shift ID" value={<span className="font-mono text-xs">{drawerItem.shiftId || "—"}</span>} />
                <DetailRow label="Fecha" value={drawerItem.date ? format(parseISO(drawerItem.date), "EEEE d MMM yyyy", { locale: es }) : "—"} />
                <DetailRow label="Cliente" value={drawerItem.client_name ?? "—"} />
                <DetailRow label="Locación" value={drawerItem.location_name ?? "—"} />
                <DetailRow
                  label="Programado"
                  value={drawerItem.scheduledStart && drawerItem.scheduledEnd
                    ? `${drawerItem.scheduledStart.slice(0,5)} – ${drawerItem.scheduledEnd.slice(0,5)}`
                    : "—"}
                />

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Issue type</div>
                  <Badge variant="outline" className="text-[10px]">{drawerItem.issue_type}</Badge>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Asignados ({drawerItem.assigned_employee_ids?.length ?? 0})</div>
                  <div className="flex flex-wrap gap-1">
                    {(drawerItem.assigned_employee_ids ?? []).map(id => (
                      <Badge key={id} variant="secondary" className="font-mono text-[10px]">{id.slice(0, 8)}</Badge>
                    ))}
                    {(drawerItem.assigned_employee_ids?.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Matched ({drawerItem.matched_employee_ids?.length ?? 0})</div>
                  <div className="flex flex-wrap gap-1">
                    {(drawerItem.matched_employee_ids ?? []).map(id => (
                      <Badge key={id} variant="secondary" className="font-mono text-[10px]">{id.slice(0, 8)}</Badge>
                    ))}
                    {(drawerItem.matched_employee_ids?.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Time entries ({drawerItem.time_entries?.length ?? 0})</div>
                  <div className="space-y-1">
                    {(drawerItem.time_entries ?? []).map((te, i) => (
                      <div key={i} className="text-xs bg-muted/30 rounded px-2 py-1 flex justify-between">
                        <span className="font-mono">{te.employee_id.slice(0, 8)}</span>
                        <span className="tabular-nums">
                          {te.clock_in ? format(new Date(te.clock_in), "HH:mm") : "—"}
                          {te.clock_out ? ` – ${format(new Date(te.clock_out), "HH:mm")}` : ""}
                        </span>
                      </div>
                    ))}
                    {(drawerItem.time_entries?.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </div>

                {drawerItem.reason && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Razón</div>
                    <p className="text-xs">{drawerItem.reason}</p>
                  </div>
                )}
                {drawerItem.suggestion && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Sugerencia</div>
                    <p className="text-xs text-primary">{drawerItem.suggestion}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  );
}
