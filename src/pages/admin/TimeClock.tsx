import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Clock, Play, Square, Loader2, ChevronLeft, ChevronRight,
  Search, CheckCircle2, Timer, Pencil,
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
}

interface Employee { id: string; first_name: string; last_name: string; }

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
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editBreak, setEditBreak] = useState("0");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    const [entriesRes, empsRes] = await Promise.all([
      supabase.from("time_entries").select("*").eq("company_id", selectedCompanyId)
        .gte("clock_in", weekStart.toISOString())
        .lt("clock_in", weekEnd.toISOString())
        .order("clock_in", { ascending: false }),
      supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId).eq("is_active", true),
    ]);
    setEntries((entriesRes.data ?? []) as TimeEntry[]);
    setEmployees((empsRes.data ?? []) as Employee[]);

    // Check if current employee has active entry
    if (employeeId) {
      const { data: active } = await supabase.from("time_entries").select("*")
        .eq("employee_id", employeeId).is("clock_out", null).limit(1).maybeSingle();
      setActiveEntry(active as TimeEntry | null);
    }
    setLoading(false);
  }, [selectedCompanyId, weekStart, employeeId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleClockIn = async () => {
    if (!employeeId || !selectedCompanyId) return;
    setClockingIn(true);
    const { error } = await supabase.from("time_entries").insert({
      company_id: selectedCompanyId,
      employee_id: employeeId,
      clock_in: new Date().toISOString(),
    } as any);
    if (error) toast.error(error.message);
    else { toast.success("Entrada registrada"); loadData(); }
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
        total += differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in)) - e.break_minutes;
      }
    });
    return (total / 60).toFixed(1);
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
                  <p className="text-sm font-medium">Entrada activa desde {format(new Date(activeEntry.clock_in), "HH:mm")}</p>
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
              <Button onClick={handleClockIn} disabled={clockingIn}>
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
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Timer className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No hay registros esta semana
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {/* Edit Entry Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditEntry(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
