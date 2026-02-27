import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Plus, Loader2, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Users, Building2, Calendar, CalendarIcon, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format, startOfWeek, addDays, addMonths, startOfMonth, endOfMonth, subDays, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

import { DayView } from "@/components/shifts/DayView";
import { WeekView } from "@/components/shifts/WeekView";
import { WeekByJobView } from "@/components/shifts/WeekByJobView";
import { MonthView } from "@/components/shifts/MonthView";
import { EmployeeView } from "@/components/shifts/EmployeeView";
import { ClientView } from "@/components/shifts/ClientView";
import { ShiftDetailDialog } from "@/components/shifts/ShiftDetailDialog";
import { ShiftEditDialog } from "@/components/shifts/ShiftEditDialog";
import { ShiftFilters, EMPTY_FILTERS, type ShiftFilterState } from "@/components/shifts/ShiftFilters";
import { WeeklySummaryBar } from "@/components/shifts/WeeklySummaryBar";
import { EmployeeCombobox } from "@/components/shifts/EmployeeCombobox";
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

  const [searchParams, setSearchParams] = useSearchParams();
  const isInitialized = useRef(false);

  // Parse URL params on mount
  const initialDate = useMemo(() => {
    const d = searchParams.get("date");
    if (d) {
      const parsed = parse(d, "yyyy-MM-dd", new Date());
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }, []); // only on mount

  const initialView = useMemo(() => {
    const v = searchParams.get("view");
    if (v && ["day", "week", "month", "employee", "client"].includes(v)) return v as ViewMode;
    return "week" as ViewMode;
  }, []);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [weekViewMode, setWeekViewMode] = useState<"grid" | "job">("job");
  const [currentDay, setCurrentDay] = useState(() => initialDate);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate, { weekStartsOn: 1 }));
  const [filters, setFilters] = useState<ShiftFilterState>(EMPTY_FILTERS);
  const [currentMonth, setCurrentMonth] = useState(() => initialDate);

  // Sync state → URL (after initialization)
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }
    const refDate = viewMode === "day" ? currentDay
      : viewMode === "week" ? weekStart
      : currentMonth;
    setSearchParams(
      { date: format(refDate, "yyyy-MM-dd"), view: viewMode },
      { replace: true }
    );
  }, [viewMode, currentDay, weekStart, currentMonth]);

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Filtered shifts
  const filteredShifts = useMemo(() => {
    let result = shifts;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(s => s.title.toLowerCase().includes(q));
    }
    if (filters.clientId) {
      result = result.filter(s => s.client_id === filters.clientId);
    }
    if (filters.assignedStatus === "assigned") {
      result = result.filter(s => assignments.some(a => a.shift_id === s.id));
    } else if (filters.assignedStatus === "unassigned") {
      result = result.filter(s => !assignments.some(a => a.shift_id === s.id));
    }
    if (filters.publishStatus === "published") {
      result = result.filter(s => s.status === "published");
    } else if (filters.publishStatus === "draft") {
      result = result.filter(s => s.status !== "published");
    }
    return result;
  }, [shifts, assignments, filters]);

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
      supabase.from("scheduled_shifts").select("*, shift_code").eq("company_id", selectedCompanyId)
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
            "Turno disponible para reclamar",
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
          "Turno disponible para reclamar",
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
          "Turno disponible para reclamar",
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

  const handleDuplicateToDay = async (shiftData: any, targetDate: string) => {
    if (!canEdit || !selectedCompanyId) return;
    // Don't duplicate to the same date with same time
    const { error, data: newShift } = await supabase.from("scheduled_shifts").insert({
      company_id: selectedCompanyId,
      title: shiftData.title,
      date: targetDate,
      start_time: shiftData.start_time,
      end_time: shiftData.end_time,
      slots: shiftData.slots ?? 1,
      client_id: shiftData.client_id || null,
      location_id: shiftData.location_id || null,
      notes: shiftData.notes || null,
      claimable: shiftData.claimable ?? false,
      status: "draft",
      created_by: user?.id,
    } as any).select("id").single();

    if (error) { toast.error(error.message); return; }

    if (newShift) {
      await logShiftActivity("duplicar_turno", newShift.id, null, {
        title: shiftData.title, date: targetDate, source_shift: shiftData.shiftId,
      });
    }

    toast.success(`Turno duplicado al ${new Date(targetDate + "T12:00:00").toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })}`);
    loadData();
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

  const handleAddShiftFromCalendar = (targetDate: string) => {
    if (!canEdit) return;
    resetForm();
    setDate(targetDate);
    setCreateOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Turnos</h1>
          </div>
          <p className="text-muted-foreground/60 text-xs ml-10">Programa y gestiona los turnos de trabajo</p>
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
                    <div>
                      <Label className="text-xs text-muted-foreground">Fecha</Label>
                      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full h-9 text-sm justify-start font-normal", !date && "text-muted-foreground")}>
                            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                            {date ? format(parse(date, "yyyy-MM-dd", new Date()), "d MMM yyyy", { locale: es }) : "Seleccionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarWidget
                            mode="single"
                            selected={date ? parse(date, "yyyy-MM-dd", new Date()) : undefined}
                            onSelect={d => { if (d) { setDate(format(d, "yyyy-MM-dd")); setDatePickerOpen(false); } }}
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
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
                    <div className="mt-1">
                      <EmployeeCombobox
                        employees={employees}
                        selected={selectedEmployees}
                        onToggle={toggleEmployee}
                        shifts={shifts}
                        assignments={assignments}
                        shiftDate={date}
                        shiftStart={startTime}
                        shiftEnd={endTime}
                        maxHeight="150px"
                      />
                    </div>
                  </div>
                  <Button onClick={() => setConfirmOpen(true)} disabled={saving || !title.trim() || !date} className="w-full h-9 text-sm">
                    Revisar y crear turno
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filters */}
      <ShiftFilters filters={filters} onChange={setFilters} clients={clients} />

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2">
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
        {viewMode === "week" && (
          <div className="flex items-center gap-1">
            <Button
              variant={weekViewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-[10px] px-2"
              onClick={() => setWeekViewMode("grid")}
            >
              <LayoutGrid className="h-3 w-3 mr-1" /> Grid
            </Button>
            <Button
              variant={weekViewMode === "job" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-[10px] px-2"
              onClick={() => setWeekViewMode("job")}
            >
              <Building2 className="h-3 w-3 mr-1" /> Por cliente
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="rounded-2xl bg-white/50 dark:bg-card/30 border border-border/20 shadow-sm p-5 min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "day" ? (
          <DayView
            currentDay={currentDay}
            shifts={filteredShifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
            onDuplicateToDay={handleDuplicateToDay}
            onAddShift={canEdit ? handleAddShiftFromCalendar : undefined}
          />
        ) : viewMode === "week" ? (
          weekViewMode === "job" ? (
            <WeekByJobView
              weekDays={weekDays}
              shifts={filteredShifts}
              assignments={assignments}
              locations={locations}
              clients={clients}
              employees={employees}
              onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
              onDropOnShift={handleDropOnShift}
            />
          ) : (
            <WeekView
              weekDays={weekDays}
              shifts={filteredShifts}
              assignments={assignments}
              locations={locations}
              clients={clients}
              onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
              onDropOnShift={handleDropOnShift}
              onDuplicateToDay={handleDuplicateToDay}
              onAddShift={canEdit ? handleAddShiftFromCalendar : undefined}
            />
          )
        ) : viewMode === "month" ? (
          <MonthView
            currentMonth={currentMonth}
            shifts={filteredShifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            employees={employees}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
            onAddShift={canEdit ? handleAddShiftFromCalendar : undefined}
          />
        ) : viewMode === "employee" ? (
          <EmployeeView
            employees={employees}
            shifts={filteredShifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
          />
        ) : (
          <ClientView
            clients={clients}
            shifts={filteredShifts}
            assignments={assignments}
            locations={locations}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
          />
        )}
      </div>

      {/* Weekly Summary */}
      <WeeklySummaryBar shifts={filteredShifts} assignments={assignments} />

      {/* Pre-submit confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Confirmar nuevo turno
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                  <p><span className="font-medium">Turno:</span> {title || "—"}</p>
                  <p><span className="font-medium">Fecha:</span> {date ? format(parse(date, "yyyy-MM-dd", new Date()), "EEEE d 'de' MMMM yyyy", { locale: es }) : "—"}</p>
                  <p><span className="font-medium">Horario:</span> {startTime} – {endTime}</p>
                  <p><span className="font-medium">Cliente:</span> {clients.find(c => c.id === clientId)?.name || "Sin asignar"}</p>
                  <p><span className="font-medium">Ubicación:</span> {locations.find(l => l.id === locationId)?.name || "Sin asignar"}</p>
                  <p><span className="font-medium">Plazas:</span> {slots}</p>
                  <p><span className="font-medium">Empleados:</span> {selectedEmployees.length > 0 ? `${selectedEmployees.length} seleccionados` : "Ninguno"}</p>
                  {claimable && <p><span className="font-medium">Reclamable:</span> Sí</p>}
                  {notes && <p><span className="font-medium">Notas:</span> {notes}</p>}
                </div>
                {/* Warnings */}
                {(() => {
                  const warnings: string[] = [];
                  if (startTime >= endTime) warnings.push("La hora de entrada es igual o posterior a la de salida.");
                  if (selectedEmployees.length === 0) warnings.push("No se asignaron empleados.");
                  if (!clientId) warnings.push("No se asignó un cliente.");
                  if (!locationId) warnings.push("No se asignó una ubicación.");
                  const slotsNum = parseInt(slots) || 1;
                  if (selectedEmployees.length > slotsNum) warnings.push(`Se asignaron ${selectedEmployees.length} empleados pero solo hay ${slotsNum} plaza(s).`);
                  if (date && new Date(date + "T00:00:00") < new Date(new Date().toDateString())) warnings.push("La fecha es anterior a hoy.");
                  // Conflict detection
                  selectedEmployees.forEach(eid => {
                    const empAssigns = assignments.filter(a => a.employee_id === eid);
                    const empShiftIds = new Set(empAssigns.map(a => a.shift_id));
                    const conflicting = shifts.filter(s => {
                      if (!empShiftIds.has(s.id)) return false;
                      if (s.date !== date) return false;
                      return startTime < s.end_time.slice(0, 5) && endTime > s.start_time.slice(0, 5);
                    });
                    if (conflicting.length > 0) {
                      const emp = employees.find(e => e.id === eid);
                      warnings.push(`${emp?.first_name} ${emp?.last_name} tiene conflicto con "${conflicting[0].title}" (${conflicting[0].start_time.slice(0, 5)}–${conflicting[0].end_time.slice(0, 5)}).`);
                    }
                  });
                  return warnings.length > 0 ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                      {warnings.map((w, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-earning flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sin advertencias detectadas.
                    </p>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver a editar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Confirmar y crear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShiftDetailDialog
        shift={selectedShift}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        assignments={assignments}
        employees={employees}
        locations={locations}
        clients={clients}
        allShifts={shifts}
        canEdit={canEdit}
        onAddEmployees={handleAddEmployees}
        onRemoveAssignment={handleRemoveAssignment}
        onEdit={(s) => { setEditShift(s); setEditOpen(true); }}
        onPublish={handlePublishShift}
        onSave={handleEditShift}
        onRequestAction={loadData}
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
