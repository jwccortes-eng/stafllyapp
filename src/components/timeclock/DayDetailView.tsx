import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Search, Timer, Hash,
  CheckCircle2, XCircle, Clock, Play, Square,
} from "lucide-react";
import { format, differenceInMinutes, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  status: string;
  scheduled_shifts?: { id: string; shift_code: string | null; title: string; start_time: string; end_time: string } | null;
}

interface Employee { id: string; first_name: string; last_name: string; }

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

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const startOfDay = `${dateStr}T00:00:00`;
    const endOfDay = `${dateStr}T23:59:59`;
    const [entriesRes, empsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("*, scheduled_shifts(id, shift_code, title, start_time, end_time)")
        .eq("company_id", selectedCompanyId)
        .gte("clock_in", startOfDay).lte("clock_in", endOfDay)
        .order("clock_in", { ascending: true }),
      supabase.from("employees")
        .select("id, first_name, last_name")
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
    return e ? `${e.first_name} ${e.last_name}` : "—";
  };

  const getEmp = (id: string) => employees.find(x => x.id === id);

  const getDuration = (entry: TimeEntry) => {
    const end = entry.clock_out ? new Date(entry.clock_out) : new Date();
    const mins = Math.max(0, differenceInMinutes(end, new Date(entry.clock_in)) - (entry.break_minutes ?? 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
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

  // Bulk actions
  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("time_entries")
      .update({ status: "approved", approved_at: new Date().toISOString() } as any)
      .in("id", ids).eq("status", "pending");
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} aprobados`); loadData(); }
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("time_entries")
      .update({ status: "rejected", notes: "[Rechazado] Rechazo masivo" })
      .in("id", ids).eq("status", "pending");
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} rechazados`); loadData(); }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/30 rounded-xl">
          <CardContent className="pt-3 pb-2 px-4">
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-[11px] text-muted-foreground">Fichados ahora</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 rounded-xl">
          <CardContent className="pt-3 pb-2 px-4">
            <div className="text-2xl font-bold">{totalAttendance}</div>
            <p className="text-[11px] text-muted-foreground">Asistencia total</p>
          </CardContent>
        </Card>
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
          <Button variant="ghost" size="sm" className="h-8 text-xs font-medium min-w-[120px]"
            onClick={() => setSelectedDate(new Date())}>
            {format(selectedDate, "EEEE d MMM", { locale: es })}
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

      {/* Table */}
      {loading ? (
        <PageSkeleton variant="table" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Timer} title="Sin fichajes este día" description="No hay registros para la fecha seleccionada" compact />
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                {canApprove && (
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      onCheckedChange={() => {
                        if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                        else setSelectedIds(new Set(filtered.map(e => e.id)));
                      }}
                    />
                  </th>
                )}
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Empleado</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Turno</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Entrada</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Salida</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Duración</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const emp = getEmp(entry.employee_id);
                return (
                  <tr key={entry.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    {canApprove && (
                      <td className="px-2 py-2">
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
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {emp && <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} className="h-7 w-7 text-[10px]" />}
                        <span className="font-medium">{getEmpName(entry.employee_id)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {entry.scheduled_shifts?.shift_code ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          <Hash className="h-2.5 w-2.5 mr-0.5" />{entry.scheduled_shifts.shift_code}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{format(new Date(entry.clock_in), "HH:mm")}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {entry.clock_out ? format(new Date(entry.clock_out), "HH:mm") : (
                        <Badge className="animate-pulse text-[9px] px-1.5 py-0">Activo</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{getDuration(entry)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={
                        entry.status === "approved" ? "default" :
                        entry.status === "rejected" ? "destructive" : "secondary"
                      } className="text-[10px]">
                        {entry.status === "approved" ? "Aprobado" :
                         entry.status === "rejected" ? "Rechazado" : "Pendiente"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
