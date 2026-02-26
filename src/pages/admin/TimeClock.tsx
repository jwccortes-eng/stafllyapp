import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Clock, Play, Square, Loader2, ChevronLeft, ChevronRight,
  Search, CheckCircle2, Timer, Pencil, Hash,
} from "lucide-react";
import { format, differenceInMinutes, startOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";

interface TimeEntry {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  status: string;
  approved_by: string | null;
  scheduled_shifts?: { id: string; shift_code: string | null; title: string } | null;
}

interface Employee { id: string; first_name: string; last_name: string; }

interface AvailableShift { id: string; shift_code: string | null; title: string; date: string; start_time: string; end_time: string; }

export default function TimeClock() {
  const { role, hasModuleAccess, employeeId } = useAuth();
  const { selectedCompanyId } = useCompany();
  const isAdmin = role === "owner" || role === "admin" || hasModuleAccess("shifts", "view");
  const canApprove = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [clockingIn, setClockingIn] = useState(false);

  // Clock-in shift selection
  const [clockInOpen, setClockInOpen] = useState(false);
  const [availableShifts, setAvailableShifts] = useState<AvailableShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>("none");
  const [loadingShifts, setLoadingShifts] = useState(false);

  // Edit dialog
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editBreak, setEditBreak] = useState("0");
  const [editNotes, setEditNotes] = useState("");
  const [editShiftId, setEditShiftId] = useState<string>("none");
  const [editSaving, setEditSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    const [entriesRes, empsRes] = await Promise.all([
      supabase.from("time_entries").select("*, scheduled_shifts(id, shift_code, title)").eq("company_id", selectedCompanyId)
        .gte("clock_in", weekStart.toISOString())
        .lt("clock_in", weekEnd.toISOString())
        .order("clock_in", { ascending: false }),
      supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId).eq("is_active", true),
    ]);
    setEntries((entriesRes.data ?? []) as TimeEntry[]);
    setEmployees((empsRes.data ?? []) as Employee[]);

    if (employeeId) {
      const { data: active } = await supabase.from("time_entries").select("*, scheduled_shifts(id, shift_code, title)")
        .eq("employee_id", employeeId).is("clock_out", null).limit(1).maybeSingle();
      setActiveEntry(active as TimeEntry | null);
    }
    setLoading(false);
  }, [selectedCompanyId, weekStart, employeeId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load available shifts for today when opening clock-in dialog
  const openClockInDialog = async () => {
    if (!employeeId || !selectedCompanyId) return;
    setClockInOpen(true);
    setLoadingShifts(true);
    setSelectedShiftId("none");
    const today = format(new Date(), "yyyy-MM-dd");
    // Get shifts assigned to this employee for today
    const { data: assignments } = await supabase
      .from("shift_assignments")
      .select("shift_id, scheduled_shifts(id, shift_code, title, date, start_time, end_time)")
      .eq("employee_id", employeeId)
      .eq("company_id", selectedCompanyId)
      .eq("status", "confirmed");
    
    const shifts: AvailableShift[] = [];
    (assignments ?? []).forEach((a: any) => {
      const s = a.scheduled_shifts;
      if (s && s.date === today) {
        shifts.push({ id: s.id, shift_code: s.shift_code, title: s.title, date: s.date, start_time: s.start_time, end_time: s.end_time });
      }
    });

    // Also get unassigned/claimable shifts for today
    const { data: openShifts } = await supabase
      .from("scheduled_shifts")
      .select("id, shift_code, title, date, start_time, end_time")
      .eq("company_id", selectedCompanyId)
      .eq("date", today)
      .eq("status", "published");
    
    (openShifts ?? []).forEach((s: any) => {
      if (!shifts.find(x => x.id === s.id)) {
        shifts.push(s);
      }
    });

    setAvailableShifts(shifts);
    if (shifts.length === 1) setSelectedShiftId(shifts[0].id);
    setLoadingShifts(false);
  };

  const handleClockIn = async () => {
    if (!employeeId || !selectedCompanyId) return;
    setClockingIn(true);
    const insertData: any = {
      company_id: selectedCompanyId,
      employee_id: employeeId,
      clock_in: new Date().toISOString(),
    };
    if (selectedShiftId && selectedShiftId !== "none") {
      insertData.shift_id = selectedShiftId;
    }
    const { error } = await supabase.from("time_entries").insert(insertData);
    if (error) toast.error(error.message);
    else { toast.success("Entrada registrada"); setClockInOpen(false); loadData(); }
    setClockingIn(false);
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;
    setClockingIn(true);
    const { error } = await supabase.from("time_entries").update({
      clock_out: new Date().toISOString(),
    }).eq("id", activeEntry.id);
    if (error) toast.error(error.message);
    else { toast.success("Salida registrada"); setActiveEntry(null); loadData(); }
    setClockingIn(false);
  };

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from("time_entries").update({
      status: "approved",
      approved_at: new Date().toISOString(),
    } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Entrada aprobada"); loadData(); }
  };

  const openEditEntry = (entry: TimeEntry) => {
    setEditEntry(entry);
    setEditClockIn(format(new Date(entry.clock_in), "yyyy-MM-dd'T'HH:mm"));
    setEditClockOut(entry.clock_out ? format(new Date(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : "");
    setEditBreak(String(entry.break_minutes ?? 0));
    setEditNotes(entry.notes ?? "");
    setEditShiftId(entry.shift_id ?? "none");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editEntry) return;
    setEditSaving(true);
    const updates: Record<string, any> = {
      clock_in: new Date(editClockIn).toISOString(),
      clock_out: editClockOut ? new Date(editClockOut).toISOString() : null,
      break_minutes: parseInt(editBreak) || 0,
      notes: editNotes.trim() || null,
      shift_id: editShiftId && editShiftId !== "none" ? editShiftId : null,
    };
    const { error } = await supabase.from("time_entries").update(updates).eq("id", editEntry.id);
    if (error) toast.error(error.message);
    else { toast.success("Entrada actualizada"); setEditOpen(false); setEditEntry(null); loadData(); }
    setEditSaving(false);
  };

  const getEmployeeName = (id: string) => {
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.first_name} ${emp.last_name}` : "—";
  };

  const getDuration = (entry: TimeEntry) => {
    const end = entry.clock_out ? new Date(entry.clock_out) : new Date();
    const totalMins = Math.max(0, differenceInMinutes(end, new Date(entry.clock_in)) - (entry.break_minutes ?? 0));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}h ${m}m`;
  };

  const filtered = useMemo(() => {
    if (!search) return entries;
    const s = search.toLowerCase();
    return entries.filter(e => getEmployeeName(e.employee_id).toLowerCase().includes(s));
  }, [entries, search, employees]);

  const totalHours = useMemo(() => {
    let total = 0;
    entries.forEach(e => {
      if (e.clock_out) {
        total += differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - (e.break_minutes ?? 0);
      }
    });
    return (Math.max(0, total) / 60).toFixed(1);
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reloj de Tiempo</h1>
          <p className="text-muted-foreground text-sm">Registra entradas y salidas</p>
        </div>
      </div>

      {/* Quick clock in/out for employees */}
      {employeeId && (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              {activeEntry ? (
                <div>
                  <p className="text-sm font-medium">
                    Entrada activa desde {format(new Date(activeEntry.clock_in), "HH:mm")}
                    {activeEntry.scheduled_shifts?.shift_code && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        <Hash className="h-3 w-3 mr-0.5" />{activeEntry.scheduled_shifts.shift_code}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Duración: {getDuration(activeEntry)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tienes entrada activa</p>
              )}
            </div>
            {activeEntry ? (
              <Button variant="destructive" onClick={handleClockOut} disabled={clockingIn}>
                {clockingIn ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Square className="h-4 w-4 mr-1" />}
                Marcar salida
              </Button>
            ) : (
              <Button onClick={openClockInDialog} disabled={clockingIn}>
                {clockingIn ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                Marcar entrada
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{entries.length}</div>
            <p className="text-xs text-muted-foreground">Entradas esta semana</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{totalHours}h</div>
            <p className="text-xs text-muted-foreground">Horas totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{entries.filter(e => !e.clock_out).length}</div>
            <p className="text-xs text-muted-foreground">Activos ahora</p>
          </CardContent>
        </Card>
      </div>

      {/* Week nav */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {format(weekStart, "d MMM", { locale: es })} — {format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..." className="pl-9" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Estado</TableHead>
                {canApprove && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{getEmployeeName(entry.employee_id)}</TableCell>
                  <TableCell className="text-sm">
                    {entry.scheduled_shifts?.shift_code ? (
                      <Badge variant="outline" className="font-mono">
                        <Hash className="h-3 w-3 mr-0.5" />{entry.scheduled_shifts.shift_code}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(entry.clock_in), "dd/MM HH:mm")}</TableCell>
                  <TableCell className="text-sm">
                    {entry.clock_out ? format(new Date(entry.clock_out), "dd/MM HH:mm") : (
                      <Badge variant="default" className="animate-pulse">Activo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{getDuration(entry)}</TableCell>
                  <TableCell>
                    <Badge variant={entry.status === "approved" ? "default" : "secondary"}>
                      {entry.status === "approved" ? "Aprobado" : "Pendiente"}
                    </Badge>
                  </TableCell>
                  {canApprove && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {entry.status !== "approved" && entry.clock_out && (
                          <Button variant="ghost" size="icon" onClick={() => handleApprove(entry.id)}>
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Timer className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No hay registros esta semana
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Clock-In Dialog — select shift */}
      <Dialog open={clockInOpen} onOpenChange={setClockInOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Marcar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vincular a turno (opcional)</Label>
              {loadingShifts ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando turnos...
                </div>
              ) : availableShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No hay turnos disponibles para hoy</p>
              ) : (
                <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sin turno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin turno</SelectItem>
                    {availableShifts.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-mono text-xs mr-1">#{s.shift_code}</span> {s.title} ({s.start_time}–{s.end_time})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button onClick={handleClockIn} disabled={clockingIn} className="w-full">
              {clockingIn ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Confirmar entrada
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditEntry(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Turno vinculado</Label>
              <Input
                value={editShiftId === "none" ? "" : editShiftId}
                onChange={e => setEditShiftId(e.target.value || "none")}
                placeholder="ID del turno (opcional)"
                className="font-mono text-xs"
              />
              {editEntry?.scheduled_shifts?.shift_code && (
                <p className="text-xs text-muted-foreground mt-1">
                  Actual: #{editEntry.scheduled_shifts.shift_code} — {editEntry.scheduled_shifts.title}
                </p>
              )}
            </div>
            <div>
              <Label>Entrada</Label>
              <Input type="datetime-local" value={editClockIn} onChange={e => setEditClockIn(e.target.value)} />
            </div>
            <div>
              <Label>Salida</Label>
              <Input type="datetime-local" value={editClockOut} onChange={e => setEditClockOut(e.target.value)} />
            </div>
            <div>
              <Label>Minutos de break</Label>
              <Input type="number" value={editBreak} onChange={e => setEditBreak(e.target.value)} min="0" />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleSaveEdit} disabled={editSaving || !editClockIn} className="w-full">
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
