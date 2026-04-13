import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePageView } from "@/hooks/useAuditLog";
// AuditPanel available via dropdown in future iteration
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useEmployeeAvailability } from "@/hooks/useEmployeeAvailability";
import { usePayrollConfig } from "@/hooks/usePayrollConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
// Tabs removed — using custom view switcher
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Plus, Loader2, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Users, Building2, Calendar, CalendarIcon, AlertTriangle, CheckCircle2, Clock, Lock, Unlock, Send, Upload, MoreHorizontal, ScanEye, MessageSquare, Hash, CreditCard, FileText, Car, UserX, Map, Copy } from "lucide-react";
import { formatDisplayText } from "@/lib/format-helpers";
// PageHeader not used — custom header with KPI cards
import { format, startOfWeek, addDays, addMonths, startOfMonth, endOfMonth, subDays, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

import { DayView } from "@/components/shifts/DayView";
import { WeekView } from "@/components/shifts/WeekView";
import { WeekByJobView } from "@/components/shifts/WeekByJobView";
import { WeekByEmployeeView } from "@/components/shifts/WeekByEmployeeView";
import { MonthView } from "@/components/shifts/MonthView";
import { EmployeeView } from "@/components/shifts/EmployeeView";
import { ClientView } from "@/components/shifts/ClientView";
import { ShiftDetailDialog } from "@/components/shifts/ShiftDetailDialog";
import { ShiftEditDialog } from "@/components/shifts/ShiftEditDialog";
import { ShiftFilters, EMPTY_FILTERS, type ShiftFilterState } from "@/components/shifts/ShiftFilters";
import { WeeklySummaryBar } from "@/components/shifts/WeeklySummaryBar";
import { EmployeeCombobox } from "@/components/shifts/EmployeeCombobox";
import { ShiftRepeatSection, DEFAULT_REPEAT, computeRepeatDates, type RepeatConfig } from "@/components/shifts/ShiftRepeatSection";
import { QuickCreatePopover } from "@/components/shifts/QuickCreatePopover";
import { QuickAddInviteWizard } from "@/components/employee/QuickAddInviteWizard";
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
  usePageView("Programación");
  const navigate = useNavigate();
  const { role, hasModuleAccess, user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { config: payrollConfig } = usePayrollConfig();
  const payrollWeekStart = payrollConfig.payroll_week_start_day as 0 | 1 | 2 | 3 | 4 | 5 | 6;
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
  const [locations, setLocations] = useState<(SelectOption & { address?: string; client_id?: string | null })[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Open create dialog when navigated with ?create=1
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreateOpen(true);
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete("create"); return p; }, { replace: true });
    }
  }, [searchParams]);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [weekViewMode, setWeekViewMode] = useState<"grid" | "job" | "employee">("job");
  const [currentDay, setCurrentDay] = useState(() => initialDate);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate, { weekStartsOn: payrollWeekStart }));
  const [filters, setFilters] = useState<ShiftFilterState>(EMPTY_FILTERS);
  const [currentMonth, setCurrentMonth] = useState(() => initialDate);

  // Re-align weekStart when payroll config loads
  useEffect(() => {
    setWeekStart(prev => startOfWeek(prev, { weekStartsOn: payrollWeekStart }));
  }, [payrollWeekStart]);

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
  const [newClientName, setNewClientName] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [notes, setNotes] = useState("");
  const [claimable, setClaimable] = useState(false);
  const [meetingPoint, setMeetingPoint] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [payType, setPayType] = useState<"hourly" | "daily">("hourly");
  const [dayType, setDayType] = useState<"full_day" | "half_day">("full_day");
  const [shiftAdminId, setShiftAdminId] = useState("");
  const [transportRequired, setTransportRequired] = useState(false);
  const [carCapacity, setCarCapacity] = useState("4");
  const [transportNotes, setTransportNotes] = useState("");
  const [driverEmployeeId, setDriverEmployeeId] = useState("");
  const [repeatConfig, setRepeatConfig] = useState<RepeatConfig>(DEFAULT_REPEAT);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [copyingWeek, setCopyingWeek] = useState(false);

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
    if (filters.locationId) {
      result = result.filter(s => s.location_id === filters.locationId);
    }
    if (filters.assignedStatus === "assigned") {
      result = result.filter(s => assignments.some(a => a.shift_id === s.id));
    } else if (filters.assignedStatus === "unassigned") {
      result = result.filter(s => !assignments.some(a => a.shift_id === s.id));
    }
    if (filters.publishStatus === "published") {
      result = result.filter(s => s.status === "published");
    } else if (filters.publishStatus === "draft") {
      result = result.filter(s => s.status !== "published" && s.status !== "locked");
    } else if (filters.publishStatus === "locked") {
      result = result.filter(s => s.status === "locked");
    }
    if (filters.claimableOnly) {
      result = result.filter(s => s.claimable);
    }
    return result;
  }, [shifts, assignments, filters]);

  // ── KPI metrics ──
  const kpiMetrics = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayShifts = filteredShifts.filter(s => s.date === todayStr);
    const todayAssignments = assignments.filter(a => todayShifts.some(s => s.id === a.shift_id));
    const uniqueWorkers = new Set(todayAssignments.map(a => a.employee_id)).size;
    const missingWorkers = todayShifts.reduce((sum, s) => {
      const assigned = assignments.filter(a => a.shift_id === s.id).length;
      return sum + Math.max(0, (s.slots ?? 1) - assigned);
    }, 0);
    let totalMinutes = 0;
    for (const s of todayShifts) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      totalMinutes += diff;
    }
    const totalHours = `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
    return { todayShifts: todayShifts.length, uniqueWorkers, missingWorkers, totalHours };
  }, [filteredShifts, assignments]);

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

    // Fetch shifts for the date range
    const shiftsRes = await supabase.from("scheduled_shifts").select("*, shift_code").eq("company_id", selectedCompanyId)
      .gte("date", dateFrom).lte("date", dateTo)
      .is("deleted_at", null).order("start_time");
    const shiftIds = (shiftsRes.data ?? []).map(s => s.id);

    // Fetch assignments only for visible shifts (avoids 1000-row limit)
    let allAssignments: any[] = [];
    if (shiftIds.length > 0) {
      for (let i = 0; i < shiftIds.length; i += 200) {
        const chunk = shiftIds.slice(i, i + 200);
        const { data } = await supabase.from("shift_assignments").select("*")
          .eq("company_id", selectedCompanyId)
          .in("shift_id", chunk);
        if (data) allAssignments.push(...data);
      }
    }

    const [clientsRes, locsRes, empsRes] = await Promise.all([
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      supabase.from("locations").select("id, name, address, client_id, default_pay_type, default_clock_method, require_car, default_instructions").eq("company_id", selectedCompanyId).is("deleted_at", null),
      supabase.from("employees").select("id, first_name, last_name, phone_number, avatar_url, gender, employee_role, groups, user_id, has_car").eq("company_id", selectedCompanyId).eq("is_active", true),
    ]);
    setShifts((shiftsRes.data ?? []) as Shift[]);
    setAssignments(allAssignments as Assignment[]);
    setClients((clientsRes.data ?? []) as SelectOption[]);
    setLocations((locsRes.data ?? []) as any[]);
    setEmployees((empsRes.data ?? []) as Employee[]);
    setLoading(false);
  }, [selectedCompanyId, weekStart, currentMonth, currentDay, viewMode]);

  useEffect(() => { loadData(); }, [loadData]);

  // Availability data for the current view range
  const availDateFrom = viewMode === "day" ? format(currentDay, "yyyy-MM-dd")
    : viewMode === "week" ? format(weekStart, "yyyy-MM-dd")
    : format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const availDateTo = viewMode === "day" ? format(currentDay, "yyyy-MM-dd")
    : viewMode === "week" ? format(addDays(weekStart, 6), "yyyy-MM-dd")
    : format(endOfMonth(currentMonth), "yyyy-MM-dd");
  const { configs: availConfigs, overrides: availOverrides } = useEmployeeAvailability({
    dateFrom: availDateFrom,
    dateTo: availDateTo,
  });

  const resetForm = () => {
    setTitle(""); setDate(""); setStartTime("08:00"); setEndTime("17:00");
    setSlots("1"); setClientId(""); setLocationId(""); setNotes("");
    setClaimable(false); setSelectedEmployees([]);
    setMeetingPoint(""); setSpecialInstructions(""); setPayType("hourly");
    setDayType("full_day"); setShiftAdminId("");
    setTransportRequired(false); setCarCapacity("4"); setTransportNotes(""); setDriverEmployeeId("");
    setNewLocationName(""); setNewLocationAddress(""); setShowAddLocation(false);
    setRepeatConfig(DEFAULT_REPEAT);
  };

  // Quick-add client inline
  const handleQuickAddClient = async () => {
    if (!newClientName.trim() || !selectedCompanyId) return;
    setAddingClient(true);
    const { data, error } = await supabase.from("clients").insert({
      company_id: selectedCompanyId,
      name: newClientName.trim(),
    } as any).select("id").single();
    if (error) { toast.error(error.message); setAddingClient(false); return; }
    if (data) {
      setClients(prev => [...prev, { id: data.id, name: newClientName.trim() }]);
      setClientId(data.id);
      toast.success(`Cliente "${newClientName.trim()}" creado`);
    }
    setNewClientName("");
    setAddingClient(false);
    setShowAddClient(false);
  };

  // Quick-add location inline
  const handleQuickAddLocation = async () => {
    if (!newLocationName.trim() || !selectedCompanyId) return;
    setAddingLocation(true);
    const { data, error } = await supabase.from("locations").insert({
      company_id: selectedCompanyId,
      name: newLocationName.trim(),
      address: newLocationAddress.trim() || null,
      client_id: clientId || null,
    } as any).select("id").single();
    if (error) { toast.error(error.message); setAddingLocation(false); return; }
    if (data) {
      setLocations(prev => [...prev, { id: data.id, name: newLocationName.trim(), address: newLocationAddress.trim(), client_id: clientId || null }]);
      setLocationId(data.id);
      if (newLocationAddress.trim()) setMeetingPoint(newLocationAddress.trim());
      toast.success(`Ubicación "${newLocationName.trim()}" creada`);
    }
    setNewLocationName(""); setNewLocationAddress("");
    setAddingLocation(false); setShowAddLocation(false);
  };

  // Auto-fill meeting point from client's location address
  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId === "none" ? "" : newClientId);
    if (newClientId && newClientId !== "none") {
      const loc = locations.find(l => l.client_id === newClientId && l.address);
      if (loc?.address) setMeetingPoint(loc.address);
    }
  };

  // Auto-populate defaults when location is selected
  const handleLocationChange = (newLocId: string) => {
    const id = newLocId === "none" ? "" : newLocId;
    setLocationId(id);
    if (id) {
      const loc = locations.find(l => l.id === id) as any;
      if (loc) {
        if (loc.address) setMeetingPoint(loc.address);
        if (loc.default_pay_type) setPayType(loc.default_pay_type as "hourly" | "daily");
        if (loc.default_clock_method) {
          // clock method not in create form state yet but used in edit; set transport
        }
        if (loc.require_car) {
          setTransportRequired(true);
          toast.info("🚗 Esta ubicación requiere transporte");
        }
        if (loc.default_instructions) setSpecialInstructions(loc.default_instructions);
      }
    }
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

  const createSingleShift = async (shiftDate: string, skipNotifications = false, forceDraft = false) => {
    if (!selectedCompanyId) return null;
    const insertData: any = {
      company_id: selectedCompanyId,
      title: title.trim() || "Turno",
      date: shiftDate, start_time: startTime, end_time: endTime,
      slots: parseInt(slots) || 1,
      client_id: clientId || null,
      location_id: locationId || null,
      notes: notes.trim() || null,
      claimable,
      meeting_point: meetingPoint.trim() || null,
      special_instructions: specialInstructions.trim() || null,
      created_by: user?.id,
      pay_type: payType,
      day_type: payType === "daily" ? dayType : "full_day",
      shift_admin_id: shiftAdminId || null,
      transportation_required: transportRequired,
      car_capacity: parseInt(carCapacity) || 4,
      transportation_notes: transportNotes.trim() || null,
      driver_employee_id: driverEmployeeId || null,
    };
    if (forceDraft) insertData.status = "draft";
    const { data: shift, error } = await supabase.from("scheduled_shifts").insert(insertData).select("id, shift_code").single();

    if (error) { toast.error(error.message); return null; }

    if (shift?.shift_code) {
      const code = String(shift.shift_code).padStart(4, "0");
      const finalTitle = title.trim() ? `#${code} ${title.trim()}` : `#${code}`;
      await supabase.from("scheduled_shifts")
        .update({ title: finalTitle } as any)
        .eq("id", shift.id);
    }

    if (selectedEmployees.length > 0 && shift) {
      const assigns = selectedEmployees.map(eid => ({
        company_id: selectedCompanyId, shift_id: shift.id, employee_id: eid, status: "pending",
      }));
      await supabase.from("shift_assignments").insert(assigns as any);
    }

    if (shift) {
      await logShiftActivity("crear_turno", shift.id, null, { title: title.trim(), date: shiftDate, start_time: startTime, end_time: endTime });

      // Notifications only for the base shift (not repeated drafts)
      if (!skipNotifications && claimable) {
        const { data: activeEmps } = await supabase
          .from("employees")
          .select("id")
          .eq("company_id", selectedCompanyId)
          .eq("is_active", true);

        const allEmpIds = (activeEmps ?? []).map(e => e.id);
        const assignedSet = new Set(selectedEmployees);
        const claimRecipients = allEmpIds.filter(id => !assignedSet.has(id));

        if (claimRecipients.length > 0) {
          const dateLabel = new Date(shiftDate + "T12:00:00").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" });
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

    return shift;
  };

  const handleCreate = async () => {
    if (!date || !selectedCompanyId) return;
    setSaving(true);

    // Create the base shift (may notify if not repeating)
    const repeatDates = computeRepeatDates(date, repeatConfig);
    const isRepeating = repeatConfig.enabled && repeatDates.length > 0;

    const baseShift = await createSingleShift(date, isRepeating);
    if (!baseShift) { setSaving(false); return; }

    // Create repeated shifts (all as draft, no notifications)
    if (isRepeating) {
      const copyAssign = repeatConfig.copyAssignments;
      // Temporarily clear employees if not copying
      const savedEmployees = [...selectedEmployees];
      if (!copyAssign) setSelectedEmployees([]);

      for (const repeatDate of repeatDates) {
        await createSingleShift(repeatDate, true, true);
      }

      if (!copyAssign) setSelectedEmployees(savedEmployees);
      toast.success(`${repeatDates.length + 1} turnos creados (${repeatDates.length} repetidos en borrador)`);
    } else {
      toast.success("Turno creado");
    }

    setSaving(false); setCreateOpen(false); resetForm(); loadData();
  };

  // Quick create: minimal shift from popover
  const handleQuickCreate = async (data: { title: string; date: string; start_time: string; end_time: string; client_id: string; location_id: string; slots: number }) => {
    if (!selectedCompanyId) return;
    const { data: shift, error } = await supabase.from("scheduled_shifts").insert({
      company_id: selectedCompanyId,
      title: data.title,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      slots: data.slots,
      client_id: data.client_id || null,
      location_id: data.location_id || null,
      status: "draft",
      created_by: user?.id,
    } as any).select("id, shift_code").single();

    if (error) { toast.error(error.message); return; }
    if (shift?.shift_code) {
      const code = String(shift.shift_code).padStart(4, "0");
      const finalTitle = data.title ? `#${code} ${data.title}` : `#${code}`;
      await supabase.from("scheduled_shifts").update({ title: finalTitle } as any).eq("id", shift.id);
    }
    if (shift) await logShiftActivity("crear_turno", shift.id, null, { title: data.title, date: data.date, quick: true });
    toast.success("Turno borrador creado");
    loadData();
  };

  const handleOpenFullWithPrefill = (data: { title: string; date: string; start_time: string; end_time: string; client_id: string; location_id: string; slots: number }) => {
    resetForm();
    setTitle(data.title === "Turno" ? "" : data.title);
    setDate(data.date);
    setStartTime(data.start_time);
    setEndTime(data.end_time);
    setClientId(data.client_id);
    setLocationId(data.location_id);
    setSlots(String(data.slots));
    setCreateOpen(true);
  };

  const handleEditShift = async (shiftId: string, updates: Partial<Shift>, oldShift: Shift) => {
    if (oldShift.status === "locked") { toast.error("Este turno está bloqueado y no se puede editar"); return; }
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

  // --- Bulk publish all draft shifts in current view ---
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const handlePublishAll = async () => {
    const draftShifts = filteredShifts.filter(s => s.status !== "published" && s.status !== "locked");
    if (draftShifts.length === 0) { toast.info("No hay turnos borrador para publicar"); return; }
    setBulkPublishing(true);
    const ids = draftShifts.map(s => s.id);
    const { error } = await supabase.from("scheduled_shifts")
      .update({ status: "published" } as any)
      .in("id", ids);
    if (error) { toast.error(error.message); setBulkPublishing(false); return; }

    for (const shift of draftShifts) {
      await logShiftActivity("publicar_turno", shift.id, { status: shift.status }, { status: "published" });

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
            shift.id,
            shift.title,
            "shift_claimable",
            "Turno disponible para reclamar",
            `"${shift.title}" el ${dateLabel} (${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}). Aplica y te notificaremos si eres aceptado.`,
            claimRecipients,
            { claimable: true }
          );
        }
      }
    }

    toast.success(`${ids.length} turno(s) publicados`);
    setBulkPublishing(false);
    loadData();
  };

  // --- Bulk lock all shifts in current view ---
  const [bulkLocking, setBulkLocking] = useState(false);
  const handleLockAll = async () => {
    const unlocked = filteredShifts.filter(s => s.status !== "locked");
    if (unlocked.length === 0) { toast.info("Todos los turnos ya están bloqueados"); return; }
    setBulkLocking(true);
    const ids = unlocked.map(s => s.id);
    const { error } = await supabase.from("scheduled_shifts")
      .update({ status: "locked" } as any)
      .in("id", ids);
    if (error) { toast.error(error.message); setBulkLocking(false); return; }
    toast.success(`${ids.length} turno(s) bloqueados`);
    setBulkLocking(false);
    loadData();
  };

  // --- Bulk unlock all shifts in current view ---
  const [bulkUnlocking, setBulkUnlocking] = useState(false);
  const handleUnlockAll = async () => {
    const locked = filteredShifts.filter(s => s.status === "locked");
    if (locked.length === 0) { toast.info("No hay turnos bloqueados para desbloquear"); return; }
    setBulkUnlocking(true);
    const ids = locked.map(s => s.id);
    const { error } = await supabase.from("scheduled_shifts")
      .update({ status: "published" } as any)
      .in("id", ids);
    if (error) { toast.error(error.message); setBulkUnlocking(false); return; }
    toast.success(`${ids.length} turno(s) desbloqueados`);
    setBulkUnlocking(false);
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
      pay_type: shiftData.pay_type || "hourly",
    } as any).select("id, shift_code").single();

    if (error) { toast.error(error.message); return; }

    // Update title to include the auto-generated shift code
    if (newShift?.shift_code) {
      const originalTitle = shiftData.title.replace(/^#\d{4}\s*/, ""); // strip old code if duplicating
      const code = String(newShift.shift_code).padStart(4, "0");
      await supabase.from("scheduled_shifts")
        .update({ title: `#${code} ${originalTitle}` } as any)
        .eq("id", newShift.id);
    }

    if (newShift) {
      await logShiftActivity("duplicar_turno", newShift.id, null, {
        title: shiftData.title, date: targetDate, source_shift: shiftData.shiftId,
      });
    }

    toast.success(`Turno duplicado al ${new Date(targetDate + "T12:00:00").toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })}`);
    loadData();
  };

  const handleCopyWeek = async () => {
    if (!canEdit || !selectedCompanyId) return;
    setCopyingWeek(true);
    const nextWeekStart = addDays(weekStart, 7);
    const currentWeekShifts = shifts.filter(s => {
      const sd = new Date(s.date + "T00:00:00");
      return sd >= weekStart && sd <= addDays(weekStart, 6);
    });
    if (currentWeekShifts.length === 0) {
      toast.error("No shifts to copy in the current week");
      setCopyingWeek(false);
      return;
    }
    let created = 0;
    for (const s of currentWeekShifts) {
      const dayOfWeek = new Date(s.date + "T00:00:00").getDay();
      const wsDay = weekStart.getDay();
      const offset = ((dayOfWeek - wsDay) + 7) % 7;
      const targetDate = format(addDays(nextWeekStart, offset), "yyyy-MM-dd");
      const { data: newShift, error } = await supabase.from("scheduled_shifts").insert({
        company_id: selectedCompanyId,
        title: s.title,
        date: targetDate,
        start_time: s.start_time,
        end_time: s.end_time,
        slots: s.slots ?? 1,
        client_id: s.client_id || null,
        location_id: s.location_id || null,
        notes: s.notes || null,
        claimable: s.claimable ?? false,
        status: "draft",
        created_by: user?.id,
        pay_type: s.pay_type || "hourly",
        meeting_point: s.meeting_point || null,
        special_instructions: s.special_instructions || null,
        transportation_required: s.transportation_required ?? false,
        car_capacity: s.car_capacity ?? 4,
        transportation_notes: s.transportation_notes || null,
      } as any).select("id, shift_code").single();
      if (error) continue;
      if (newShift?.shift_code) {
        const originalTitle = s.title.replace(/^#\d{4}\s*/, "");
        const code = String(newShift.shift_code).padStart(4, "0");
        await supabase.from("scheduled_shifts")
          .update({ title: `#${code} ${originalTitle}` } as any)
          .eq("id", newShift.id);
      }
      // Copy assignments
      const shiftAssigns = assignments.filter(a => a.shift_id === s.id);
      if (shiftAssigns.length > 0 && newShift) {
        const newAssigns = shiftAssigns.map(a => ({
          company_id: selectedCompanyId,
          shift_id: newShift.id,
          employee_id: a.employee_id,
          status: "pending",
        }));
        await supabase.from("shift_assignments").insert(newAssigns as any);
      }
      if (newShift) {
        await logShiftActivity("copiar_semana", newShift.id, null, {
          source_shift: s.id, source_date: s.date, target_date: targetDate,
        });
      }
      created++;
    }
    const weekLabel = `${format(nextWeekStart, "MMM d")}–${format(addDays(nextWeekStart, 6), "MMM d")}`;
    toast.success(`${created} shifts copied to ${weekLabel} as drafts`);
    setCopyingWeek(false);
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
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: payrollWeekStart }));
    setCurrentMonth(new Date());
  };

  const handleAddShiftFromCalendar = (targetDate: string) => {
    if (!canEdit) return;
    resetForm();
    setDate(targetDate);
    setCreateOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* ── HEADER: Title + KPI Cards ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-heading tracking-tight text-foreground">Turnos</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Programa y gestiona turnos de trabajo</p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs">
                  <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Más
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/app/today")}>
                  <ScanEye className="h-4 w-4 mr-2" /> Vista de hoy
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/shift-requests")}>
                  <MessageSquare className="h-4 w-4 mr-2" /> Solicitudes
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={() => navigate("/app/import-schedule")}>
                    <Upload className="h-4 w-4 mr-2" /> Importar horarios
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: CalendarDays, value: loading ? "—" : kpiMetrics.todayShifts, label: "Turnos hoy", color: "text-primary", bg: "bg-primary/10" },
            { icon: Users, value: loading ? "—" : kpiMetrics.uniqueWorkers, label: "Trabajadores", color: "text-earning", bg: "bg-earning/10" },
            { icon: UserX, value: loading ? "—" : kpiMetrics.missingWorkers, label: "Faltantes", color: kpiMetrics.missingWorkers > 0 ? "text-destructive" : "text-earning", bg: kpiMetrics.missingWorkers > 0 ? "bg-destructive/10" : "bg-earning/10" },
            { icon: Clock, value: loading ? "—" : kpiMetrics.totalHours, label: "Horas hoy", color: "text-status-completed", bg: "bg-status-completed/10" },
          ].map(({ icon: Icon, value, label, color, bg }) => (
            <div key={label} className="stat-card p-3.5">
              <div className="flex items-center gap-2.5">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", bg)}>
                  <Icon className={cn("h-4 w-4", color)} />
                </div>
                <div>
                  <p className={cn("text-lg font-bold tabular-nums leading-none", kpiMetrics.missingWorkers > 0 && label === "Faltantes" ? "text-destructive" : "text-foreground")}>{value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TOOLBAR: View switcher + Navigation + Actions ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl bg-card border border-border/40 shadow-xs px-4 py-3">
        {/* View tabs */}
        <div className="flex items-center gap-0.5 bg-secondary rounded-xl p-1">
          {([
            { key: "day" as ViewMode, icon: Calendar, label: "Día" },
            { key: "week" as ViewMode, icon: LayoutGrid, label: "Semana" },
            { key: "month" as ViewMode, icon: CalendarDays, label: "Mes" },
            { key: "employee" as ViewMode, icon: Users, label: "Equipo" },
            { key: "client" as ViewMode, icon: Building2, label: "Clientes" },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all duration-200",
                viewMode === key
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={navigateBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            onClick={navigateToday}
            className="text-[13px] font-semibold capitalize min-w-[160px] text-center px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors"
          >
            {navLabel}
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={navigateForward}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border/40 mx-1" />
          <button
            onClick={navigateToday}
            className="text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-xl transition-colors"
          >
            Hoy
          </button>
        </div>
      </div>

      {/* ── FILTERS + BULK ACTIONS ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <ShiftFilters filters={filters} onChange={setFilters} clients={clients} locations={locations} />
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5 shrink-0">
            {viewMode === "week" && (
              <div className="flex items-center bg-secondary rounded-xl p-0.5 mr-1">
                {([
                  { key: "grid" as const, icon: LayoutGrid, label: "Grid" },
                  { key: "job" as const, icon: Building2, label: "Clientes" },
                  { key: "employee" as const, icon: Users, label: "Empleados" },
                ]).map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setWeekViewMode(key)}
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-lg transition-all",
                      weekViewMode === key
                        ? "bg-card shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" /> {label}
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="h-8 text-[11px] px-3 gap-1.5 rounded-xl" onClick={handlePublishAll} disabled={bulkPublishing}>
              {bulkPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Publicar
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[11px] px-3 gap-1.5 rounded-xl text-warning border-warning/30 hover:bg-warning/5" onClick={handleLockAll} disabled={bulkLocking}>
              {bulkLocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Bloquear
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[11px] px-3 gap-1.5 rounded-xl text-earning border-earning/30 hover:bg-earning/5" onClick={handleUnlockAll} disabled={bulkUnlocking}>
              {bulkUnlocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />} Desbloquear
            </Button>
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      <div className="rounded-2xl bg-card border border-border/40 shadow-xs p-4 sm:p-5 min-h-[420px]">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-12 rounded-xl bg-muted/40" />
                  <div className="h-20 rounded-xl bg-muted/30" />
                  <div className="h-16 rounded-xl bg-muted/20" />
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === "day" ? (
          <DayView
            currentDay={currentDay}
            shifts={filteredShifts}
            assignments={assignments}
            locations={locations}
            clients={clients}
            employees={employees}
            onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
            onDropOnShift={handleDropOnShift}
            onDuplicateToDay={handleDuplicateToDay}
            onAddShift={canEdit ? handleAddShiftFromCalendar : undefined}
            onQuickCreate={canEdit ? handleQuickCreate : undefined}
            onOpenFull={canEdit ? handleOpenFullWithPrefill : undefined}
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
          ) : weekViewMode === "employee" ? (
            <WeekByEmployeeView
              weekDays={weekDays}
              shifts={filteredShifts}
              assignments={assignments}
              locations={locations}
              clients={clients}
              employees={employees}
              onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
              onDropOnShift={handleDropOnShift}
              availabilityConfigs={availConfigs}
              availabilityOverrides={availOverrides}
            />
          ) : (
            <WeekView
              weekDays={weekDays}
              shifts={filteredShifts}
              assignments={assignments}
              locations={locations}
              clients={clients}
              employees={employees}
              onShiftClick={(s) => { setSelectedShift(s); setDetailOpen(true); }}
              onDropOnShift={handleDropOnShift}
              onDuplicateToDay={handleDuplicateToDay}
              onAddShift={canEdit ? handleAddShiftFromCalendar : undefined}
              onQuickCreate={canEdit ? handleQuickCreate : undefined}
              onOpenFull={canEdit ? handleOpenFullWithPrefill : undefined}
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
            onQuickCreate={canEdit ? handleQuickCreate : undefined}
            onOpenFull={canEdit ? handleOpenFullWithPrefill : undefined}
            availabilityConfigs={availConfigs}
            availabilityOverrides={availOverrides}
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

      {/* ── FAB: Quick Create Shift ── */}
      {canEdit && (
        <button
          onClick={() => { resetForm(); setCreateOpen(true); }}
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* ── Create Shift Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col rounded-2xl border-border/30 shadow-xl">
          {/* Hero header */}
          <div className="relative px-5 pt-5 pb-4 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 -translate-y-12 translate-x-12 blur-2xl" />
            <div className="relative z-10">
              <h2 className="text-base font-bold font-heading">Nuevo turno</h2>
              <p className="text-[11px] text-muted-foreground">Configura los detalles del turno</p>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">

            {/* Section: Basic info */}
            <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center"><Hash className="h-3 w-3 text-primary" /></div>
                <span className="text-[11px] font-semibold text-foreground">Información básica</span>
              </div>
              <div className="p-4">
                <Label className="text-[11px] text-muted-foreground font-medium">Nombre del turno</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Turno mañana" className="h-9 text-sm mt-1" />
              </div>
            </div>

            {/* Section: Schedule */}
            <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center"><Clock className="h-3 w-3 text-primary" /></div>
                <span className="text-[11px] font-semibold text-foreground">Horario</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Fecha</Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-9 text-sm justify-start font-normal mt-1", !date && "text-muted-foreground")}>
                        <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                        {date ? format(parse(date, "yyyy-MM-dd", new Date()), "EEEE d 'de' MMMM yyyy", { locale: es }) : "Seleccionar"}
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
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[11px] text-muted-foreground font-medium">Entrada</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-sm mt-1" /></div>
                  <div><Label className="text-[11px] text-muted-foreground font-medium">Salida</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-sm mt-1" /></div>
                </div>
              </div>
            </div>

            {/* Section: Assignment */}
            <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="h-3 w-3 text-primary" /></div>
                <span className="text-[11px] font-semibold text-foreground">Asignación</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground font-medium">Cliente</Label>
                    <div className="flex gap-1 mt-1">
                      <Select value={clientId || "none"} onValueChange={handleClientChange}>
                        <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{formatDisplayText(c.name, "name")}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Popover open={showAddClient} onOpenChange={setShowAddClient}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Agregar cliente">
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="end">
                          <p className="text-xs font-medium mb-2">Nuevo cliente</p>
                          <div className="flex gap-1.5">
                            <Input
                              value={newClientName}
                              onChange={e => setNewClientName(e.target.value)}
                              placeholder="Nombre del cliente"
                              className="h-8 text-sm"
                              onKeyDown={e => e.key === "Enter" && handleQuickAddClient()}
                            />
                            <Button size="sm" className="h-8 px-3 text-xs" onClick={handleQuickAddClient} disabled={addingClient || !newClientName.trim()}>
                              {addingClient ? <Loader2 className="h-3 w-3 animate-spin" /> : "Crear"}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground font-medium">Ubicación</Label>
                    <div className="flex gap-1 mt-1">
                      <Select value={locationId || "none"} onValueChange={v => handleLocationChange(v)}>
                        <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Popover open={showAddLocation} onOpenChange={setShowAddLocation}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Agregar ubicación">
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="end">
                          <p className="text-xs font-medium mb-2">Nueva ubicación</p>
                          <div className="space-y-1.5">
                            <Input value={newLocationName} onChange={e => setNewLocationName(e.target.value)} placeholder="Nombre" className="h-8 text-sm" />
                            <Input value={newLocationAddress} onChange={e => setNewLocationAddress(e.target.value)} placeholder="Dirección (opcional)" className="h-8 text-sm" onKeyDown={e => e.key === "Enter" && handleQuickAddLocation()} />
                            <Button size="sm" className="h-8 w-full text-xs" onClick={handleQuickAddLocation} disabled={addingLocation || !newLocationName.trim()}>
                              {addingLocation ? <Loader2 className="h-3 w-3 animate-spin" /> : "Crear"}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div><Label className="text-[11px] text-muted-foreground font-medium">Plazas disponibles</Label><Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" className="h-9 text-sm mt-1" /></div>
                  <div className="flex items-center gap-2 h-9">
                    <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="claimable" />
                    <Label htmlFor="claimable" className="text-xs font-normal cursor-pointer">Permitir reclamo</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Payment */}
            <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center"><CreditCard className="h-3 w-3 text-primary" /></div>
                <span className="text-[11px] font-semibold text-foreground">Tipo de pago</span>
              </div>
              <div className="p-4 space-y-3">
                <Select value={payType} onValueChange={v => setPayType(v as "hourly" | "daily")}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">⏱ Por hora (reloj)</SelectItem>
                    <SelectItem value="daily">📅 Por día (tarifa fija)</SelectItem>
                  </SelectContent>
                </Select>
                {payType === "daily" && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">Tarifa diaria automática al consolidar.</p>
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Jornada</Label>
                      <Select value={dayType} onValueChange={v => setDayType(v as "full_day" | "half_day")}>
                        <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_day">☀️ Día completo ($200)</SelectItem>
                          <SelectItem value="half_day">🌤️ Medio día ($125)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Transportation */}
            <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center"><Car className="h-3 w-3 text-primary" /></div>
                <span className="text-[11px] font-semibold text-foreground">Transporte</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox checked={transportRequired} onCheckedChange={c => setTransportRequired(!!c)} id="transport" />
                  <Label htmlFor="transport" className="text-xs font-normal cursor-pointer">¿Este turno requiere transporte?</Label>
                </div>
                {transportRequired && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] text-muted-foreground font-medium">Capacidad por vehículo</Label>
                        <Input type="number" min="1" value={carCapacity} onChange={e => setCarCapacity(e.target.value)} className="h-9 text-sm mt-1" />
                      </div>
                      <div className="flex flex-col justify-end">
                        <p className="text-[11px] text-muted-foreground font-medium mb-1">Vehículos necesarios</p>
                        <div className="h-9 flex items-center px-3 rounded-md border border-border/30 bg-muted/20 text-sm font-semibold">
                          {Math.ceil((parseInt(slots) || 1) / (parseInt(carCapacity) || 4))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Conductor asignado</Label>
                      <Select value={driverEmployeeId || "none"} onValueChange={v => setDriverEmployeeId(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Notas de transporte</Label>
                      <Input value={transportNotes} onChange={e => setTransportNotes(e.target.value)} placeholder="Ej: Recoger en oficina a las 7:30 AM" className="h-9 text-sm mt-1" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Section: Admin & Details */}
            <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="h-3 w-3 text-primary" /></div>
                <span className="text-[11px] font-semibold text-foreground">Detalles adicionales</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Admin del turno</Label>
                  <Select value={shiftAdminId || "none"} onValueChange={v => setShiftAdminId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {selectedEmployees.length > 0 && employees.filter(e => selectedEmployees.includes(e.id)).map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                      ))}
                      {employees.filter(e => !selectedEmployees.includes(e.id)).slice(0, 20).map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Puede confirmar asistencia del equipo.</p>
                </div>
                <div><Label className="text-[11px] text-muted-foreground font-medium">Notas adicionales</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." className="text-sm resize-none mt-1" /></div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Dirección / Punto de encuentro</Label>
                  <Input value={meetingPoint} onChange={e => setMeetingPoint(e.target.value)} placeholder="Se autocompleta al seleccionar cliente..." className="h-9 text-sm mt-1" />
                  {meetingPoint && clientId && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">Autocompletada desde la ubicación del cliente. Puedes editarla.</p>
                  )}
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground font-medium">Instrucciones adicionales</Label>
                  <Textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} rows={2} placeholder="Ej: Llevar uniforme negro, llegar 15 min antes..." className="text-sm resize-none mt-1" />
                </div>
              </div>
            </div>

            {/* Section: Repeat */}
            <ShiftRepeatSection
              shiftDate={date}
              config={repeatConfig}
              onChange={setRepeatConfig}
            />

            {/* Section: Employees */}
            <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-3 w-3 text-primary" /></div>
                <span className="text-[11px] font-semibold text-foreground">Asignar empleados</span>
              </div>
              <div className="p-4">
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
                  availabilityConfigs={availConfigs}
                  availabilityOverrides={availOverrides}
                  availabilityBlockMode="warning"
                  onAddNewEmployee={() => setQuickAddOpen(true)}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border/30 bg-muted/10">
            <Button onClick={() => setConfirmOpen(true)} disabled={saving || !date} className="w-full h-10 text-sm gap-2 rounded-xl font-semibold">
              Revisar y crear turno
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                  {transportRequired && <p><span className="font-medium">Transporte:</span> Requerido • {Math.ceil((parseInt(slots) || 1) / (parseInt(carCapacity) || 4))} vehículo(s) • Conductor: {driverEmployeeId ? employees.find(e => e.id === driverEmployeeId)?.first_name || "Asignado" : "⚠️ Sin asignar"}</p>}
                  <p><span className="font-medium">Admin turno:</span> {shiftAdminId ? employees.find(e => e.id === shiftAdminId)?.first_name || "Asignado" : "⚠️ Sin asignar"}</p>
                  {claimable && <p><span className="font-medium">Reclamable:</span> Sí</p>}
                  {notes && <p><span className="font-medium">Notas:</span> {notes}</p>}
                </div>
                {(() => {
                  const warnings: string[] = [];
                  if (startTime >= endTime) warnings.push("La hora de entrada es igual o posterior a la de salida.");
                  if (selectedEmployees.length === 0) warnings.push("No se asignaron empleados.");
                  if (!clientId) warnings.push("No se asignó un cliente.");
                  if (!locationId) warnings.push("No se asignó una ubicación.");
                  if (transportRequired && !driverEmployeeId) warnings.push("🚗 Transporte requerido pero no se asignó un conductor.");
                  if (!shiftAdminId) warnings.push("🛡️ No se asignó un admin/líder del turno.");
                  const slotsNum = parseInt(slots) || 1;
                  if (selectedEmployees.length > slotsNum) warnings.push(`Se asignaron ${selectedEmployees.length} empleados pero solo hay ${slotsNum} plaza(s).`);
                  if (date && new Date(date + "T00:00:00") < new Date(new Date().toDateString())) warnings.push("La fecha es anterior a hoy.");
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
        onDuplicate={(s) => {
          handleDuplicateToDay(s, s.date);
        }}
        onDelete={async (s) => {
          const { error } = await supabase.from("scheduled_shifts")
            .update({ deleted_at: new Date().toISOString() } as any)
            .eq("id", s.id);
          if (error) { toast.error(error.message); return; }
          await logShiftActivity("eliminar_turno", s.id, { title: s.title, date: s.date }, null);
          toast.success("Turno eliminado");
          setDetailOpen(false);
          setSelectedShift(null);
          loadData();
        }}
        availabilityConfigs={availConfigs}
        availabilityOverrides={availOverrides}
        onAddNewEmployee={() => setQuickAddOpen(true)}
      />

      <ShiftEditDialog
        shift={editShift}
        open={editOpen}
        onOpenChange={setEditOpen}
        clients={clients}
        locations={locations}
        employees={employees}
        assignments={assignments}
        onSave={handleEditShift}
      />

      <QuickAddInviteWizard
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onEmployeeCreated={(newEmp) => {
          loadData();
          // Auto-select the new employee in the create form if it's open
          if (createOpen && newEmp?.id) {
            setSelectedEmployees(prev => [...prev, newEmp.id]);
          }
        }}
      />
    </div>
  );
}
