import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Loader2, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid } from "lucide-react";
import { format, startOfWeek, addDays, addMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

import { WeekView } from "@/components/shifts/WeekView";
import { MonthView } from "@/components/shifts/MonthView";
import { ShiftDetailDialog } from "@/components/shifts/ShiftDetailDialog";
import type { Shift, Assignment, SelectOption, Employee, ViewMode } from "@/components/shifts/types";

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
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  // Detail dialog
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

    let dateFrom: string, dateTo: string;
    if (viewMode === "week") {
      dateFrom = format(weekStart, "yyyy-MM-dd");
      dateTo = format(addDays(weekStart, 6), "yyyy-MM-dd");
    } else {
      dateFrom = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      dateTo = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    }

    const [shiftsRes, assignRes, clientsRes, locsRes, empsRes] = await Promise.all([
      supabase.from("scheduled_shifts").select("*").eq("company_id", selectedCompanyId)
        .gte("date", dateFrom).lte("date", dateTo)
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
  }, [selectedCompanyId, weekStart, currentMonth, viewMode]);

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
      date, start_time: startTime, end_time: endTime,
      slots: parseInt(slots) || 1,
      client_id: clientId || null,
      location_id: locationId || null,
      notes: notes.trim() || null,
      claimable,
      created_by: user?.id,
    } as any).select("id").single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    if (selectedEmployees.length > 0 && shift) {
      const assigns = selectedEmployees.map(eid => ({
        company_id: selectedCompanyId, shift_id: shift.id, employee_id: eid, status: "pending",
      }));
      await supabase.from("shift_assignments").insert(assigns as any);
    }

    toast.success("Turno creado");
    setSaving(false); setCreateOpen(false); resetForm(); loadData();
  };

  const handleAddEmployees = async (shiftId: string, employeeIds: string[]) => {
    if (!selectedCompanyId) return;
    const assigns = employeeIds.map(eid => ({
      company_id: selectedCompanyId, shift_id: shiftId, employee_id: eid, status: "pending",
    }));
    const { error } = await supabase.from("shift_assignments").insert(assigns as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${employeeIds.length} empleado(s) asignados`);
    loadData();
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const { error } = await supabase.from("shift_assignments").delete().eq("id", assignmentId);
    if (error) { toast.error(error.message); return; }
    toast.success("Empleado removido del turno");
    loadData();
  };

  const handleDropOnShift = async (targetShiftId: string, dataStr: string) => {
    if (!canEdit) return;
    try {
      const data = JSON.parse(dataStr);
      const { assignmentId, employeeId, fromShiftId } = data;
      if (fromShiftId === targetShiftId) return;

      // Check if already assigned to target
      const existing = assignments.find(a => a.shift_id === targetShiftId && a.employee_id === employeeId);
      if (existing) { toast.error("Ya está asignado a este turno"); return; }

      // Move: delete old, create new
      await supabase.from("shift_assignments").delete().eq("id", assignmentId);
      await supabase.from("shift_assignments").insert({
        company_id: selectedCompanyId!,
        shift_id: targetShiftId,
        employee_id: employeeId,
        status: "pending",
      } as any);

      toast.success("Empleado reasignado");
      loadData();
    } catch { /* ignore invalid drag data */ }
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployees(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const navLabel = viewMode === "week"
    ? `${format(weekStart, "d MMM", { locale: es })} — ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}`
    : format(currentMonth, "MMMM yyyy", { locale: es });

  const navigateBack = () => {
    if (viewMode === "week") setWeekStart(d => addDays(d, -7));
    else setCurrentMonth(d => addMonths(d, -1));
  };

  const navigateForward = () => {
    if (viewMode === "week") setWeekStart(d => addDays(d, 7));
    else setCurrentMonth(d => addMonths(d, 1));
  };

  const navigateToday = () => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setCurrentMonth(new Date());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Turnos</h1>
          <p className="text-muted-foreground text-sm">Programa y gestiona los turnos de trabajo</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="week" className="text-xs gap-1 px-2">
                <LayoutGrid className="h-3 w-3" /> Semana
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs gap-1 px-2">
                <CalendarDays className="h-3 w-3" /> Mes
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {canEdit && (
            <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo turno</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nuevo turno</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Título *</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Turno mañana" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Fecha *</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                    <div><Label>Inicio</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
                    <div><Label>Fin</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Cliente</Label>
                      <Select value={clientId || "none"} onValueChange={v => setClientId(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Ninguno</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Ubicación</Label>
                      <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Ninguna</SelectItem>
                          {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Plazas</Label><Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" /></div>
                    <div className="flex items-center gap-2 pt-6">
                      <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="claimable" />
                      <Label htmlFor="claimable" className="text-sm">Reclamable por empleados</Label>
                    </div>
                  </div>
                  <div><Label>Notas</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
                  <div>
                    <Label>Asignar empleados</Label>
                    <div className="border rounded-lg max-h-40 overflow-y-auto p-2 mt-1 space-y-1">
                      {employees.map(emp => (
                        <label key={emp.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                          <Checkbox checked={selectedEmployees.includes(emp.id)} onCheckedChange={() => toggleEmployee(emp.id)} />
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
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={navigateBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium capitalize">{navLabel}</span>
        <Button variant="outline" size="icon" onClick={navigateForward}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={navigateToday}>Hoy</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === "week" ? (
        <WeekView
          weekDays={weekDays}
          shifts={shifts}
          assignments={assignments}
          locations={locations}
          onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
          onDropOnShift={handleDropOnShift}
        />
      ) : (
        <MonthView
          currentMonth={currentMonth}
          shifts={shifts}
          assignments={assignments}
          locations={locations}
          onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
          onDropOnShift={handleDropOnShift}
        />
      )}

      <ShiftDetailDialog
        shift={selectedShift}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        assignments={assignments}
        employees={employees}
        locations={locations}
        clients={clients}
        canEdit={canEdit}
        onAddEmployees={handleAddEmployees}
        onRemoveAssignment={handleRemoveAssignment}
      />
    </div>
  );
}
