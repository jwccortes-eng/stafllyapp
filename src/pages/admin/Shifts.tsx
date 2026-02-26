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
import { Plus, Loader2, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Users, Building2, Calendar } from "lucide-react";
import { format, startOfWeek, addDays, addMonths, startOfMonth, endOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";

import { DayView } from "@/components/shifts/DayView";
import { WeekView } from "@/components/shifts/WeekView";
import { MonthView } from "@/components/shifts/MonthView";
import { EmployeeView } from "@/components/shifts/EmployeeView";
import { ClientView } from "@/components/shifts/ClientView";
import { ShiftDetailDialog } from "@/components/shifts/ShiftDetailDialog";
import { ShiftEditDialog } from "@/components/shifts/ShiftEditDialog";
import type { Shift, Assignment, SelectOption, Employee, ViewMode } from "@/components/shifts/types";

// Fields that affect ALL assigned employees (broadcast notification)
const BROADCAST_FIELDS = ["date", "start_time", "end_time", "location_id", "client_id"];

function getChangedFields(oldShift: Shift, updates: Partial<Shift>): { field: string; old: any; new: any }[] {
  const changes: { field: string; old: any; new: any }[] = [];
  for (const [key, val] of Object.entries(updates)) {
    const oldVal = (oldShift as any)[key];
    const normalizedOld = oldVal === undefined || oldVal === null ? null : String(oldVal);
    const normalizedNew = val === undefined || val === null ? null : String(val);
    if (normalizedOld !== normalizedNew) {
      changes.push({ field: key, old: oldVal, new: val });
    }
  }
  return changes;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Título", date: "Fecha", start_time: "Hora inicio", end_time: "Hora fin",
  slots: "Plazas", client_id: "Cliente", location_id: "Ubicación",
  notes: "Notas", claimable: "Reclamable", status: "Estado",
};

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
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [currentDay, setCurrentDay] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  // Detail dialog
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Edit dialog
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Create form
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
    if (viewMode === "day") {
      dateFrom = format(currentDay, "yyyy-MM-dd");
      dateTo = dateFrom;
    } else if (viewMode === "week") {
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
  }, [selectedCompanyId, weekStart, currentMonth, currentDay, viewMode]);

  useEffect(() => { loadData(); }, [loadData]);

  const resetForm = () => {
    setTitle(""); setDate(""); setStartTime("08:00"); setEndTime("17:00");
    setSlots("1"); setClientId(""); setLocationId(""); setNotes("");
    setClaimable(false); setSelectedEmployees([]);
  };

  // --- Notification helper ---
  const sendShiftNotifications = async (
    shiftId: string,
    shiftTitle: string,
    type: string,
    notifTitle: string,
    notifBody: string,
    recipientEmployeeIds: string[],
    metadata: Record<string, any> = {}
  ) => {
    if (recipientEmployeeIds.length === 0 || !selectedCompanyId) return;
    const notifications = recipientEmployeeIds.map(eid => ({
      company_id: selectedCompanyId,
      recipient_id: eid,
      recipient_type: "employee",
      type,
      title: notifTitle,
      body: notifBody,
      metadata: { shift_id: shiftId, shift_title: shiftTitle, ...metadata },
      created_by: user?.id,
    }));
    await supabase.from("notifications").insert(notifications as any);
  };

  // --- Audit helper ---
  const logShiftActivity = async (
    action: string,
    shiftId: string,
    oldData?: any,
    newData?: any,
    details?: any
  ) => {
    await supabase.rpc("log_activity_detailed", {
      _action: action,
      _entity_type: "scheduled_shift",
      _entity_id: shiftId,
      _company_id: selectedCompanyId,
      _details: details || {},
      _old_data: oldData || null,
      _new_data: newData || null,
    });
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

    if (shift) {
      await logShiftActivity("crear_turno", shift.id, null, { title: title.trim(), date, start_time: startTime, end_time: endTime });

      // If claimable, notify ALL active employees in the company
      if (claimable) {
        const { data: activeEmps } = await supabase
          .from("employees")
          .select("id")
          .eq("company_id", selectedCompanyId)
          .eq("is_active", true);

        const allEmpIds = (activeEmps ?? []).map(e => e.id);
        // Exclude already-assigned employees
        const assignedSet = new Set(selectedEmployees);
        const claimRecipients = allEmpIds.filter(id => !assignedSet.has(id));

        if (claimRecipients.length > 0) {
          const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" });
          await sendShiftNotifications(
            shift.id,
            title.trim(),
            "shift_claimable",
            "🙋 Turno disponible para reclamar",
            `"${title.trim()}" el ${dateLabel} (${startTime.slice(0, 5)}–${endTime.slice(0, 5)}). Aplica y te notificaremos si eres aceptado.`,
            claimRecipients,
            { claimable: true }
          );
        }
      }
    }

    toast.success("Turno creado");
    setSaving(false); setCreateOpen(false); resetForm(); loadData();
  };

  const handleEditShift = async (shiftId: string, updates: Partial<Shift>, oldShift: Shift) => {
    const changes = getChangedFields(oldShift, updates);
    if (changes.length === 0) { toast.info("Sin cambios"); return; }

    const { error } = await supabase.from("scheduled_shifts")
      .update(updates as any)
      .eq("id", shiftId);
    if (error) { toast.error(error.message); return; }

    // Log audit
    const oldData: Record<string, any> = {};
    const newData: Record<string, any> = {};
    changes.forEach(c => { oldData[c.field] = c.old; newData[c.field] = c.new; });
    await logShiftActivity("editar_turno", shiftId, oldData, newData, {
      changed_fields: changes.map(c => c.field),
    });

    // Determine if broadcast or personal notification
    const isBroadcast = changes.some(c => BROADCAST_FIELDS.includes(c.field));
    const shiftAssigns = assignments.filter(a => a.shift_id === shiftId);
    const affectedEmployeeIds = shiftAssigns.map(a => a.employee_id);

    if (affectedEmployeeIds.length > 0) {
      const changeDescription = changes
        .map(c => `${FIELD_LABELS[c.field] || c.field}: ${c.old ?? "—"} → ${c.new ?? "—"}`)
        .join(", ");

      if (isBroadcast) {
        // Notify ALL assigned employees
        await sendShiftNotifications(
          shiftId,
          updates.title || oldShift.title,
          "shift_change",
          `Turno modificado: ${updates.title || oldShift.title}`,
          `Se actualizó: ${changeDescription}`,
          affectedEmployeeIds,
          { changes, broadcast: true }
        );
      } else {
        // Personal notification only (title, notes, slots, claimable changes)
        await sendShiftNotifications(
          shiftId,
          updates.title || oldShift.title,
          "shift_change",
          `Turno actualizado: ${updates.title || oldShift.title}`,
          `Cambio menor: ${changeDescription}`,
          affectedEmployeeIds,
          { changes, broadcast: false }
        );
      }
    }

    // If shift just became claimable, notify all active employees
    const becameClaimable = changes.some(c => c.field === "claimable" && c.new === true);
    if (becameClaimable && selectedCompanyId) {
      const { data: activeEmps } = await supabase
        .from("employees")
        .select("id")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true);
      const assignedSet = new Set(affectedEmployeeIds);
      const claimRecipients = (activeEmps ?? []).map(e => e.id).filter(id => !assignedSet.has(id));
      if (claimRecipients.length > 0) {
        const shiftTitle = updates.title || oldShift.title;
        const dateLabel = new Date(oldShift.date + "T12:00:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" });
        await sendShiftNotifications(
          shiftId, shiftTitle, "shift_claimable",
          "🙋 Turno disponible para reclamar",
          `"${shiftTitle}" el ${dateLabel} (${oldShift.start_time.slice(0, 5)}–${oldShift.end_time.slice(0, 5)}). Aplica y te notificaremos si eres aceptado.`,
          claimRecipients, { claimable: true }
        );
      }
    }

    toast.success("Turno actualizado");
    // Update selected shift in detail dialog
    setSelectedShift(prev => prev?.id === shiftId ? { ...prev, ...updates } as Shift : prev);
    loadData();
  };

  const handlePublishShift = async (shift: Shift) => {
    const { error } = await supabase.from("scheduled_shifts")
      .update({ status: "published" } as any)
      .eq("id", shift.id);
    if (error) { toast.error(error.message); return; }

    await logShiftActivity("publicar_turno", shift.id, { status: shift.status }, { status: "published" });

    // Notify all assigned employees
    const shiftAssigns = assignments.filter(a => a.shift_id === shift.id);
    const employeeIds = shiftAssigns.map(a => a.employee_id);

    await sendShiftNotifications(
      shift.id,
      shift.title,
      "shift_published",
      `Turno publicado: ${shift.title}`,
      `Tu turno "${shift.title}" del ${shift.date} (${shift.start_time.slice(0, 5)}-${shift.end_time.slice(0, 5)}) ha sido publicado.`,
      employeeIds,
      { broadcast: true }
    );

    // If claimable, also notify all other active employees
    if (shift.claimable && selectedCompanyId) {
      const { data: activeEmps } = await supabase
        .from("employees")
        .select("id")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true);
      const assignedSet = new Set(employeeIds);
      const claimRecipients = (activeEmps ?? []).map(e => e.id).filter(id => !assignedSet.has(id));
      if (claimRecipients.length > 0) {
        const dateLabel = new Date(shift.date + "T12:00:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" });
        await sendShiftNotifications(
          shift.id, shift.title, "shift_claimable",
          "🙋 Turno disponible para reclamar",
          `"${shift.title}" el ${dateLabel} (${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}). Aplica y te notificaremos si eres aceptado.`,
          claimRecipients, { claimable: true }
        );
      }
    }

    toast.success("Turno publicado y empleados notificados");
    setSelectedShift(prev => prev?.id === shift.id ? { ...prev, status: "published" } : prev);
    loadData();
  };

  const handleAddEmployees = async (shiftId: string, employeeIds: string[]) => {
    if (!selectedCompanyId) return;
    const assigns = employeeIds.map(eid => ({
      company_id: selectedCompanyId, shift_id: shiftId, employee_id: eid, status: "pending",
    }));
    const { error } = await supabase.from("shift_assignments").insert(assigns as any);
    if (error) { toast.error(error.message); return; }

    const shift = shifts.find(s => s.id === shiftId);
    await logShiftActivity("asignar_empleados", shiftId, null, { employee_ids: employeeIds }, {
      count: employeeIds.length,
    });

    // Notify newly assigned employees
    if (shift) {
      await sendShiftNotifications(
        shiftId,
        shift.title,
        "shift_assigned",
        `Asignado a turno: ${shift.title}`,
        `Has sido asignado al turno "${shift.title}" del ${shift.date} (${shift.start_time.slice(0, 5)}-${shift.end_time.slice(0, 5)}).`,
        employeeIds
      );
    }

    toast.success(`${employeeIds.length} empleado(s) asignados`);
    loadData();
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    const { error } = await supabase.from("shift_assignments").delete().eq("id", assignmentId);
    if (error) { toast.error(error.message); return; }

    if (assignment) {
      const shift = shifts.find(s => s.id === assignment.shift_id);
      await logShiftActivity("remover_empleado", assignment.shift_id,
        { employee_id: assignment.employee_id }, null
      );
      if (shift) {
        await sendShiftNotifications(
          assignment.shift_id,
          shift.title,
          "shift_unassigned",
          `Removido del turno: ${shift.title}`,
          `Has sido removido del turno "${shift.title}" del ${shift.date}.`,
          [assignment.employee_id]
        );
      }
    }

    toast.success("Empleado removido del turno");
    loadData();
  };

  const handleDropOnShift = async (targetShiftId: string, dataStr: string) => {
    if (!canEdit) return;
    try {
      const data = JSON.parse(dataStr);
      const { assignmentId, employeeId, fromShiftId } = data;
      if (fromShiftId === targetShiftId) return;

      const existing = assignments.find(a => a.shift_id === targetShiftId && a.employee_id === employeeId);
      if (existing) { toast.error("Ya está asignado a este turno"); return; }

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

  const navLabel = viewMode === "day"
    ? format(currentDay, "EEEE d 'de' MMMM yyyy", { locale: es })
    : viewMode === "week"
      ? `${format(weekStart, "d MMM", { locale: es })} — ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}`
      : format(currentMonth, "MMMM yyyy", { locale: es });

  const navigateBack = () => {
    if (viewMode === "day") setCurrentDay(d => subDays(d, 1));
    else if (viewMode === "week") setWeekStart(d => addDays(d, -7));
    else setCurrentMonth(d => addMonths(d, -1));
  };

  const navigateForward = () => {
    if (viewMode === "day") setCurrentDay(d => addDays(d, 1));
    else if (viewMode === "week") setWeekStart(d => addDays(d, 7));
    else setCurrentMonth(d => addMonths(d, 1));
  };

  const navigateToday = () => {
    setCurrentDay(new Date());
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setCurrentMonth(new Date());
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Turnos</h1>
          <p className="text-muted-foreground text-xs">Programa y gestiona los turnos de trabajo</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
            <TabsList className="h-8 bg-muted/50 backdrop-blur-sm">
              <TabsTrigger value="day" className="text-[11px] gap-1 px-2 data-[state=active]:bg-background">
                <Calendar className="h-3 w-3" /> Día
              </TabsTrigger>
              <TabsTrigger value="week" className="text-[11px] gap-1 px-2 data-[state=active]:bg-background">
                <LayoutGrid className="h-3 w-3" /> Semana
              </TabsTrigger>
              <TabsTrigger value="month" className="text-[11px] gap-1 px-2 data-[state=active]:bg-background">
                <CalendarDays className="h-3 w-3" /> Mes
              </TabsTrigger>
              <TabsTrigger value="employee" className="text-[11px] gap-1 px-2 data-[state=active]:bg-background">
                <Users className="h-3 w-3" /> Empleados
              </TabsTrigger>
              <TabsTrigger value="client" className="text-[11px] gap-1 px-2 data-[state=active]:bg-background">
                <Building2 className="h-3 w-3" /> Clientes
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {canEdit && (
            <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1" /> Nuevo turno</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto p-5">
                <DialogHeader><DialogTitle className="text-base font-semibold">Nuevo turno</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nombre del turno</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Turno mañana" className="h-9 text-sm" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs text-muted-foreground">Fecha</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" /></div>
                    <div><Label className="text-xs text-muted-foreground">Entrada</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-sm" /></div>
                    <div><Label className="text-xs text-muted-foreground">Salida</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Cliente</Label>
                      <Select value={clientId || "none"} onValueChange={v => setClientId(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Ubicación</Label>
                      <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div><Label className="text-xs text-muted-foreground">Plazas disponibles</Label><Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" className="h-9 text-sm" /></div>
                    <div className="flex items-center gap-2 h-9">
                      <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="claimable" />
                      <Label htmlFor="claimable" className="text-xs font-normal cursor-pointer">Permitir reclamo</Label>
                    </div>
                  </div>
                  <div><Label className="text-xs text-muted-foreground">Notas adicionales</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." className="text-sm resize-none" /></div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Asignar empleados</Label>
                    <div className="border rounded-lg max-h-36 overflow-y-auto p-2 mt-1 space-y-0.5">
                      {employees.map(emp => (
                        <label key={emp.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs">
                          <Checkbox checked={selectedEmployees.includes(emp.id)} onCheckedChange={() => toggleEmployee(emp.id)} />
                          {emp.first_name} {emp.last_name}
                        </label>
                      ))}
                      {employees.length === 0 && <p className="text-xs text-muted-foreground p-2">No hay empleados activos</p>}
                    </div>
                  </div>
                  <Button onClick={handleCreate} disabled={saving || !title.trim() || !date} className="w-full h-9 text-sm">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    Crear turno
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigateBack}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium capitalize min-w-[140px] text-center">{navLabel}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigateForward}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={navigateToday}>Hoy</Button>
      </div>

      {/* Content */}
      <div className="rounded-xl bg-gradient-to-br from-muted/30 via-background to-muted/20 border border-border/30 p-4 min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "day" ? (
          <DayView
            currentDay={currentDay}
            shifts={shifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
          />
        ) : viewMode === "week" ? (
          <WeekView
            weekDays={weekDays}
            shifts={shifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
          />
        ) : viewMode === "month" ? (
          <MonthView
            currentMonth={currentMonth}
            shifts={shifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
          />
        ) : viewMode === "employee" ? (
          <EmployeeView
            employees={employees}
            shifts={shifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
          />
        ) : (
          <ClientView
            clients={clients}
            shifts={shifts}
            assignments={assignments}
            locations={locations}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
          />
        )}
      </div>

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
        onEdit={(s) => { setEditShift(s); setEditOpen(true); }}
        onPublish={handlePublishShift}
        onSave={handleEditShift}
      />

      <ShiftEditDialog
        shift={editShift}
        open={editOpen}
        onOpenChange={setEditOpen}
        clients={clients}
        locations={locations}
        onSave={handleEditShift}
      />
    </div>
  );
}
