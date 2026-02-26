import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus, CalendarDays, Loader2, Clock, Users, ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

interface Shift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  notes: string | null;
  claimable: boolean;
}

interface Assignment {
  id: string;
  shift_id: string;
  employee_id: string;
  status: string;
}

interface SelectOption { id: string; name: string; }
interface Employee { id: string; first_name: string; last_name: string; }

export default function Shifts() {
  const { role, hasModuleAccess, user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const canEdit = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slots, setSlots] = useState("1");
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [claimable, setClaimable] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const weekEnd = addDays(weekStart, 6);
    const [shiftsRes, assignRes, clientsRes, locsRes, empsRes] = await Promise.all([
      supabase.from("scheduled_shifts").select("*").eq("company_id", selectedCompanyId)
        .gte("date", format(weekStart, "yyyy-MM-dd")).lte("date", format(weekEnd, "yyyy-MM-dd"))
        .is("deleted_at", null).order("start_time"),
      supabase.from("shift_assignments").select("*").eq("company_id", selectedCompanyId),
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      supabase.from("locations").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId).eq("is_active", true),
    ]);
    setShifts((shiftsRes.data ?? []) as Shift[]);
    setAssignments((assignRes.data ?? []) as Assignment[]);
    setClients((clientsRes.data ?? []) as SelectOption[]);
    setLocations((locsRes.data ?? []) as SelectOption[]);
    setEmployees((empsRes.data ?? []) as Employee[]);
    setLoading(false);
  }, [selectedCompanyId, weekStart]);

  useEffect(() => { loadData(); }, [loadData]);

  const resetForm = () => {
    setTitle(""); setDate(""); setStartTime("08:00"); setEndTime("17:00");
    setSlots("1"); setClientId(""); setLocationId(""); setNotes("");
    setClaimable(false); setSelectedEmployees([]);
  };

  const handleCreate = async () => {
    if (!title.trim() || !date || !selectedCompanyId) return;
    setSaving(true);
    const { data: shift, error } = await supabase.from("scheduled_shifts").insert({
      company_id: selectedCompanyId,
      title: title.trim(),
      date,
      start_time: startTime,
      end_time: endTime,
      slots: parseInt(slots) || 1,
      client_id: clientId || null,
      location_id: locationId || null,
      notes: notes.trim() || null,
      claimable,
      created_by: user?.id,
    } as any).select("id").single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    // Create assignments
    if (selectedEmployees.length > 0 && shift) {
      const assigns = selectedEmployees.map(eid => ({
        company_id: selectedCompanyId,
        shift_id: shift.id,
        employee_id: eid,
        status: "pending",
      }));
      await supabase.from("shift_assignments").insert(assigns as any);
    }

    toast.success("Turno creado");
    setSaving(false);
    setCreateOpen(false);
    resetForm();
    loadData();
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployees(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const getShiftsForDay = (day: Date) =>
    shifts.filter(s => isSameDay(new Date(s.date + "T00:00:00"), day));

  const getAssignmentCount = (shiftId: string) =>
    assignments.filter(a => a.shift_id === shiftId).length;

  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Turnos</h1>
          <p className="text-muted-foreground text-sm">Programa y gestiona los turnos de trabajo</p>
        </div>
        {canEdit && (
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo turno</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo turno</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Título *</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Turno mañana" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Fecha *</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Inicio</Label>
                    <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <Label>Fin</Label>
                    <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Ninguno</SelectItem>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ubicación</Label>
                    <Select value={locationId} onValueChange={setLocationId}>
                      <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Ninguna</SelectItem>
                        {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Plazas</Label>
                    <Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="claimable" />
                    <Label htmlFor="claimable" className="text-sm">Reclamable por empleados</Label>
                  </div>
                </div>
                <div>
                  <Label>Notas</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                </div>

                {/* Employee assignment */}
                <div>
                  <Label>Asignar empleados</Label>
                  <div className="border rounded-lg max-h-40 overflow-y-auto p-2 mt-1 space-y-1">
                    {employees.map(emp => (
                      <label key={emp.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedEmployees.includes(emp.id)}
                          onCheckedChange={() => toggleEmployee(emp.id)}
                        />
                        {emp.first_name} {emp.last_name}
                      </label>
                    ))}
                    {employees.length === 0 && <p className="text-xs text-muted-foreground p-2">No hay empleados activos</p>}
                  </div>
                </div>

                <Button onClick={handleCreate} disabled={saving || !title.trim() || !date} className="w-full">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Crear turno
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Week navigation */}
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
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          Hoy
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map(day => {
            const dayShifts = getShiftsForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className="min-h-[160px]">
                <div className={`text-center text-xs font-medium mb-2 py-1 rounded ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  <div>{format(day, "EEE", { locale: es })}</div>
                  <div className="text-lg font-bold">{format(day, "d")}</div>
                </div>
                <div className="space-y-1.5">
                  {dayShifts.map(shift => (
                    <Card key={shift.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="p-2">
                        <p className="text-xs font-semibold truncate">{shift.title}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                        </div>
                        {getLocationName(shift.location_id) && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            📍 {getLocationName(shift.location_id)}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px]">{getAssignmentCount(shift.id)}/{shift.slots ?? 1}</span>
                          <Badge variant={shift.status === "open" ? "default" : "secondary"} className="text-[9px] px-1 py-0 ml-auto">
                            {shift.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {dayShifts.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center pt-4">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
