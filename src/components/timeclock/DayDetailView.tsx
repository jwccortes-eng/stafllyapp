import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeDayDetailDrawer } from "@/components/today/EmployeeDayDetailDrawer";
import {
  ChevronLeft, ChevronRight, Search, Timer,
  CheckCircle2, XCircle, Clock, Users, Activity,
} from "lucide-react";
import { format, differenceInMinutes, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { OpsStatusChip } from "@/components/operations/OpsStatusChip";
import { cn } from "@/lib/utils";

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  status: string;
  scheduled_shifts?: {
    id: string;
    shift_code: string | null;
    title: string;
    start_time: string;
    end_time: string;
    clients?: { name: string } | null;
    locations?: { name: string } | null;
  } | null;
}

interface Employee { id: string; first_name: string; last_name: string; avatar_url?: string | null; }

/**
 * Sober job pills — derived hue from name but constrained to a single
 * "neutral surface + colored accent dot" pattern, aligned with the
 * Ops Command Center premium chip language.
 */
function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const JOB_HUES = [200, 160, 280, 30, 350, 180, 250, 20]; // sober palette of HSL hues
function jobHue(title: string) {
  return JOB_HUES[hashStr(title) % JOB_HUES.length];
}

export function DayDetailView() {
  const { role, hasModuleAccess } = useAuth();
  const { selectedCompanyId } = useCompany();
  const canApprove = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const startOfDay = `${dateStr}T00:00:00`;
    const endOfDay = `${dateStr}T23:59:59`;
    const [entriesRes, empsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("*, scheduled_shifts(id, shift_code, title, start_time, end_time, clients(name), locations(name))")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", startOfDay).lte("clock_in", endOfDay)
        .order("clock_in", { ascending: true }),
      supabase.from("employees")
        .select("id, first_name, last_name, avatar_url")
        .eq("company_id", selectedCompanyId).eq("is_active", true),
    ]);
    setEntries((entriesRes.data ?? []) as TimeEntry[]);
    setEmployees((empsRes.data ?? []) as Employee[]);
    setSelectedIds(new Set());
    setLoading(false);
  }, [selectedCompanyId, dateStr]);

  useEffect(() => { loadData(); }, [loadData]);

  const getEmpName = (id: string) => {
    const e = employees.find(x => x.id === id);
    return e ? formatPersonName(`${e.first_name} ${e.last_name}`) : "—";
  };

  const getEmp = (id: string) => employees.find(x => x.id === id);

  const getDurationText = (entry: TimeEntry) => {
    const end = entry.clock_out ? new Date(entry.clock_out) : new Date();
    const mins = Math.max(0, differenceInMinutes(end, new Date(entry.clock_in)) - (entry.break_minutes ?? 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  const filtered = useMemo(() => {
    let list = entries;
    if (statusFilter !== "all") list = list.filter(e => e.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => getEmpName(e.employee_id).toLowerCase().includes(s));
    }
    return list;
  }, [entries, search, statusFilter, employees]);

  const activeCount = entries.filter(e => !e.clock_out).length;
  const totalAttendance = new Set(entries.map(e => e.employee_id)).size;

  // Build drawer-compatible employee data
  const drawerEmployee = useMemo(() => {
    if (!selectedEmpId) return null;
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return null;
    const empEntries = entries.filter(en => en.employee_id === selectedEmpId);
    const activeEntry = empEntries.find(en => !en.clock_out);
    const completedEntries = empEntries.filter(en => en.clock_out);
    let totalMinutes = 0;
    completedEntries.forEach(en => {
      totalMinutes += Math.max(0, differenceInMinutes(new Date(en.clock_out!), new Date(en.clock_in)) - (en.break_minutes ?? 0));
    });
    if (activeEntry) {
      totalMinutes += Math.max(0, differenceInMinutes(new Date(), new Date(activeEntry.clock_in)) - (activeEntry.break_minutes ?? 0));
    }
    return { ...emp, activeEntry, completedEntries, totalMinutes, isClockedIn: !!activeEntry };
  }, [selectedEmpId, employees, entries]);

  // Bulk actions — batch in chunks of 50 to avoid URL length limits
  const batchUpdate = async (ids: string[], updates: Record<string, any>) => {
    const BATCH_SIZE = 50;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("time_entries")
        .update(updates as any)
        .in("id", chunk)
        .eq("status", "pending");
      if (error) throw error;
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    try {
      await batchUpdate(ids, { status: "approved", approved_at: new Date().toISOString() });
      toast.success(`${ids.length} aprobados`);
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      toast.error(err.message ?? "Error al aprobar");
    }
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedIds);
    try {
      await batchUpdate(ids, { status: "rejected", notes: "[Rechazado] Rechazo masivo" });
      toast.success(`${ids.length} rechazados`);
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      toast.error(err.message ?? "Error al rechazar");
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Strip — premium ops language consistent with Shifts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/40 bg-card px-4 py-3 flex items-center gap-3">
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            activeCount > 0 ? "bg-earning/[0.08] text-earning" : "bg-muted/60 text-muted-foreground"
          )}>
            <Activity className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold font-mono tabular-nums leading-none">{activeCount}</div>
            <p className="text-[11px] text-muted-foreground/80 mt-1">Fichados ahora</p>
          </div>
          {activeCount > 0 && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-earning animate-pulse shrink-0" />
          )}
        </div>
        <div className="rounded-xl border border-border/40 bg-card px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 text-muted-foreground">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold font-mono tabular-nums leading-none">{totalAttendance}</div>
            <p className="text-[11px] text-muted-foreground/80 mt-1">Asistencia total</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 h-9" />
        </div>

        {/* Day nav */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(d => addDays(d, -1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs font-medium min-w-[80px]"
            onClick={() => setSelectedDate(new Date())}>
            {format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "Today" : format(selectedDate, "EEEE d MMM", { locale: es })}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(d => addDays(d, 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="approved">Aprobados</SelectItem>
            <SelectItem value="rejected">Rechazados</SelectItem>
          </SelectContent>
        </Select>

        {canApprove && selectedIds.size > 0 && (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs">{selectedIds.size} sel.</Badge>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBulkApprove}>
              <CheckCircle2 className="h-3 w-3" /> Aprobar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={handleBulkReject}>
              <XCircle className="h-3 w-3" /> Rechazar
            </Button>
          </div>
        )}
      </div>

      {/* Table - Connecteam style */}
      {loading ? (
        <PageSkeleton variant="table" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Timer} title="Sin fichajes este día" description="No hay registros para la fecha seleccionada" compact />
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                {canApprove && (
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      onCheckedChange={() => {
                        if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                        else setSelectedIds(new Set(filtered.map(e => e.id)));
                      }}
                    />
                  </th>
                )}
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Empleado</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Job</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sub items</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Clock in</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Clock out</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Daily total</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const emp = getEmp(entry.employee_id);
                const shift = entry.scheduled_shifts;
                const jobTitle = shift?.title?.replace(/^#\d+\s*-?\s*/, "") || "";
                const clientName = (shift as any)?.clients?.name;
                const locationName = (shift as any)?.locations?.name;
                // Severity rail — premium ShiftCard pattern
                const railTone =
                  !entry.clock_out ? "bg-earning"
                  : entry.status === "rejected" ? "bg-destructive"
                  : entry.status === "pending" ? "bg-warning"
                  : entry.status === "approved" ? "bg-earning/60"
                  : "bg-border";

                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer relative"
                    onClick={() => setSelectedEmpId(entry.employee_id)}
                  >
                    {canApprove && (
                      <td className="px-3 py-3 relative" onClick={e => e.stopPropagation()}>
                        <span aria-hidden className={cn("absolute left-0 top-2 bottom-2 w-[1.5px] rounded-r-full opacity-50", railTone)} />
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={() => {
                            const next = new Set(selectedIds);
                            next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-3 relative">
                      {!canApprove && (
                        <span aria-hidden className={cn("absolute left-0 top-2 bottom-2 w-[1.5px] rounded-r-full opacity-50", railTone)} />
                      )}
                      <div className="flex items-center gap-2.5">
                        {emp && <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} size="md" />}
                        <span className="font-medium text-xs tracking-wide">{getEmpName(entry.employee_id)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {shift ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Shift
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">--</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {jobTitle ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/85 truncate max-w-[150px]"
                          style={{ borderLeftColor: `hsl(${jobHue(jobTitle)} 55% 55%)`, borderLeftWidth: 2 }}
                        >
                          {shift?.shift_code && <span className="text-muted-foreground/60 font-mono text-[10px]">{shift.shift_code}</span>}
                          <span className="truncate">{jobTitle}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {(clientName || locationName) ? (
                        <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-foreground/80 truncate max-w-[130px]">
                          {clientName || locationName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs">
                        {format(new Date(entry.clock_in), "hh:mm a")}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {entry.clock_out ? (
                        <span className="font-mono text-xs">{format(new Date(entry.clock_out), "hh:mm a")}</span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">--</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {entry.clock_out ? (
                        <span className="font-mono text-xs font-semibold">{getDurationText(entry)}</span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">--</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <OpsStatusChip
                        size="sm"
                        tone={
                          entry.status === "approved" ? "success" :
                          entry.status === "rejected" ? "critical" :
                          "warning"
                        }
                        label={
                          entry.status === "approved" ? "Aprobado" :
                          entry.status === "rejected" ? "Rechazado" :
                          "Pendiente"
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee detail drawer */}
      <EmployeeDayDetailDrawer
        employee={drawerEmployee}
        open={!!selectedEmpId}
        onOpenChange={o => { if (!o) setSelectedEmpId(null); }}
        now={new Date()}
        onDataChanged={loadData}
      />
    </div>
  );
}
