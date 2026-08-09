import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePageView } from "@/hooks/useAuditLog";
// AuditPanel available via dropdown in future iteration
import { supabase } from "@/integrations/supabase/client";
import { versionedAssignmentTransition } from "@/lib/data/assignment-write";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useEmployeeAvailability } from "@/hooks/useEmployeeAvailability";
import { useEmployeeRoster } from "@/hooks/useEmployeeRoster";
import { usePayrollConfig } from "@/hooks/usePayrollConfig";
import { useShiftsConfig } from "@/hooks/useShiftsConfig";
import { ModuleSettingsSheet } from "@/components/settings/ModuleSettingsSheet";
import type { SettingsSection } from "@/components/settings/ModuleSettingsSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
// Tabs removed — using custom view switcher
import { toast } from "sonner";
import { notifyActionRequired, notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { versionedWrite, rowVersion } from "@/lib/data/versioned-write";
import { VersionConflictDialog, type VersionConflictInfo } from "@/components/data-integrity/VersionConflictDialog";
import { SHIFT_FIELD_LABELS } from "@/lib/shifts/field-labels";
import { useQueryClient } from "@tanstack/react-query";
import { reconcileServiceAfterSave, subscribeToServiceChanges, readServiceRow, type ServiceRow } from "@/lib/shifts/service-state";


import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Plus, Loader2, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Users, Building2, Calendar, CalendarIcon, AlertTriangle, CheckCircle2, Clock, Lock, Unlock, Send, Upload, MoreHorizontal, ScanEye, MessageSquare, Hash, CreditCard, FileText, Car, UserX, Map, MapPin, Copy, Settings2, CalendarRange, Download } from "lucide-react";
import { formatDisplayText } from "@/lib/format-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { OpsKpiStrip, type OpsKpiItem } from "@/components/operations/OpsKpiStrip";
import { OpsToolbar } from "@/components/operations/OpsToolbar";
import { format, startOfWeek, addDays, addMonths, startOfMonth, endOfMonth, subDays, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileShiftsView from "./MobileShiftsView";

import { DayView } from "@/components/shifts/DayView";
import { WeekView } from "@/components/shifts/WeekView";
import { WeekByJobView } from "@/components/shifts/WeekByJobView";
import { WeekByEmployeeView } from "@/components/shifts/WeekByEmployeeView";
import { MonthView } from "@/components/shifts/MonthView";
import { EmployeeView } from "@/components/shifts/EmployeeView";
import { ClientView } from "@/components/shifts/ClientView";
import { ShiftDetailDialog } from "@/components/shifts/ShiftDetailDialog";
import { ShiftEditDialog } from "@/components/shifts/ShiftEditDialog";
import { DuplicateShiftDialog } from "@/components/shifts/DuplicateShiftDialog";
import { ShiftFilters, EMPTY_FILTERS, type ShiftFilterState } from "@/components/shifts/ShiftFilters";
import { matchesShiftQuery } from "@/lib/shifts/shift-ref";
import { CrossCompanyShiftHint } from "@/components/shifts/CrossCompanyShiftHint";
import { WeeklySummaryBar } from "@/components/shifts/WeeklySummaryBar";
import { EmployeeCombobox } from "@/components/shifts/EmployeeCombobox";
import { ShiftRepeatSection, DEFAULT_REPEAT, computeRepeatDates, type RepeatConfig } from "@/components/shifts/ShiftRepeatSection";
import { QuickCreatePopover } from "@/components/shifts/QuickCreatePopover";
import { QuickAddInviteWizard } from "@/components/employee/QuickAddInviteWizard";
import EmergencyWorkerDialog, { type EmergencyWorkerCreated } from "@/components/employee/EmergencyWorkerDialog";
import { ShiftFormFields, useShiftFormSignals, type ShiftFormState } from "@/components/shifts/ShiftFormFields";
import { ShiftFormShell } from "@/components/shifts/ShiftFormShell";
import { ShiftDraftStatusPill } from "@/components/shifts/ShiftDraftBanner";
import type { DraftStatus } from "@/hooks/useShiftDraftAutosave";
import { useCreateShiftSession } from "@/hooks/useCreateShiftSession";
import { CreateSessionRecoveryBanner } from "@/components/shifts/CreateSessionRecoveryBanner";
import { ShiftSummaryPanel } from "@/components/shifts/form/ShiftSummaryPanel";
import { WorkspaceSummary } from "@/components/shifts/workspace/WorkspaceSummary";
import { buildPrePublishReview } from "@/lib/shifts/build-pre-publish-review";
import {
  getServicePublishReadiness,
  focusServiceSection,
  type ServicePublishReadiness,
} from "@/lib/shifts/service-publish-readiness";
import { getShiftLocationStatus } from "@/lib/shifts/location-status";
import { PrePublishDialog } from "@/components/shifts/workspace/PrePublishDialog";
import { ExportConnecteamBulkDialog } from "@/components/shifts/integrations/ExportConnecteamBulkDialog";
import type { Shift, Assignment, SelectOption, Employee, ViewMode } from "@/components/shifts/types";
import { formatShiftCode } from "@/components/shifts/types";
import { isDraftShift, isPublishedShift } from "@/lib/shifts/shift-guards";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

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

// WR6 — Work Route line for worker-facing notification bodies.
// Presentational only: never used for payroll/scheduled-hours math.
// Mirrors the canonical Work Route standard (Entrada protagonist, Termina aprox. secondary).
const workRouteLine = (
  start?: string | null,
  end?: string | null,
  meetingPoint?: string | null,
) => {
  const entrada = start ? start.slice(0, 5) : "—";
  const termina = end ? end.slice(0, 5) : "—";
  const meeting = meetingPoint && meetingPoint.trim() ? ` · Encuentro ${meetingPoint.trim()}` : "";
  return `Entrada ${entrada} · Termina aprox. ${termina}${meeting}`;
};


// Local create-shift dialog component. Wraps the new ShiftFormShell with the
// summary panel computed from useShiftFormSignals. Defined inline so we don't
// have to extract the page's create-state into a new file.
function CreateShiftDialogInline(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  formState: ShiftFormState;
  onPatch: (patch: Partial<ShiftFormState>) => void;
  clients: SelectOption[];
  locations: any[];
  employees: Employee[];
  shifts: Shift[];
  assignments: Assignment[];
  availabilityConfigs?: any[];
  availabilityOverrides?: any[];
  allowClaims: boolean;
  selectedCompanyId: string | null;
  saving: boolean;
  draftSaving: boolean;
  isDirty: boolean;
  repeatConfig: RepeatConfig;
  onRepeatChange: (c: RepeatConfig) => void;
  onRequestSave: () => void;
  onSaveDraft: () => void;
  onAddNewEmployee: () => void;
  onAddEmergencyWorker?: () => void;
  onClientCreated: (id: string, name: string) => void;
  onLocationCreated: (id: string, name: string, address: string) => void;
  draftStatus?: DraftStatus;
  draftBanner?: React.ReactNode;
  onDiscard?: () => void;
  /** P0.4 — cerrar conservando la sesión local de creación (sin tocar la BD). */
  onKeepForLater?: () => void;
}) {
  const v = props.formState;
  const signals = useShiftFormSignals({
    v,
    mode: "create",
    shift: null,
    employees: props.employees,
    shifts: props.shifts,
    assignments: props.assignments,
    clients: props.clients,
    locations: props.locations,
    showEmployeePicker: true,
  });
  const payTypeLabel =
    v.payType === "daily"
      ? `por día · ${v.dayType === "full_day" ? "día completo" : "medio día"}`
      : "por hora";

  const summary = (
    <WorkspaceSummary
      mode="create"
      title={v.title}
      date={v.date}
      startTime={v.startTime}
      endTime={v.endTime}
      meetingTime={v.meetingTime}
      clientId={v.clientId}
      locationId={v.locationId}
      jobSiteLocationId={v.jobSiteLocationId}
      jobSiteAddress={v.jobSiteAddress}
      meetingPoint={v.meetingPoint}
      meetingPointLocationId={v.meetingPointLocationId}
      transportRequired={v.transportRequired}
      claimable={v.claimable}
      clientName={signals.clientName}
      jobSiteLabel={signals.jobSiteLabel}
      meetingPointLabel={signals.meetingPointLabel}
      slotsNum={signals.slotsNum}
      assignedCount={signals.assignedCount}
      ridesNeeded={signals.ridesNeeded}
      driversInTeam={signals.driversInTeam}
      payTypeLabel={payTypeLabel}
      dateMissing={!v.date}
      adminMissing={signals.adminMissing}
      adminInvalid={signals.adminInvalid}
      noLocation={signals.noLocation}
      noTeam={signals.noTeam}
      driverMissing={signals.driverMissing}
      driversShortage={signals.driversShortage}
      capacityShortage={signals.capacityShortage}
      hasConflicts={signals.hasConflicts}
      conflictNames={signals.conflictNames}
      payOverrideActive={signals.payOverrideActive}
      publicationStatus={null}
      publishBlockers={signals.readiness.blockers}
    />
  );

  const publishReview = buildPrePublishReview({
    manualTitle: v.title,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    meetingTime: v.meetingTime,
    clientId: v.clientId,
    locationId: v.locationId,
    jobSiteLocationId: v.jobSiteLocationId,
    jobSiteAddress: v.jobSiteAddress,
    meetingPoint: v.meetingPoint,
    meetingPointLocationId: v.meetingPointLocationId,
    transportRequired: v.transportRequired,
    claimable: v.claimable,
    assignedCount: signals.assignedCount,
    slotsNum: signals.slotsNum,
    clientName: signals.clientName,
    jobSiteLabel: signals.jobSiteLabel,
    meetingPointLabel: signals.meetingPointLabel,
    blockers: signals.readiness.blockers,
  });

  return (
    <ShiftFormShell
      open={props.open}
      onOpenChange={props.onOpenChange}
      mode="create"
      clientName={signals.clientName}
      date={v.date}
      startTime={v.startTime}
      endTime={v.endTime}
      saving={props.saving}
      draftSaving={props.draftSaving}
      isDirty={props.isDirty}
      onDiscard={props.onDiscard}
      onKeepForLater={props.onKeepForLater}
      saveDisabled={!v.date}
      saveLabel="Publicar turno"
      draftLabel="Guardar borrador"
      onSave={props.onRequestSave}
      onSaveDraft={props.onSaveDraft}
      summary={summary}
      publishReview={publishReview}
    >
      {props.draftBanner}
      {props.draftStatus && (
        <div className="flex justify-end">
          <ShiftDraftStatusPill status={props.draftStatus} />
        </div>
      )}
      <ShiftFormFields
        layout="workspace"
        mode="create"
        companyId={props.selectedCompanyId}
        value={v}
        onChange={props.onPatch}
        clients={props.clients}
        locations={props.locations}
        employees={props.employees}
        shifts={props.shifts}
        assignments={props.assignments}
        availabilityConfigs={props.availabilityConfigs}
        availabilityOverrides={props.availabilityOverrides}
        allowClaims={props.allowClaims}
        showEmployeePicker
        renderInlineSummary={false}
        onAddNewEmployee={props.onAddNewEmployee}
        onAddEmergencyWorker={props.onAddEmergencyWorker}
        onQuickAddClient={async (name) => {
          if (!props.selectedCompanyId) return;
          const { data, error } = await supabase.from("clients").insert({
            company_id: props.selectedCompanyId, name,
          } as any).select("id").single();
          if (error) { toast.error(error.message); return; }
          if (data) {
            props.onClientCreated(data.id, name);
            toast.success(`Cliente "${name}" creado`);
          }
        }}
        onQuickAddLocation={async (name, address) => {
          if (!props.selectedCompanyId) return;
          const { data, error } = await supabase.from("locations").insert({
            company_id: props.selectedCompanyId, name,
            address: address || null,
          } as any).select("id").single();
          if (error) { toast.error(error.message); return; }
          if (data) {
            props.onLocationCreated(data.id, name, address);
            toast.success(`Ubicación "${name}" creada`);
          }
        }}
      />
      <ShiftRepeatSection
        shiftDate={v.date}
        config={props.repeatConfig}
        onChange={props.onRepeatChange}
      />
    </ShiftFormShell>
  );
}

/**
 * Viewport wrapper. Only hook is useIsMobile so React hook order is stable
 * across viewport flips. Each child component owns its own hook universe.
 * Desktop is the original Shifts component, untouched.
 */
export default function ShiftsPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileShiftsView /> : <DesktopShifts />;
}

function DesktopShifts() {
  usePageView("Programación");
  const navigate = useNavigate();
  const { role, hasModuleAccess, user } = useAuth();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { config: payrollConfig } = usePayrollConfig();
  const { config: shiftsConfig, updateConfig: updateShiftsConfig, loading: shiftsConfigLoading } = useShiftsConfig();
  const payrollWeekStart = payrollConfig.payroll_week_start_day as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const canEdit = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const shiftSettingsSections: SettingsSection[] = [
    {
      title: "Valores por defecto",
      description: "Se prellenan al crear nuevos turnos",
      fields: [
        { key: "default_start_time", label: "Hora de inicio por defecto", type: "time" },
        { key: "default_end_time", label: "Hora de fin por defecto", type: "time" },
        { key: "default_slots", label: "Cupos por defecto", type: "number", min: 1, max: 50 },
      ],
    },
    {
      title: "Reglas de validación",
      description: "Requisitos antes de crear o publicar un turno",
      fields: [
        { key: "require_client", label: "Cliente obligatorio", type: "toggle", description: "Bloquea la creación de turnos sin cliente asignado" },
        { key: "require_location", label: "Ubicación obligatoria", type: "toggle", description: "Bloquea la creación de turnos sin ubicación asignada" },
        { key: "max_shift_hours", label: "Duración máxima del turno", type: "number", min: 1, max: 24, suffix: "horas" },
        { key: "require_shift_admin", label: "Líder de turno obligatorio", type: "toggle", description: "Exige asignar un admin de turno antes de publicar" },
      ],
    },
    {
      title: "Comportamiento",
      description: "Cómo se comportan los turnos al crearlos y programarlos",
      fields: [
        { key: "auto_publish", label: "Publicar automáticamente al crear", type: "toggle", description: "Salta el estado borrador — publica al instante" },
        { key: "allow_claims", label: "Permitir reclamos de workers", type: "toggle", description: "Habilita turnos reclamables por los workers" },
        { key: "copy_week_assignments", label: "Copiar asignaciones al copiar semana", type: "toggle", description: "Incluye asignaciones de workers al copiar una semana" },
      ],
    },
  ];

  const [searchParams, setSearchParams] = useSearchParams();
  const isInitialized = useRef(false);

  // Parse URL params on mount
  // Sprint 3: also honor `?when=today|tomorrow` from /app/ops deep-links.
  const initialDate = useMemo(() => {
    const when = searchParams.get("when");
    if (when === "today") return new Date();
    if (when === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    }
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
    // Sprint 3: deep-links from Ops Cockpit imply a single-day focus.
    if (searchParams.get("when") === "today" || searchParams.get("when") === "tomorrow") {
      return "day" as ViewMode;
    }
    return "week" as ViewMode;
  }, []);

  // Sprint 3: Ops-driven filter (needs-staffing | incomplete). Kept in local
  // state so the chip persists even after the URL sync drops the query param.
  const initialOpsFilter = useMemo<null | "needs-staffing" | "incomplete">(() => {
    const f = searchParams.get("filter");
    if (f === "needs-staffing" || f === "incomplete") return f;
    return null;
  }, []);
  const initialWhenLabel = useMemo<null | "today" | "tomorrow">(() => {
    const w = searchParams.get("when");
    if (w === "today" || w === "tomorrow") return w;
    return null;
  }, []);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  // `loading` reflects ONLY the very first load. Background refetches use `isRefetching`
  // so the previous data stays visible — no skeleton flash, no layout shift.
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [clients, setClients] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<(SelectOption & { address?: string; client_id?: string | null })[]>([]);
  // Employees roster — single source of truth, paginated, never truncated at 1k.
  // Hidden-by-status workers (incomplete profile, pending onboarding, no portal) are NOT excluded here.
  const employeeRoster = useEmployeeRoster(selectedCompanyId, "shifts");
  const employees = employeeRoster.employees;
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkExportConnecteamOpen, setBulkExportConnecteamOpen] = useState(false);

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
  const [filters, setFilters] = useState<ShiftFilterState>(() => ({
    ...EMPTY_FILTERS,
    // Sprint 3: initial hydration from ?filter=needs-staffing.
    needsStaffingOnly: initialOpsFilter === "needs-staffing" ? true : EMPTY_FILTERS.needsStaffingOnly,
  }));
  // Sprint 3: incomplete filter is not part of ShiftFilterState; kept as a
  // sibling local toggle so we don't have to touch the shared schema.
  const [incompleteOnly, setIncompleteOnly] = useState<boolean>(initialOpsFilter === "incomplete");
  // Chip label that persists after URL sync strips the ops params.
  const [activeOpsChip, setActiveOpsChip] = useState<string | null>(() => {
    if (initialWhenLabel === "today") return `${ADMIN_LEX.EntityPlural} de hoy`;
    if (initialWhenLabel === "tomorrow") return `${ADMIN_LEX.EntityPlural} de mañana`;
    if (initialOpsFilter === "needs-staffing") return "Necesitan staff";
    if (initialOpsFilter === "incomplete") return `${ADMIN_LEX.EntityPlural} incompletos`;
    return null;
  });
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
  const queryClient = useQueryClient();
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInitialTab, setDetailInitialTab] = useState<string | undefined>(undefined);

  // VWC — conflicto de versión al editar un servicio (UI única del ecosistema)
  const [serviceConflict, setServiceConflict] = useState<{
    info: VersionConflictInfo;
    shiftId: string;
    updates: Partial<Shift>;
    oldShift: Shift;
  } | null>(null);


  // Edit dialog
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateShift, setDuplicateShift] = useState<Shift | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateSessionKey, setDuplicateSessionKey] = useState(0);

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
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [payType, setPayType] = useState<"hourly" | "daily">("hourly");
  const [dayType, setDayType] = useState<"full_day" | "half_day">("full_day");
  // Phase 2 #1: explicit per-shift pay override toggle. CREATE defaults to OFF.
  const [payOverride, setPayOverride] = useState<boolean>(false);
  const [shiftAdminId, setShiftAdminId] = useState("");
  const [transportRequired, setTransportRequired] = useState(false);
  const [carCapacity, setCarCapacity] = useState("5");
  const [transportNotes, setTransportNotes] = useState("");
  const [driverEmployeeId, setDriverEmployeeId] = useState("");
  // P0.3 — varios conductores por turno. El campo legado guarda el primero.
  const [driverIds, setDriverIds] = useState<string[]>([]);
  const [clockMethod, setClockMethod] = useState<"mobile" | "kiosk" | "both">("both");
  const [attendanceMode, setAttendanceMode] = useState<"clock" | "arrival" | "hybrid">("clock");
  const [meetingTime, setMeetingTime] = useState<string>("");
  const [meetingPointLocationId, setMeetingPointLocationId] = useState<string | null>(null);
  const [jobSiteLocationId, setJobSiteLocationId] = useState<string | null>(null);
  const [jobSiteAddress, setJobSiteAddress] = useState<string>("");
  const [repeatConfig, setRepeatConfig] = useState<RepeatConfig>(DEFAULT_REPEAT);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Phase 2C-A — Emergency Worker create flow (admin-only). Owned here so
  // roster refresh + pre-select can be applied for both entry points
  // (CreateShiftDialogInline and ShiftDetailDialog).
  const [emergencyState, setEmergencyState] = useState<{
    open: boolean;
    shiftId: string | null;   // null when creating from an unpublished shift
    shiftLabel: string;
    target: "create" | "detail"; // where the pre-select should land
  }>({ open: false, shiftId: null, shiftLabel: "", target: "create" });
  const [emergencyPreselectId, setEmergencyPreselectId] = useState<string | null>(null);
  const [copyingWeek, setCopyingWeek] = useState(false);

  // Filtered shifts
  const filteredShifts = useMemo(() => {
    let result = shifts;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) || matchesShiftQuery(s, filters.search),
      );
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
      result = result.filter(s => isPublishedShift(s) && s.status !== "locked");
    } else if (filters.publishStatus === "draft") {
      result = result.filter(s => isDraftShift(s));
    } else if (filters.publishStatus === "locked") {
      result = result.filter(s => s.status === "locked");
    }
    if (filters.claimableOnly) {
      result = result.filter(s => s.claimable);
    }
    if (filters.needsStaffingOnly) {
      // Phase 1 QW#3 — visual filter only, never mutates data.
      result = result.filter(s => {
        const slots = (s as any).slots ?? 0;
        const assigned = assignments.filter(
          a => a.shift_id === s.id && a.status !== "rejected"
        ).length;
        return slots > 0 && assigned < slots;
      });
    }
    if (incompleteOnly) {
      // Sprint 3: presentational filter — flags shifts missing site, meeting
      // point, or client. Uses fields already loaded; no new queries. Rate is
      // intentionally excluded (lives in compensation_profiles).
      result = result.filter(s => {
        const missingSite = !s.location_id;
        const missingMeeting =
          !(s as any).meeting_point_location_id &&
          !((s as any).meeting_point ?? "").trim();
        const missingClient = !s.client_id;
        return missingSite || missingMeeting || missingClient;
      });
    }
    return result;
  }, [shifts, assignments, filters, incompleteOnly]);

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

    // Operator-first additions (UI-only, read from already-loaded data)
    const draftsCount = filteredShifts.filter(s => isDraftShift(s)).length;
    const publishedCount = filteredShifts.filter(s => isPublishedShift(s) && s.status !== "locked").length;
    const needsStaffCount = filteredShifts.filter(s => {
      const slots = (s as any).slots ?? 0;
      const assigned = assignments.filter(a => a.shift_id === s.id && a.status !== "rejected").length;
      return slots > 0 && assigned < slots;
    }).length;
    const missingLocationCount = filteredShifts.filter(s =>
      !s.location_id && !(s as any).meeting_point_location_id && !((s as any).meeting_point ?? "").trim()
    ).length;

    return {
      todayShifts: todayShifts.length,
      uniqueWorkers,
      missingWorkers,
      totalHours,
      draftsCount,
      publishedCount,
      needsStaffCount,
      missingLocationCount,
    };
  }, [filteredShifts, assignments]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Date range derived from active view — memoized so it only changes when the
  // *active* date for the current view actually changes. Switching from week→month
  // does NOT invalidate the week range etc.
  const dateRange = useMemo(() => {
    if (viewMode === "day") {
      const d = format(currentDay, "yyyy-MM-dd");
      return { from: d, to: d };
    }
    if (viewMode === "week") {
      return {
        from: format(weekStart, "yyyy-MM-dd"),
        to: format(addDays(weekStart, 6), "yyyy-MM-dd"),
      };
    }
    return {
      from: format(startOfMonth(currentMonth), "yyyy-MM-dd"),
      to: format(endOfMonth(currentMonth), "yyyy-MM-dd"),
    };
  }, [viewMode, currentDay, weekStart, currentMonth]);

  // Dictionaries (clients/locations) — only refetched when company changes.
  // Employees roster is now handled by useEmployeeRoster (paginated, React-Query cached, scoped by companyId).
  const refreshDictionaries = useCallback(async () => {
    if (!selectedCompanyId) return;
    const [clientsRes, locsRes] = await Promise.all([
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      supabase.from("locations").select("id, name, address, client_id, default_pay_type, default_clock_method, require_car, default_instructions").eq("company_id", selectedCompanyId).is("deleted_at", null),
    ]);
    setClients((clientsRes.data ?? []) as SelectOption[]);
    setLocations((locsRes.data ?? []) as any[]);
  }, [selectedCompanyId]);

  // 2) Shifts + assignments — refetched when company OR date range changes.
  // Background refetches keep prior data visible (no skeleton flash).
  const refreshShifts = useCallback(async () => {
    if (!selectedCompanyId) return;
    if (hasLoadedOnce.current) {
      setIsRefetching(true);
    } else {
      setLoading(true);
    }
    const shiftsRes = await supabase.from("scheduled_shifts").select("*, shift_code").eq("company_id", selectedCompanyId)
      .gte("date", dateRange.from).lte("date", dateRange.to)
      .is("deleted_at", null).order("start_time");
    const shiftIds = (shiftsRes.data ?? []).map(s => s.id);

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
    setShifts((shiftsRes.data ?? []) as Shift[]);
    setAssignments(allAssignments as Assignment[]);
    hasLoadedOnce.current = true;
    setLoading(false);
    setIsRefetching(false);
  }, [selectedCompanyId, dateRange.from, dateRange.to]);

  // Used by mutations — only the shifts/assignments slice needs to refresh.
  const loadData = useCallback(async () => {
    await refreshShifts();
  }, [refreshShifts]);

  useEffect(() => { refreshDictionaries(); }, [refreshDictionaries]);
  useEffect(() => { refreshShifts(); }, [refreshShifts]);

  // Deep-link: open shift detail (and specific tab) from /app/shifts?shiftId=...&tab=attendance
  // Sprint 14: also accept `?shift=<id>` as an alias, matching Root-Cause Explorer CTAs.
  // If the id isn't in the currently loaded range, surface a soft "not found"
  // toast and clear the param so the user isn't stuck in a broken state.
  useEffect(() => {
    const sid = searchParams.get("shiftId") ?? searchParams.get("shift");
    if (!sid) return;
    if (loading || shifts.length === 0) return;
    const found = shifts.find(s => s.id === sid);
    const clearParams = () => {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete("shiftId");
        p.delete("shift");
        p.delete("tab");
        return p;
      }, { replace: true });
    };
    if (!found) {
      toast.warning("Turno no encontrado en el rango cargado", {
        description: "Ajusta la fecha o el rango de la vista.",
      });
      clearParams();
      return;
    }
    const tabParam = searchParams.get("tab") || undefined;
    setSelectedShift(found);
    setDetailInitialTab(tabParam);
    setDetailOpen(true);
    toast.info("Abierto desde revisión", {
      description: "Solo navegación: no modifica payroll.",
    });
    clearParams();
  }, [shifts, searchParams, setSearchParams, loading]);



  // P0 SINGLE SERVICE STATE — el turno abierto nunca se queda congelado:
  // cuando la lista se refresca, el snapshot seleccionado se re-sincroniza.
  useEffect(() => {
    setSelectedShift(prev => {
      if (!prev) return prev;
      const fresh = shifts.find(s => s.id === prev.id);
      return fresh ? { ...prev, ...fresh } : prev;
    });
  }, [shifts]);

  // Cualquier reconciliación de servicio (desde otra superficie) refresca la lista
  // sin desmontar la vista ni perder scroll.
  useEffect(() => {
    return subscribeToServiceChanges(({ companyId }) => {
      if (companyId === selectedCompanyId) refreshShifts();
    });
  }, [selectedCompanyId, refreshShifts]);

  // Stable click handler — prevents child views from re-rendering on every parent render.
  const handleShiftClick = useCallback((s: Shift) => {
    setSelectedShift(s);
    setDetailOpen(true);
  }, []);

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
    setTitle(""); setDate("");
    setStartTime(shiftsConfig.default_start_time);
    setEndTime(shiftsConfig.default_end_time);
    setSlots(String(shiftsConfig.default_slots));
    setClientId(""); setLocationId(""); setNotes("");
    setClaimable(shiftsConfig.allow_claims ? false : false); setSelectedEmployees([]);
    setMeetingPoint(""); setSpecialInstructions(""); setPayType("hourly");
    setDayType("full_day"); setPayOverride(false); setShiftAdminId("");
    setTransportRequired(false); setCarCapacity("5"); setTransportNotes(""); setDriverEmployeeId(""); setDriverIds([]);
    setClockMethod("both");
    setAttendanceMode("clock"); setMeetingTime("");
    setMeetingPointLocationId(null); setJobSiteLocationId(null); setJobSiteAddress("");
    setNewLocationName(""); setNewLocationAddress(""); setShowAddLocation(false);
    setRepeatConfig(DEFAULT_REPEAT);
  };

  // ── S3 — Local autosave for the create-shift form (NO DB writes) ──
  // Snapshot mirrors the formState built at <CreateShiftDialogInline /> usage.
  const createFormSnapshot = useMemo(() => ({
    title, date, startTime, endTime, slots,
    clientId, locationId, notes, claimable,
    meetingPoint, specialInstructions,
    payType, dayType, payOverride, shiftAdminId, clockMethod,
    attendanceMode, meetingTime,
    transportRequired, carCapacity, transportNotes, driverEmployeeId, driverIds,
    selectedEmployees,
    meetingPointLocationId, jobSiteLocationId, jobSiteAddress,
  }), [
    title, date, startTime, endTime, slots,
    clientId, locationId, notes, claimable,
    meetingPoint, specialInstructions,
    payType, dayType, payOverride, shiftAdminId, clockMethod,
    attendanceMode, meetingTime,
    transportRequired, carCapacity, transportNotes, driverEmployeeId, driverIds,
    selectedEmployees,
    meetingPointLocationId, jobSiteLocationId, jobSiteAddress,
  ]);

  /**
   * P0.4 — CREATE SHIFT SESSION (desktop)
   * "No estamos implementando persistencia. Estamos protegiendo el trabajo del
   * usuario." Mismo motor que el wizard móvil: sesión local aislada por
   * usuario + empresa. Ningún turno existe hasta pulsar "Crear turno".
   */
  const createSession = useCreateShiftSession<typeof createFormSnapshot>({
    enabled: createOpen,
    userId: user?.id ?? null,
    companyId: selectedCompanyId,
    surface: "desktop",
    draft: createFormSnapshot,
    isMeaningful: (d) => Boolean(
      d.title.trim() || d.date || d.notes.trim() || d.clientId || d.locationId ||
      d.selectedEmployees.length > 0 || d.meetingPoint.trim() ||
      d.specialInstructions.trim() || d.shiftAdminId || d.driverIds.length > 0,
    ),
    normalize: (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const d = raw as Partial<typeof createFormSnapshot>;
      if (typeof d.title !== "string" || typeof d.date !== "string") return null;
      return {
        ...createFormSnapshot,
        ...d,
        selectedEmployees: Array.isArray(d.selectedEmployees) ? d.selectedEmployees : [],
        driverIds: Array.isArray(d.driverIds) ? d.driverIds : [],
      } as typeof createFormSnapshot;
    },
  });

  const restoreCreateDraft = (d: typeof createFormSnapshot) => {
    setTitle(d.title); setDate(d.date);
    setStartTime(d.startTime); setEndTime(d.endTime); setSlots(d.slots);
    setClientId(d.clientId); setLocationId(d.locationId); setNotes(d.notes);
    setClaimable(d.claimable); setMeetingPoint(d.meetingPoint);
    setSpecialInstructions(d.specialInstructions);
    setPayType(d.payType); setDayType(d.dayType); setPayOverride(d.payOverride);
    setShiftAdminId(d.shiftAdminId); setClockMethod(d.clockMethod);
    setAttendanceMode(d.attendanceMode); setMeetingTime(d.meetingTime);
    setTransportRequired(d.transportRequired); setCarCapacity(d.carCapacity);
    setTransportNotes(d.transportNotes); setDriverEmployeeId(d.driverEmployeeId);
    setDriverIds(d.driverIds ?? (d.driverEmployeeId ? [d.driverEmployeeId] : []));
    setSelectedEmployees(d.selectedEmployees);
    setMeetingPointLocationId(d.meetingPointLocationId);
    setJobSiteLocationId(d.jobSiteLocationId);
    setJobSiteAddress(d.jobSiteAddress ?? "");
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
        // Phase 2 #1: client/location no longer auto-fills payType. Shown as suggestion only in Pago section.
        if (loc.default_clock_method) {
          setClockMethod(loc.default_clock_method as "mobile" | "kiosk" | "both");
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

  // Creates a single shift row.
  // - `publishNow=false` ⇒ it's a draft: publication_status='draft',
  //   no notifications, assignments flagged as draft reservations.
  // - `publishNow=true`  ⇒ regular published shift, assignments are real.
  //
  // P0 recurrencia: `opts.employeeIds` evita depender del estado de React
  // (los setters son asíncronos y dejaban el equipo obsoleto dentro del bucle)
  // y `opts.sourceRef` da idempotencia estable por ocurrencia.
  const createSingleShift = async (
    shiftDate: string,
    skipNotifications = false,
    forceDraft = false,
    publishNow = true,
    opts?: { employeeIds?: string[]; sourceRef?: string | null; onAssignError?: (e: unknown) => void },
  ) => {
    if (!selectedCompanyId) return null;
    const employeeIds = opts?.employeeIds ?? selectedEmployees;
    const sourceRef = opts?.sourceRef ?? null;

    // Idempotencia: doble tap o retry del mismo submit reutiliza la fila.
    if (sourceRef) {
      const existing = await supabase
        .from("scheduled_shifts")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .eq("reconciliation_hash", sourceRef)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing.data?.id) return existing.data as any;
    }
    const isDraft = !publishNow || forceDraft;
    // Legacy `status` column retained: drafts also flow through the legacy
    // 'draft' value so existing UI/filters that look at status keep working.
    const initialStatus = isDraft ? "draft" : ((!forceDraft && shiftsConfig.auto_publish) ? "published" : "draft");
    const insertData: any = {
      company_id: selectedCompanyId,
      title: title.trim() || "Turno",
      date: shiftDate, start_time: startTime, end_time: endTime,
      slots: parseInt(slots) || 1,
      client_id: clientId || null,
      location_id: locationId || null,
      notes: notes.trim() || null,
      claimable: shiftsConfig.allow_claims ? claimable : false,
      meeting_point: meetingPoint.trim() || null,
      special_instructions: specialInstructions.trim() || null,
      created_by: user?.id,
      pay_type: payType,
      day_type: payType === "daily" ? dayType : "full_day",
      pay_override: payOverride,
      shift_admin_id: shiftAdminId || null,
      transportation_required: transportRequired,
      car_capacity: parseInt(carCapacity) || 5,
      transportation_notes: transportNotes.trim() || null,
      driver_employee_id: driverIds[0] || driverEmployeeId || null,
      clock_method: clockMethod,
      status: initialStatus,
      meeting_point_location_id: meetingPointLocationId || null,
      job_site_location_id: jobSiteLocationId || null,
      job_site_address: jobSiteAddress.trim() || null,
      // Trazabilidad de serie: todas las ocurrencias comparten el mismo intent.
      ...(sourceRef ? { reconciliation_hash: sourceRef } : {}),
      // New lifecycle column — single source of truth for draft visibility.
      publication_status: isDraft ? "draft" : "published",
      published_at: isDraft ? null : new Date().toISOString(),
      published_by: isDraft ? null : user?.id ?? null,
    };
    const { data: shift, error } = await supabase.from("scheduled_shifts").insert(insertData).select("*").single();

    if (error) {
      if (sourceRef) {
        // Carrera: otro intento pudo insertar la misma ocurrencia.
        const retry = await supabase
          .from("scheduled_shifts")
          .select("*")
          .eq("company_id", selectedCompanyId)
          .eq("reconciliation_hash", sourceRef)
          .is("deleted_at", null)
          .maybeSingle();
        if (retry.data?.id) return retry.data as any;
      }
      if (opts?.onAssignError) throw error;
      toast.error(error.message);
      return null;
    }

    if (employeeIds.length > 0 && shift) {
      const assigns = employeeIds.map(eid => ({
        company_id: selectedCompanyId, shift_id: shift.id, employee_id: eid, status: "pending",
        // P0.3 — multi-driver: el rol vive en la asignación, no en el turno.
        assignment_role: driverIds.includes(eid) ? "driver" : "worker",
        // Tentative reservations on drafts: visible to admins, invisible to workers,
        // no notifications, no readiness enforcement.
        is_draft_reservation: isDraft,
      }));
      // OX-1 — el turno ya existe: si el equipo falla, el usuario DEBE saberlo.
      // Sin CTA de reintento: repetir el insert podría duplicar asignaciones.
      const { error: assignError } = await supabase.from("shift_assignments").insert(assigns as any);
      if (assignError) {
        // En una serie, el Servicio NUNCA se borra porque el equipo falle:
        // el caller reporta la ocurrencia afectada y permite reintentar.
        if (opts?.onAssignError) opts.onAssignError(assignError);
        else notifyWarning({
          key: "shift-create-assign",
          title: "El turno se creó, pero sin equipo",
          fact: `No pudimos asignar ${assigns.length} worker(s).`,
          consequence: "Abre el turno y asigna el equipo manualmente para no duplicar asignaciones.",
          cause: assignError,
        });
      }
    }

    if (shift) {
      await logShiftActivity(
        isDraft ? "guardar_borrador_turno" : "crear_turno",
        shift.id,
        null,
        { title: title.trim(), date: shiftDate, start_time: startTime, end_time: endTime, draft: isDraft },
      );

      // No notifications fire for drafts — they're invisible to workers.
      if (!isDraft && !skipNotifications && claimable) {
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
            `"${title.trim()}" · ${dateLabel} · ${workRouteLine(startTime, endTime, meetingPoint)}. Aplica y te notificaremos si eres aceptado.`,
            claimRecipients,
            { claimable: true }
          );
        }
      }
    }

    if (!shift) return null;

    // P0 — creación y edición comparten el mismo punto de compromiso visible.
    // No devolvemos el control al formulario hasta que la fila creada esté en la
    // cache canónica y todas las vistas derivadas hayan recibido la invalidación.
    return await reconcileServiceAfterSave(
      queryClient,
      selectedCompanyId,
      shift.id,
      shift as ServiceRow,
    );
  };

  // Validación canónica de publicación — misma función que alimenta panel
  // lateral, confirmación y worker preview (getServicePublishReadiness).
  const publishReadiness = (): ServicePublishReadiness =>
    getServicePublishReadiness({
      date,
      startTime,
      endTime,
      title,
      clientId,
      locationId,
      jobSiteLocationId,
      jobSiteAddress,
      meetingPoint,
      meetingPointLocationId,
      transportRequired,
      driverIds,
      driverEmployeeId,
      shiftAdminId,
      assignedCount: selectedEmployees.length,
      claimable,
      requirements: {
        requireClient: shiftsConfig.require_client,
        requireLocation: shiftsConfig.require_location,
        requireShiftAdmin: shiftsConfig.require_shift_admin,
        maxShiftHours: shiftsConfig.max_shift_hours,
        requireTitle: true,
      },
    });


  // Save the current form as a draft. Almost no validations — only company + date.
  // Drafts can be incomplete; everything is allowed except a missing date (because
  // we anchor the calendar on date) and a missing tenant.
  const handleSaveDraft = async () => {
    if (!selectedCompanyId) { toast.error("Selecciona una compañía"); return; }
    if (!date) { toast.error("Una fecha es obligatoria incluso para borradores"); return; }
    // Hardening: evitar drafts huérfanos/genéricos ("Turno" vacío).
    const hasMinimumContext =
      !!title.trim() ||
      !!clientId ||
      !!jobSiteLocationId ||
      !!locationId ||
      selectedEmployees.length > 0;
    if (!hasMinimumContext) {
      toast.error("Agrega al menos un cliente, ubicación, título o trabajador para guardar este borrador.");
      return;
    }
    setDraftSaving(true);
    try {
      const baseShift = await createSingleShift(date, /* skipNotifications */ true, /* forceDraft */ true, /* publishNow */ false);
      if (!baseShift) return;
      toast.success("Borrador guardado");
      createSession.endSession(); // P0.4 — borrador en BD guardado → sesión local limpia
      setCreateOpen(false);
      resetForm();
      loadData();
    } finally {
      setDraftSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!date || !selectedCompanyId) return;

    // Validación estricta solo al publicar — fuente canónica única.
    const readiness = publishReadiness();
    if (!readiness.canPublish) {
      const first = readiness.blockers[0];
      toast.error(first.message, {
        description:
          readiness.blockers.length > 1
            ? `También falta: ${readiness.blockers.slice(1).map((b) => b.label).join(", ")}`
            : undefined,
        action: first.cta
          ? {
              label: first.cta.label,
              onClick: () => focusServiceSection(first.cta!.anchorId),
            }
          : undefined,
      });
      if (first.cta) focusServiceSection(first.cta.anchorId);
      return;
    }


    setSaving(true);

    const repeatDates = computeRepeatDates(date, repeatConfig);
    const isRepeating = repeatConfig.enabled && repeatDates.length > 0;

    // Base shift = published. Repeated shifts inherit the original behavior:
    // they are created as drafts so the operator reviews them before publishing.
    const baseShift = await createSingleShift(date, isRepeating, false, true);
    if (!baseShift) { setSaving(false); return; }

    if (isRepeating) {
      const copyAssign = repeatConfig.copyAssignments;
      const savedEmployees = [...selectedEmployees];
      if (!copyAssign) setSelectedEmployees([]);

      for (const repeatDate of repeatDates) {
        await createSingleShift(repeatDate, true, true, false);
      }

      if (!copyAssign) setSelectedEmployees(savedEmployees);
      toast.success(`${repeatDates.length + 1} turnos creados (${repeatDates.length} repetidos en borrador)`);
    } else {
      toast.success("Turno publicado");
    }

    createSession.endSession(); // P0.4 — turno creado → sesión, storage y timers limpios
    setSaving(false); setCreateOpen(false); resetForm(); loadData();
  };

  // Quick create: minimal shift from popover
  const handleQuickCreate = async (data: { title: string; date: string; start_time: string; end_time: string; client_id: string; location_id: string; slots: number }) => {
    if (!selectedCompanyId) {
      toast.error("Selecciona una empresa antes de crear un turno");
      return;
    }
    const { data: shift, error } = await supabase.from("scheduled_shifts").insert({
      company_id: selectedCompanyId,
      title: data.title,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      slots: data.slots,
      client_id: data.client_id || null,
      location_id: data.location_id || null,
      // Borrador real: status + publication_status alineados para que el turno
      // NO aparezca al worker hasta que el admin lo publique desde el editor.
      status: "draft",
      publication_status: "draft",
      created_by: user?.id,
    } as any).select("*").single();

    if (error) {
      console.error("[QuickCreate] insert failed:", error);
      toast.error(error.message || "No se pudo crear el turno");
      return;
    }
    // Title stays clean — `shift_code` is the single source of truth.
    if (!shift) return;
    await logShiftActivity("crear_turno", shift.id, null, { title: data.title, date: data.date, quick: true });
    await reconcileServiceAfterSave(queryClient, selectedCompanyId, shift.id, shift as ServiceRow);
    await loadData();
    toast.success("Turno borrador creado");
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

  const handleEditShift = async (
    shiftId: string,
    updates: Partial<Shift>,
    oldShift: Shift,
    overrideVersion?: number | null,
  ) => {
    if (oldShift.status === "locked") { toast.error("Este turno está bloqueado y no se puede editar"); return; }
    const changes = getChangedFields(oldShift, updates);
    if (changes.length === 0) { toast.info("Sin cambios"); return; }

    const companyIdForWrite = selectedCompanyId ?? (oldShift as any).company_id ?? null;
    // VWC — PATCH parcial: sólo los campos que realmente cambiaron.
    const patch: Record<string, any> = {};
    changes.forEach((c) => { patch[c.field] = (updates as any)[c.field]; });

    const canonicalRow = readServiceRow(queryClient, companyIdForWrite, shiftId);
    const expectedVersion =
      overrideVersion ?? rowVersion(canonicalRow) ?? rowVersion(oldShift as any);

    const saveResult = await versionedWrite({
      entity: "scheduled_shifts",
      id: shiftId,
      companyId: companyIdForWrite,
      patch,
      expectedVersion,
      surface: "desktop_shift_detail_dialog",
    });

    if (saveResult.status === "conflict") {
      setServiceConflict({
        info: {
          patch,
          serverRow: saveResult.row,
          actualVersion: saveResult.actualVersion,
          expectedVersion: saveResult.expectedVersion,
          updatedAt: saveResult.updatedAt,
        },
        shiftId,
        updates,
        oldShift,
      });
      return;
    }
    if (saveResult.status !== "applied") {
      notifyError({
        key: "shift-update-desktop",
        title: "No pudimos guardar el turno",
        fact: saveResult.status === "noop" ? "No había cambios que aplicar." : saveResult.message,
        consequence: "El turno sigue como estaba. Revisa e inténtalo de nuevo.",
      });
      return;
    }
    setServiceConflict(null);
    const savedShift = saveResult.row;



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
          `"${shiftTitle}" · ${dateLabel} · ${workRouteLine(oldShift.start_time, oldShift.end_time, (oldShift as any).meeting_point ?? null)}. Aplica y te notificaremos si eres aceptado.`,
          claimRecipients, { claimable: true }
        );
      }
    }

    // Fase 4 — reconciliamos la fuente canónica antes de declarar el cambio visible.
    const canonical = await reconcileServiceAfterSave(
      queryClient,
      selectedCompanyId ?? (oldShift as any).company_id ?? null,
      shiftId,
      savedShift,
    );
    toast.success("Turno actualizado");
    setSelectedShift(prev => prev?.id === shiftId ? { ...prev, ...(canonical ?? savedShift) } as Shift : prev);
    await loadData();

  };

  // Phase 4.2 — gate single-shift publish behind PrePublishDialog so the
  // operator sees pending info, worker preview, and confirms when publishing
  // with incomplete data. The actual publish handler below is unchanged.
  const [pendingPublishShift, setPendingPublishShift] = useState<Shift | null>(null);
  const [publishingGated, setPublishingGated] = useState(false);

  const handlePublishShift = async (shift: Shift) => {
    // require_shift_admin gate
    if (shiftsConfig.require_shift_admin && !(shift as any).shift_admin_id) {
      toast.error("A shift lead must be assigned before publishing");
      return;
    }
    // Open the review dialog instead of publishing immediately. The
    // confirmation handler below calls executePublishShift unchanged.
    setPendingPublishShift(shift);
  };

  const executePublishShift = async (shift: Shift) => {
    // Use the RPC so draft reservations are lifted atomically and the
    // publication lifecycle stays consistent (publication_status + status).
    const { error: rpcError } = await supabase.rpc("publish_shift_draft" as any, { _shift_id: shift.id });
    if (rpcError) { toast.error(rpcError.message); return; }
    // Keep the legacy `status` column in sync for downstream UI/filters.
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
      `Tu turno "${shift.title}" — ${shift.date} · ${workRouteLine(shift.start_time, shift.end_time, (shift as any).meeting_point ?? null)} ya fue publicado.`,
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
          `"${shift.title}" · ${dateLabel} · ${workRouteLine(shift.start_time, shift.end_time, (shift as any).meeting_point ?? null)}. Aplica y te notificaremos si eres aceptado.`,
          claimRecipients, { claimable: true }
        );
      }
    }

    toast.success("Turno publicado y empleados notificados");
    setSelectedShift(prev => prev?.id === shift.id ? { ...prev, status: "published" } : prev);
    loadData();
  };

  // --- Bulk publish all draft shifts in current view ---
  // Uses the publish_shift_draft RPC per shift so the publication lifecycle
  // (publication_status, published_at, published_by, draft reservations) stays
  // consistent with single-publish. Failures are reported per-shift instead of
  // aborting the whole batch.
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const handlePublishAll = async () => {
    // Only true drafts — never re-publish already-published shifts (avoids
    // duplicate notifications) and never touch locked ones.
    const draftShifts = filteredShifts.filter(s => {
      const pub = (s as any).publication_status ?? "published";
      return pub === "draft" && s.status !== "locked";
    });
    if (draftShifts.length === 0) { toast.info("No hay turnos borrador para publicar"); return; }

    // require_shift_admin gate for bulk publish
    if (shiftsConfig.require_shift_admin) {
      const blocked = draftShifts.filter(s => !(s as any).shift_admin_id);
      if (blocked.length > 0) {
        toast.error(`${blocked.length} shift(s) missing a shift lead — assign one before publishing`);
        return;
      }
    }

    setBulkPublishing(true);
    const succeeded: Shift[] = [];
    const failed: { shift: Shift; reason: string }[] = [];

    // Sequential to keep error attribution clean and avoid hammering the RPC.
    for (const shift of draftShifts) {
      const { error: rpcError } = await supabase.rpc(
        "publish_shift_draft" as any,
        { _shift_id: shift.id }
      );
      if (rpcError) {
        // Surface validation reasons (PUBLISH_VALIDATION_FAILED: field1,field2)
        // verbatim so the operator knows what to fix.
        failed.push({ shift, reason: rpcError.message });
        continue;
      }

      // Keep the legacy `status` column in sync for downstream UI/filters.
      // The RPC owns publication_status/published_at/published_by/reservations.
      const { error: statusError } = await supabase
        .from("scheduled_shifts")
        .update({ status: "published" } as any)
        .eq("id", shift.id);
      if (statusError) {
        failed.push({ shift, reason: statusError.message });
        continue;
      }

      await logShiftActivity(
        "publicar_turno",
        shift.id,
        { status: shift.status, publication_status: (shift as any).publication_status ?? null },
        { status: "published", publication_status: "published" }
      );

      // Notifications — the DB trigger blocks worker notifications while a
      // shift is in draft, so this is the single source of "shift published"
      // notifications (no duplicates).
      const shiftAssigns = assignments.filter(a => a.shift_id === shift.id);
      const employeeIds = shiftAssigns.map(a => a.employee_id);

      await sendShiftNotifications(
        shift.id,
        shift.title,
        "shift_published",
        `Turno publicado: ${shift.title}`,
        `Tu turno "${shift.title}" — ${shift.date} · ${workRouteLine(shift.start_time, shift.end_time, (shift as any).meeting_point ?? null)} ya fue publicado.`,
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
            `"${shift.title}" · ${dateLabel} · ${workRouteLine(shift.start_time, shift.end_time, (shift as any).meeting_point ?? null)}. Aplica y te notificaremos si eres aceptado.`,
            claimRecipients,
            { claimable: true }
          );
        }
      }

      succeeded.push(shift);
    }

    setBulkPublishing(false);

    if (succeeded.length > 0) {
      toast.success(`${succeeded.length} turno(s) publicados`);
    }
    if (failed.length > 0) {
      // Compact, actionable summary. Each entry: "#code — reason".
      const details = failed
        .slice(0, 5)
        .map(f => `${getShiftDisplayIdentity(f.shift).primaryRef}: ${f.reason}`)
        .join("\n");
      const more = failed.length > 5 ? `\n…y ${failed.length - 5} más` : "";
      toast.error(`${failed.length} turno(s) no se publicaron`, { description: details + more });
      console.warn("[bulk-publish] failures", failed);
    }

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

  const handleAddEmployees = async (
    shiftId: string,
    employeeIds: string[],
    slotByEmployee?: Record<string, string | null>,
  ) => {
    if (!selectedCompanyId) return;
    const assigns = employeeIds.map(eid => ({
      company_id: selectedCompanyId,
      shift_id: shiftId,
      employee_id: eid,
      // Always start as "pending" — the relaxed readiness trigger allows
      // pending state for workers whose profile is still incomplete.
      // Confirmation/clock-in will re-check readiness later.
      status: "pending",
      role_slot_id: slotByEmployee?.[eid] ?? null,
    }));
    const { error } = await supabase.from("shift_assignments").insert(assigns as any);
    if (error) {
      // Map raw DB errors to operator-friendly messages.
      const msg = (error.message ?? "").toString();
      let humanMsg = "No se pudo asignar al trabajador. Inténtalo de nuevo.";
      if (msg.includes("EMPLOYEE_INACTIVE")) {
        humanMsg = "Este trabajador está archivado/inactivo. Reactívalo antes de asignarlo.";
      } else if (msg.includes("EMPLOYEE_WRONG_COMPANY")) {
        humanMsg = "Este trabajador no pertenece a esta compañía. No se puede asignar.";
      } else if (msg.includes("EMPLOYEE_NOT_FOUND")) {
        humanMsg = "El trabajador ya no existe en la base de datos.";
      } else if (msg.includes("EMPLOYEE_NOT_READY")) {
        // Should not happen for status='pending' anymore, but kept as safety net.
        humanMsg = "El perfil del trabajador está incompleto y aún no puede confirmar este turno.";
      } else if (msg.toLowerCase().includes("duplicate") || msg.includes("23505")) {
        humanMsg = "Este trabajador ya está asignado a este turno.";
      } else if (msg.toLowerCase().includes("overlap") || msg.includes("23P01")) {
        humanMsg = "Este trabajador tiene otro turno que se solapa con este horario.";
      }
      // Sin reintento automático: un segundo intento puede duplicar la asignación.
      notifyError({
        key: "shift-assign",
        title: "No pudimos asignar al worker",
        fact: humanMsg,
        consequence: "No se creó ninguna asignación. Resuelve el motivo y vuelve a intentarlo.",
        cause: error,
      });
      return;
    }

    const shift = shifts.find(s => s.id === shiftId);
    await logShiftActivity("asignar_empleados", shiftId, null, { employee_ids: employeeIds }, {
      count: employeeIds.length,
    });

    // Audit any assignment created for a worker with an incomplete profile,
    // so the operator's bypass is traceable. Best-effort — never blocks the flow.
    try {
      const incompleteWorkers = employees.filter(
        e => employeeIds.includes(e.id) &&
          e.profile_status &&
          e.profile_status !== "ready" &&
          e.profile_status !== "active",
      );
      if (incompleteWorkers.length > 0) {
        await supabase.from("activity_log").insert(
          incompleteWorkers.map(w => ({
            user_id: user?.id ?? null,
            company_id: selectedCompanyId,
            action: "assignment_created_with_incomplete_profile",
            entity_type: "shift_assignment",
            entity_id: shiftId,
            details: {
              shift_id: shiftId,
              employee_id: w.id,
              employee_name: `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim(),
              profile_status: w.profile_status,
              onboarding_status: w.onboarding_status ?? null,
              has_portal: !!w.user_id,
            },
          })) as any,
        );
      }
    } catch { /* swallow audit errors — never block assignment */ }

    // Notify newly assigned employees
    if (shift) {
      await sendShiftNotifications(
        shiftId,
        shift.title,
        "shift_assigned",
        `Asignado a turno: ${shift.title}`,
        `Has sido asignado a "${shift.title}" — ${shift.date} · ${workRouteLine(shift.start_time, shift.end_time, (shift as any).meeting_point ?? null)}.`,
        employeeIds
      );
    }

    toast.success(`${employeeIds.length} empleado(s) asignados`);
    loadData();
  };

  /**
   * P0 — El retiro ya lo ejecutó la RPC canónica `remove_worker_from_shift`
   * (auditada, con notificación al worker y sin borrar la fila). Aquí sólo
   * se refresca la vista: nunca se borra ni se vuelve a notificar.
   */
  const handleAssignmentRemoved = async (_assignmentId: string) => {
    loadData();
  };


  const handleDropOnShift = async (targetShiftId: string, dataStr: string) => {
    if (!canEdit) return;
    try {
      const data = JSON.parse(dataStr);
      const { assignmentId, employeeId, fromShiftId } = data;
      if (fromShiftId === targetShiftId) return;

      const existing = assignments.find(a => a.shift_id === targetShiftId && a.employee_id === employeeId);
      if (existing) {
        notifyWarning({
          key: "shift-reassign",
          title: "Ya está asignado a este turno",
          fact: "No se movió a nadie.",
          consequence: "Elige otro turno destino.",
        });
        return;
      }

      // P0 — VWC Fase 3D: nunca borramos asignaciones. Primero se crea en destino
      // (RPC idempotente) y sólo después se retira del origen por el carril único,
      // para que un fallo nunca deje a la persona sin turno.
      const source = (assignments as any[]).find(a => a.id === assignmentId);
      const { error: insError } = await supabase.rpc("assign_worker_to_shift" as any, {
        p_shift_id: targetShiftId,
        p_employee_id: employeeId,
        p_assignment_role: source?.assignment_role ?? "staff",
        p_reason: "moved_from_other_shift",
        p_source: "shifts_calendar",
      } as any);
      if (insError) {
        notifyError({
          key: "shift-reassign",
          title: "No pudimos mover al worker",
          fact: "Sigue asignado al turno original.",
          consequence: "No se creó ninguna asignación duplicada.",
          cause: insError,
        });
        return;
      }

      const removal = await versionedAssignmentTransition({
        assignmentId,
        companyId: source?.company_id ?? selectedCompanyId,
        transition: "remove",
        expectedStatus: source?.status ?? null,
        expectedVersion: typeof source?.version === "number" ? source.version : null,
        reason: "moved_to_other_shift",
        surface: "shifts_calendar",
      });
      if (removal.status !== "applied") {
        // Estado parcial real: ya entró al destino pero sigue en el origen.
        notifyActionRequired({
          key: "shift-reassign",
          title: "Quedó asignado en dos turnos",
          fact: "Entró al turno destino pero no pudimos retirarlo del original.",
          consequence: "Retíralo manualmente del turno original antes de continuar.",
        });
        loadData();
        return;
      }


      notifySuccess({
        key: "shift-reassign",
        title: "Worker reasignado",
        fact: "Se movió al turno destino.",
        consequence: "La cobertura de ambos turnos se actualizó.",
      });
      loadData();
    } catch (e) {
      notifyError({
        key: "shift-reassign",
        title: "No pudimos completar la reasignación",
        fact: "No se realizaron cambios.",
        consequence: "Vuelve a arrastrar al worker sobre el turno destino.",
        cause: e,
      });
    }
  };

  const handleDuplicateToDay = async (shiftData: any, targetDate: string) => {
    if (!canEdit || !selectedCompanyId) return;
    // Phase 2 #2.1: copy full operational structure (status=draft) WITHOUT
    // assignments, QR recipients, or driver_employee_id. Driver is a person,
    // not a structural property of the shift — copying it would create a false
    // sense that transport is resolved.
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
      meeting_point: shiftData.meeting_point || null,
      special_instructions: shiftData.special_instructions || null,
      pay_type: shiftData.pay_type || "hourly",
      day_type: shiftData.day_type || "full_day",
      pay_override: shiftData.pay_override ?? false,
      attendance_mode: shiftData.attendance_mode || null,
      clock_method: shiftData.clock_method || "both",
      transportation_required: shiftData.transportation_required ?? false,
      car_capacity: shiftData.car_capacity ?? 5,
      transportation_notes: shiftData.transportation_notes || null,
      shift_admin_id: shiftData.shift_admin_id || null,
      meeting_point_location_id: shiftData.meeting_point_location_id || null,
      job_site_location_id: shiftData.job_site_location_id || null,
      // Explicitly NOT copied: driver_employee_id, assignments, QR recipients
      status: "draft",
      created_by: user?.id,
    } as any).select("id, shift_code").single();

    if (error) { toast.error(error.message); return; }

    if (newShift) {
      await logShiftActivity("duplicar_turno", newShift.id, null, {
        title: shiftData.title, date: targetDate, source_shift: shiftData.shiftId,
      });
    }

    const niceDate = new Date(targetDate + "T12:00:00").toLocaleDateString("es", {
      weekday: "short", day: "numeric", month: "short",
    });
    toast.success(`Turno duplicado al ${niceDate} como borrador.`, {
      description: "Asigna empleados para activar.",
    });
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
      const raw = s as any;
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
        // Phase 2 #2.2: align fields with handleDuplicateToDay (#2.1).
        meeting_point: raw.meeting_point || null,
        special_instructions: raw.special_instructions || null,
        pay_type: raw.pay_type || "hourly",
        day_type: raw.day_type || "full_day",
        pay_override: raw.pay_override ?? false,
        attendance_mode: raw.attendance_mode || null,
        clock_method: raw.clock_method || "both",
        transportation_required: raw.transportation_required ?? false,
        car_capacity: raw.car_capacity ?? 5,
        transportation_notes: raw.transportation_notes || null,
        shift_admin_id: raw.shift_admin_id || null,
        meeting_point_location_id: raw.meeting_point_location_id || null,
        job_site_location_id: raw.job_site_location_id || null,
        // Explicitly NOT copied: driver_employee_id, QR recipients
        // Assignments handled separately below, gated by shifts_config.copy_week_assignments
        status: "draft",
        created_by: user?.id,
      } as any).select("id, shift_ref").single();
      if (error) continue;
      /* P0 · SHIFT IDENTITY: el título NO lleva número. La referencia visible
       * (`shift_ref`) la emite la secuencia por empresa; prefijar el título
       * creaba un segundo número compitiendo en cabeceras. */
      // Copy assignments (respects shifts_config.copy_week_assignments)
      if (shiftsConfig.copy_week_assignments && newShift) {
        const shiftAssigns = assignments.filter(a => a.shift_id === s.id);
        if (shiftAssigns.length > 0) {
          const newAssigns = shiftAssigns.map(a => ({
            company_id: selectedCompanyId,
            shift_id: newShift.id,
            employee_id: a.employee_id,
            status: "pending",
          }));
          const { error: copyAssignError } = await supabase.from("shift_assignments").insert(newAssigns as any);
          if (copyAssignError) {
            notifyWarning({
              key: "shift-copy-assign",
              title: "Se copió el turno, pero sin equipo",
              fact: `No pudimos copiar ${newAssigns.length} asignación(es).`,
              consequence: "Revisa el turno copiado y asigna el equipo manualmente.",
              cause: copyAssignError,
            });
          }
        }
      }
      if (newShift) {
        await logShiftActivity("copiar_semana", newShift.id, null, {
          source_shift: s.id, source_date: s.date, target_date: targetDate,
        });
      }
      created++;
    }
    const weekLabel = `${format(nextWeekStart, "MMM d")}–${format(addDays(nextWeekStart, 6), "MMM d")}`;
    // Phase 2 #2.2: make assignment-copy behavior visible in the toast.
    toast.success(`${created} turnos duplicados a ${weekLabel} como borrador.`, {
      description: shiftsConfig.copy_week_assignments
        ? "Asignaciones copiadas como pending — los empleados deben aceptar."
        : "Sin asignaciones copiadas. Asigna empleados para activar.",
    });
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

  // ── Operations KPI strip (operator-first) ──
  const opsKpis: OpsKpiItem[] = [
    {
      key: "today",
      label: `${ADMIN_LEX.EntityPlural} hoy`,
      value: loading ? "—" : kpiMetrics.todayShifts,
      tone: "primary",
      icon: <CalendarDays className="h-3.5 w-3.5" />,
    },
    {
      key: "needs",
      label: "Necesitan personal",
      value: loading ? "—" : kpiMetrics.needsStaffCount,
      tone: kpiMetrics.needsStaffCount > 0 ? "critical" : "success",
      icon: <UserX className="h-3.5 w-3.5" />,
    },
    {
      key: "drafts",
      label: "Borradores",
      value: loading ? "—" : kpiMetrics.draftsCount,
      tone: kpiMetrics.draftsCount > 0 ? "warning" : "neutral",
      icon: <FileText className="h-3.5 w-3.5" />,
    },
    {
      key: "published",
      label: "Publicados",
      value: loading ? "—" : kpiMetrics.publishedCount,
      tone: "info",
      icon: <Send className="h-3.5 w-3.5" />,
    },
    {
      key: "incomplete",
      label: "Sin ubicación",
      value: loading ? "—" : kpiMetrics.missingLocationCount,
      tone: kpiMetrics.missingLocationCount > 0 ? "warning" : "neutral",
      icon: <MapPin className="h-3.5 w-3.5" />,
    },
  ];

  // ── Attention chips (deep-link to existing filters; no new logic) ──
  const attentionChips = [
    {
      key: "needs",
      label: "Sin personal completo",
      count: kpiMetrics.needsStaffCount,
      tone: "critical" as const,
      icon: UserX,
      active: !!filters.needsStaffingOnly,
      onClick: () => setFilters({ ...filters, needsStaffingOnly: !filters.needsStaffingOnly }),
    },
    {
      key: "drafts",
      label: "Borradores listos para publicar",
      count: kpiMetrics.draftsCount,
      tone: "warning" as const,
      icon: FileText,
      active: filters.publishStatus === "draft",
      onClick: () => setFilters({ ...filters, publishStatus: filters.publishStatus === "draft" ? "" : "draft" }),
    },
    {
      key: "noloc",
      label: "Sin ubicación / punto de encuentro",
      count: kpiMetrics.missingLocationCount,
      tone: "warning" as const,
      icon: MapPin,
      active: false,
      onClick: undefined,
    },
  ].filter(c => c.count > 0);

  return (
    <div className="space-y-4">
      {/* ── PAGE HEADER (unified with rest of app) ── */}
      <PageHeader
        title={ADMIN_LEX.EntityPlural}
        subtitle="Planifica, publica y controla la cobertura de tu operación diaria."
        icon={CalendarRange}
        rightSlot={
          <>
            {canEdit && (
              <Button
                size="sm"
                className="h-11 min-w-[44px] text-sm gap-1.5"
                onClick={() => { resetForm(); setCreateOpen(true); }}
              >
                <Plus className="h-4 w-4" />
                {ADMIN_LEX.create}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground" aria-label="Más opciones de turnos">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate("/app/daily-ops")}>
                  <ScanEye className="h-4 w-4 mr-2" /> Operaciones del día
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/today")}>
                  <ScanEye className="h-4 w-4 mr-2" /> Vista de hoy
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/shift-requests")}>
                  <MessageSquare className="h-4 w-4 mr-2" /> Solicitudes
                </DropdownMenuItem>
                {canEdit && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/app/import-schedule")}>
                      <Upload className="h-4 w-4 mr-2" /> Importar horarios
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                      <Settings2 className="h-4 w-4 mr-2" /> Configuración de turnos
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }

      />

      {/* Sprint 3: active Ops-cockpit filter chip (only visible when arrived via deep-link) */}
      {activeOpsChip && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
            <ScanEye className="h-3.5 w-3.5" />
            Filtro activo: {activeOpsChip}
          </span>
          <span className="text-muted-foreground">
            Aplicado desde el Ops Cockpit. Los filtros manuales siguen funcionando.
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] ml-auto"
            onClick={() => {
              setActiveOpsChip(null);
              setIncompleteOnly(false);
              setFilters(f => ({ ...f, needsStaffingOnly: false }));
            }}
          >
            Limpiar filtro
          </Button>
        </div>
      )}

      {/* ── OPS KPI STRIP ── */}
      <OpsKpiStrip items={opsKpis} />


      {/* ── Qué necesita atención ── compact action center (UI-only, deep-links to existing filters) */}
      {!loading && attentionChips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border/40 bg-card/60 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground shrink-0">
            Qué necesita atención
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {attentionChips.map(c => {
              const Icon = c.icon;
              const toneClass =
                c.tone === "critical"
                  ? "bg-destructive/10 text-destructive border-destructive/25 hover:bg-destructive/15"
                  : "bg-warning/10 text-warning border-warning/25 hover:bg-warning/15";
              const Cmp: any = c.onClick ? "button" : "span";
              return (
                <Cmp
                  key={c.key}
                  type={c.onClick ? "button" : undefined}
                  onClick={c.onClick}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors",
                    toneClass,
                    c.onClick ? "cursor-pointer" : "cursor-default",
                    c.active && "ring-1 ring-current/40",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span>{c.label}</span>
                  <span className="font-mono tabular-nums opacity-80">{c.count}</span>
                </Cmp>
              );
            })}
          </div>
        </div>
      )}

      {/* ── OPS TOOLBAR: time range · date nav · group by ──
          Time (Día/Semana/Mes) and Group-by (Grid/Cliente/Equipo) are now
          separated controls. Group-by is a mode over the same data — never a
          silo. Day/Month implicitly use grid; switching group-by from those
          ranges bumps the view to Week so the grouping has a surface to render. */}
      {(() => {
        const timeRange: "day" | "week" | "month" =
          viewMode === "day" ? "day" : viewMode === "month" ? "month" : "week";
        const groupBy: "grid" | "client" | "team" =
          viewMode === "client"
            ? "client"
            : viewMode === "employee"
            ? "team"
            : viewMode === "week"
            ? weekViewMode === "job"
              ? "client"
              : weekViewMode === "employee"
              ? "team"
              : "grid"
            : "grid";

        const setTimeRange = (t: "day" | "week" | "month") => {
          if (t === "day" || t === "month") {
            setViewMode(t);
          } else {
            // Going to week → preserve grouping
            setViewMode("week");
            if (groupBy === "client") setWeekViewMode("job");
            else if (groupBy === "team") setWeekViewMode("employee");
            else setWeekViewMode("grid");
          }
        };

        const setGroupBy = (g: "grid" | "client" | "team") => {
          if (g === "grid") {
            if (viewMode === "employee" || viewMode === "client") setViewMode("week");
            if (viewMode === "week") setWeekViewMode("grid");
          } else if (g === "client") {
            if (viewMode === "day" || viewMode === "month") {
              // bump to week so grouping has a surface
              setViewMode("week");
              setWeekViewMode("job");
            } else if (viewMode === "week") {
              setWeekViewMode("job");
            } else {
              setViewMode("client");
            }
          } else {
            // team
            if (viewMode === "day" || viewMode === "month") {
              setViewMode("week");
              setWeekViewMode("employee");
            } else if (viewMode === "week") {
              setWeekViewMode("employee");
            } else {
              setViewMode("employee");
            }
          }
        };

        const timeOpts = [
          { key: "day" as const, icon: Calendar, label: "Día" },
          { key: "week" as const, icon: LayoutGrid, label: "Semana" },
          { key: "month" as const, icon: CalendarDays, label: "Mes" },
        ];
        const groupOpts = [
          { key: "grid" as const, icon: LayoutGrid, label: "Cuadrícula" },
          { key: "client" as const, icon: Building2, label: "Cliente" },
          { key: "team" as const, icon: Users, label: "Equipo" },
        ];

        return (
          <OpsToolbar
            sticky={false}
            left={
              <div className="flex items-center gap-2 flex-wrap">
                {/* Time range */}
                <div className="flex items-center gap-0.5 bg-secondary rounded-xl p-1" role="tablist" aria-label="Rango de tiempo">
                  {timeOpts.map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={timeRange === key}
                      onClick={() => setTimeRange(key)}
                      className={cn(
                        "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all duration-150",
                        timeRange === key
                          ? "bg-card shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> <span className="hidden md:inline">{label}</span>
                    </button>
                  ))}
                </div>

                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 hidden lg:inline">
                  Agrupar por
                </span>
                {/* Group by */}
                <div className="flex items-center gap-0.5 bg-secondary/60 rounded-xl p-1" role="tablist" aria-label="Agrupar por">
                  {groupOpts.map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={groupBy === key}
                      onClick={() => setGroupBy(key)}
                      className={cn(
                        "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all duration-150",
                        groupBy === key
                          ? "bg-card shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> <span className="hidden md:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            }
            center={
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={navigateBack}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  onClick={navigateToday}
                  className="text-[13px] font-semibold capitalize min-w-[160px] text-center px-3 py-1 rounded-xl hover:bg-accent/50 transition-colors"
                >
                  {navLabel}
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={navigateForward}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            }
            right={
              <button
                onClick={navigateToday}
                className="text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-xl transition-colors"
              >
                Hoy
              </button>
            }
          />
        );
      })()}


      {/* ── FILTERS + CONTEXTUAL ACTIONS ── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
        <div className="flex-1 min-w-0 space-y-2">
          <ShiftFilters filters={filters} onChange={setFilters} clients={clients} locations={locations} allowClaims={shiftsConfig.allow_claims} />
          <CrossCompanyShiftHint
            query={filters.search ?? ""}
            noLocalResults={filteredShifts.length === 0}
          />
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Primary action — scope-explicit */}
            <Button
              variant="default"
              size="sm"
              className="h-8 text-[11px] px-3 gap-1.5 rounded-xl"
              onClick={handlePublishAll}
              disabled={bulkPublishing}
              title="Publica los borradores listos dentro del rango de fechas y filtros actuales"
            >
              {bulkPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publicar listos
            </Button>

            {/* Secondary / destructive bulk actions live inside Más acciones,
                each label naming the scope so it never feels global. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[11px] px-3 gap-1.5 rounded-xl">
                  <MoreHorizontal className="h-3.5 w-3.5" /> Más acciones
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Acciones sobre el rango visible
                </DropdownMenuLabel>
                {viewMode === "week" && (
                  <button
                    type="button"
                    onClick={handleCopyWeek}
                    disabled={copyingWeek}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded disabled:opacity-50"
                  >
                    {copyingWeek ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    Copiar semana
                    <span
                      className={cn(
                        "ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded",
                        shiftsConfig.copy_week_assignments ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {shiftsConfig.copy_week_assignments ? "+ asignaciones" : "solo turnos"}
                    </span>
                  </button>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Cierre operativo
                </DropdownMenuLabel>
                <button
                  type="button"
                  onClick={handleLockAll}
                  disabled={bulkLocking}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded text-warning disabled:opacity-50"
                >
                  {bulkLocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                  Bloquear turnos filtrados
                </button>
                <button
                  type="button"
                  onClick={handleUnlockAll}
                  disabled={bulkUnlocking}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded text-earning disabled:opacity-50"
                >
                  {bulkUnlocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                  Desbloquear turnos filtrados
                </button>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Integraciones
                </DropdownMenuLabel>
                <button
                  type="button"
                  onClick={() => setBulkExportConnecteamOpen(true)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded"
                  title="Exporta los turnos del rango/filtros actuales al formato de Connecteam. Read-only, no toca payroll."
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar {ADMIN_LEX.EntityPlural} → Connecteam (.csv)
                </button>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      {canEdit && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
          <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>
            <span className="font-semibold text-foreground">Consejo:</span>{" "}
            haz click en <span className="font-mono bg-muted/60 px-1 rounded">+</span> sobre una fecha del calendario
            para crear un {ADMIN_LEX.entity} rápido con plantilla.
          </span>
        </div>
      )}
      <div className="relative rounded-2xl bg-card border border-border/40 shadow-xs p-4 sm:p-5 min-h-[420px]">

        {/* Subtle refetch indicator — keeps prior data visible to avoid layout shift */}
        {isRefetching && !loading && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-[10px] text-muted-foreground/70 bg-card/80 backdrop-blur px-2 py-1 rounded-lg border border-border/30">
            <Loader2 className="h-3 w-3 animate-spin" /> Actualizando…
          </div>
        )}
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
            onShiftClick={handleShiftClick}
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
              onShiftClick={handleShiftClick}
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
              onShiftClick={handleShiftClick}
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
              onShiftClick={handleShiftClick}
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
            onShiftClick={handleShiftClick}
            onDropOnShift={handleDropOnShift}
            onAddShift={canEdit ? handleAddShiftFromCalendar : undefined}
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
            onShiftClick={handleShiftClick}
            onDropOnShift={handleDropOnShift}
          />
        ) : (
          <ClientView
            clients={clients}
            shifts={filteredShifts}
            assignments={assignments}
            locations={locations}
            onShiftClick={handleShiftClick}
            onDropOnShift={handleDropOnShift}
          />
        )}
      </div>

      {/* Weekly Summary */}
      <WeeklySummaryBar shifts={filteredShifts} assignments={assignments} />

      {/* OX-8.1 — FAB retirado: duplicaba la acción protagonista "Nuevo turno" de la cabecera. */}


      {/* ── Create Shift Dialog (full-screen shell) ── */}
      <CreateShiftDialogInline
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}
        formState={{
          title, date, startTime, endTime, slots,
          clientId, locationId, notes, claimable,
          meetingPoint, specialInstructions,
          payType, dayType, payOverride, shiftAdminId, clockMethod,
          attendanceMode, meetingTime,
          transportRequired, carCapacity, transportNotes, driverEmployeeId, driverIds,
          selectedEmployees,
          meetingPointLocationId, jobSiteLocationId, jobSiteAddress,
        }}
        onPatch={(patch) => {
          if (patch.title !== undefined) setTitle(patch.title);
          if (patch.date !== undefined) setDate(patch.date);
          if (patch.startTime !== undefined) setStartTime(patch.startTime);
          if (patch.endTime !== undefined) setEndTime(patch.endTime);
          if (patch.slots !== undefined) setSlots(patch.slots);
          if (patch.clientId !== undefined) setClientId(patch.clientId);
          if (patch.locationId !== undefined) setLocationId(patch.locationId);
          if (patch.notes !== undefined) setNotes(patch.notes);
          if (patch.claimable !== undefined) setClaimable(patch.claimable);
          if (patch.meetingPoint !== undefined) setMeetingPoint(patch.meetingPoint);
          if (patch.specialInstructions !== undefined) setSpecialInstructions(patch.specialInstructions);
          if (patch.payType !== undefined) setPayType(patch.payType);
          if (patch.dayType !== undefined) setDayType(patch.dayType);
          if (patch.payOverride !== undefined) setPayOverride(patch.payOverride);
          if (patch.shiftAdminId !== undefined) setShiftAdminId(patch.shiftAdminId);
          if (patch.clockMethod !== undefined) setClockMethod(patch.clockMethod);
          if (patch.attendanceMode !== undefined) setAttendanceMode(patch.attendanceMode);
          if (patch.meetingTime !== undefined) setMeetingTime(patch.meetingTime);
          if (patch.transportRequired !== undefined) setTransportRequired(patch.transportRequired);
          if (patch.carCapacity !== undefined) setCarCapacity(patch.carCapacity);
          if (patch.transportNotes !== undefined) setTransportNotes(patch.transportNotes);
          if (patch.driverEmployeeId !== undefined) setDriverEmployeeId(patch.driverEmployeeId);
          if (patch.driverIds !== undefined) setDriverIds(patch.driverIds);
          if (patch.selectedEmployees !== undefined) setSelectedEmployees(patch.selectedEmployees);
          if (patch.meetingPointLocationId !== undefined) setMeetingPointLocationId(patch.meetingPointLocationId);
          if (patch.jobSiteLocationId !== undefined) setJobSiteLocationId(patch.jobSiteLocationId);
          if (patch.jobSiteAddress !== undefined) setJobSiteAddress(patch.jobSiteAddress);
        }}
        clients={clients}
        locations={locations}
        employees={employees}
        shifts={shifts}
        assignments={assignments}
        availabilityConfigs={availConfigs}
        availabilityOverrides={availOverrides}
        allowClaims={shiftsConfig.allow_claims}
        selectedCompanyId={selectedCompanyId}
        saving={saving}
        draftSaving={draftSaving}
        isDirty={Boolean(title.trim() || selectedEmployees.length > 0 || notes.trim() || clientId || locationId)}
        repeatConfig={repeatConfig}
        onRepeatChange={setRepeatConfig}
        onRequestSave={() => setConfirmOpen(true)}
        onSaveDraft={handleSaveDraft}
        onAddNewEmployee={() => setQuickAddOpen(true)}
        onAddEmergencyWorker={() => {
          const label = `${title || "Turno"} · ${date || "—"} · ${(startTime || "").slice(0,5)}–${(endTime || "").slice(0,5)}`;
          setEmergencyState({ open: true, shiftId: null, shiftLabel: label, target: "create" });
        }}
        onClientCreated={(id, name) => {
          setClients(prev => [...prev, { id, name }]);
          setClientId(id);
        }}
        onLocationCreated={(id, name, address) => {
          setLocations(prev => [...prev, { id, name, address, client_id: clientId || null }]);
          setLocationId(id);
          if (address) setMeetingPoint(address);
        }}
        draftBanner={createSession.recovered && (
          <CreateSessionRecoveryBanner
            companyName={selectedCompany?.name ?? null}
            updatedAt={createSession.recovered.updatedAt}
            onContinue={() => {
              restoreCreateDraft(createSession.recovered!.draft);
              createSession.acknowledgeRecovery();
            }}
            onDiscard={() => {
              createSession.endSession();
              resetForm();
              notifySuccess({
                title: "Creación descartada",
                fact: "Borramos la sesión de creación de turno de este dispositivo.",
                consequence: "No se creó ningún turno ni quedó nada guardado.",
              });
            }}
          />
        )}
        onKeepForLater={() => {
          createSession.saveNow();
          notifySuccess({
            title: "Guardado para después",
            fact: "Conservamos esta creación de turno tal como está.",
            consequence: "Todavía no existe ningún turno: al volver puedes continuar donde ibas.",
          });
        }}
        onDiscard={() => {
          createSession.endSession();
          notifySuccess({
            title: "Creación descartada",
            fact: "Borramos la sesión de creación de turno de este dispositivo.",
            consequence: "No se creó ningún turno ni quedó nada guardado.",
          });
        }}
      />


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
                  {(() => {
                    const locStatus = getShiftLocationStatus({
                      location_id: locationId,
                      job_site_location_id: jobSiteLocationId,
                      job_site_address: jobSiteAddress,
                      meeting_point: meetingPoint,
                      meeting_point_location_id: meetingPointLocationId,
                    });
                    const savedLoc = locations.find(l => l.id === locationId)?.name;
                    const display =
                      savedLoc ||
                      (jobSiteAddress?.trim()) ||
                      (meetingPoint?.trim() ? `Punto de encuentro: ${meetingPoint.trim()}` : null) ||
                      "Sin asignar";
                    return (
                      <p>
                        <span className="font-medium">Ubicación:</span> {display}
                        {locStatus.status === "manual_address" && (
                          <span className="ml-2 text-[10px] text-[hsl(var(--status-pending))]">· dirección manual (sin Job Site)</span>
                        )}
                      </p>
                    );
                  })()}
                  <p><span className="font-medium">Plazas:</span> {slots}</p>
                  <p><span className="font-medium">Empleados:</span> {selectedEmployees.length > 0 ? `${selectedEmployees.length} seleccionados` : "Ninguno"}</p>
                  {transportRequired && <p><span className="font-medium">Transporte:</span> Requerido • {Math.ceil((parseInt(slots) || 1) / (parseInt(carCapacity) || 5))} vehículo(s) • Conductores: {driverIds.length > 0 ? driverIds.map(id => employees.find(e => e.id === id)?.first_name || "Asignado").join(", ") : "⚠️ Sin asignar"}</p>}
                  <p><span className="font-medium">Admin turno:</span> {shiftAdminId ? employees.find(e => e.id === shiftAdminId)?.first_name || "Asignado" : "⚠️ Sin asignar"}</p>
                  {claimable && <p><span className="font-medium">Reclamable:</span> Sí</p>}
                  {notes && <p><span className="font-medium">Notas:</span> {notes}</p>}
                </div>
                {(() => {
                  const locStatus = getShiftLocationStatus({
                    location_id: locationId,
                    job_site_location_id: jobSiteLocationId,
                    job_site_address: jobSiteAddress,
                    meeting_point: meetingPoint,
                    meeting_point_location_id: meetingPointLocationId,
                  });
                  const errors: string[] = [];
                  const infos: string[] = [];
                  if (startTime >= endTime) errors.push("La hora de entrada es igual o posterior a la de salida.");
                  if (selectedEmployees.length === 0) errors.push("No se asignaron empleados.");
                  if (!clientId) errors.push("No se asignó un cliente.");
                  // Location: error only when truly nothing operational exists.
                  if (locStatus.status === "missing") {
                    errors.push("Sin ubicación asignada · agrega una dirección o selecciona un Job Site.");
                  } else if (locStatus.status === "manual_address") {
                    infos.push("Dirección manual agregada · falta guardar como Job Site para mapa/geofence.");
                  } else if (locStatus.status === "meeting_only") {
                    infos.push("Solo hay punto de encuentro · agrega la dirección del trabajo cuando puedas.");
                  }
                  if (transportRequired && driverIds.length === 0 && !driverEmployeeId) errors.push("🚗 Transporte requerido pero no se asignó ningún conductor.");
                  if (!shiftAdminId) errors.push("🛡️ No se asignó un admin/líder del turno.");
                  const slotsNum = parseInt(slots) || 1;
                  if (selectedEmployees.length > slotsNum) errors.push(`Se asignaron ${selectedEmployees.length} empleados pero solo hay ${slotsNum} plaza(s).`);
                  if (date && new Date(date + "T00:00:00") < new Date(new Date().toDateString())) errors.push("La fecha es anterior a hoy.");
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
                      errors.push(`${emp?.first_name} ${emp?.last_name} tiene conflicto con "${conflicting[0].title}" (${conflicting[0].start_time.slice(0, 5)}–${conflicting[0].end_time.slice(0, 5)}).`);
                    }
                  });
                  if (errors.length === 0 && infos.length === 0) {
                    return (
                      <p className="text-xs text-earning flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Sin advertencias detectadas.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {errors.length > 0 && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                          {errors.map((w, i) => (
                            <p key={`e-${i}`} className="flex items-start gap-1.5 text-xs text-destructive">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}
                            </p>
                          ))}
                        </div>
                      )}
                      {infos.length > 0 && (
                        <div className="rounded-lg border border-[hsl(var(--status-pending)/0.3)] bg-[hsl(var(--status-pending)/0.06)] p-3 space-y-1">
                          {infos.map((w, i) => (
                            <p key={`i-${i}`} className="flex items-start gap-1.5 text-xs text-[hsl(var(--status-pending))]">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
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
        onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetailInitialTab(undefined); }}
        initialTab={detailInitialTab}
        assignments={assignments}
        employees={employees}
        locations={locations}
        clients={clients}
        allShifts={shifts}
        canEdit={canEdit}
        onAddEmployees={handleAddEmployees}
        onRemoveAssignment={handleAssignmentRemoved}
        onEdit={(s) => { setEditShift(s); setEditOpen(true); }}
        onPublish={handlePublishShift}
        onSave={handleEditShift}
        onRequestAction={loadData}
        onDuplicate={(s) => {
          setDuplicateShift(s);
          setDuplicateSessionKey((k) => k + 1);
          setDuplicateOpen(true);
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
        onAddEmergencyWorker={({ shiftId, shiftLabel }) => {
          setEmergencyState({ open: true, shiftId, shiftLabel, target: "detail" });
        }}
        pendingPreselectId={emergencyState.target === "detail" ? emergencyPreselectId : null}
        allowClaims={shiftsConfig.allow_claims}
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
        allowClaims={shiftsConfig.allow_claims}
      />

      <VersionConflictDialog
        open={!!serviceConflict}
        conflict={serviceConflict?.info ?? null}
        entityLabel="este servicio"
        fieldLabels={SHIFT_FIELD_LABELS}
        onKeepMine={() => {
          if (!serviceConflict) return;
          const { shiftId, updates, oldShift, info } = serviceConflict;
          const serverRow = (info.serverRow ?? oldShift) as Shift;
          setServiceConflict(null);
          void handleEditShift(shiftId, updates, serverRow, info.actualVersion ?? null);
        }}
        onReload={async () => {
          if (!serviceConflict) return;
          const companyIdForRead = selectedCompanyId ?? (serviceConflict.oldShift as any).company_id ?? null;
          await reconcileServiceAfterSave(queryClient, companyIdForRead, serviceConflict.shiftId);
          setServiceConflict(null);
          await loadData();
        }}
        onCancel={() => setServiceConflict(null)}
      />


      {duplicateShift && selectedCompanyId && (
        <DuplicateShiftDialog
          key={`dup-${duplicateShift.id}-${duplicateSessionKey}`}
          open={duplicateOpen}
          onOpenChange={(o) => {
            setDuplicateOpen(o);
            if (!o) setDuplicateShift(null);
          }}
          shift={duplicateShift as any}
          assignments={
            assignments.filter((a) => a.shift_id === duplicateShift.id) as any
          }
          companyId={selectedCompanyId}
          userId={user?.id ?? null}
          defaultCopyWorkers={false}
          onDuplicated={() => {
            loadData();
          }}
        />
      )}

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

      {/* Phase 2C-A — Emergency Worker create flow (admin-only). */}
      <EmergencyWorkerDialog
        open={emergencyState.open}
        onOpenChange={(o) => setEmergencyState((s) => ({ ...s, open: o }))}
        shiftId={emergencyState.shiftId}
        shiftLabel={emergencyState.shiftLabel}
        onCreated={(worker: EmergencyWorkerCreated) => {
          loadData();
          if (emergencyState.target === "create" && createOpen) {
            setSelectedEmployees((prev) => (prev.includes(worker.id) ? prev : [...prev, worker.id]));
          }
          if (emergencyState.target === "detail") {
            setEmergencyPreselectId(worker.id);
          }
        }}
      />

      {/* Module Settings Sheet */}
      <ModuleSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Configuración de turnos"
        icon={Settings2}
        sections={shiftSettingsSections}
        config={shiftsConfig as any}
        onUpdate={(partial) => updateShiftsConfig(partial as any)}
        loading={shiftsConfigLoading}
      />

      {/* Phase 4.2 — Pre-publish review for single draft publish */}
      {pendingPublishShift && (() => {
        const s: any = pendingPublishShift;
        const client = clients.find((c) => c.id === s.client_id) || null;
        const jobLocId = s.job_site_location_id ?? s.location_id ?? null;
        const jobLoc = jobLocId ? locations.find((l) => l.id === jobLocId) : null;
        const meetingLoc = s.meeting_point_location_id
          ? locations.find((l) => l.id === s.meeting_point_location_id)
          : null;
        const assignedCount = assignments.filter(
          (a) => a.shift_id === s.id && a.status !== "rejected",
        ).length;
        const review = buildPrePublishReview({
          manualTitle: s.title ?? "",
          date: s.date ?? "",
          startTime: s.start_time ?? "",
          endTime: s.end_time ?? "",
          meetingTime: s.meeting_time ?? "",
          clientId: s.client_id ?? "",
          locationId: s.location_id ?? "",
          jobSiteLocationId: s.job_site_location_id ?? null,
          jobSiteAddress: s.job_site_address ?? "",
          meetingPoint: s.meeting_point ?? "",
          meetingPointLocationId: s.meeting_point_location_id ?? null,
          transportRequired: !!s.transportation_required,
          claimable: !!s.claimable,
          assignedCount,
          slotsNum: s.slots ?? 0,
          clientName: client?.name ?? null,
          jobSiteLabel: jobLoc?.name ?? s.job_site_address ?? null,
          meetingPointLabel: meetingLoc?.name ?? (s.meeting_point || null),
          blockers: getServicePublishReadiness({
            date: s.date ?? "",
            startTime: s.start_time ?? "",
            endTime: s.end_time ?? "",
            title: s.title ?? "",
            clientId: s.client_id ?? "",
            locationId: s.location_id ?? "",
            jobSiteLocationId: s.job_site_location_id ?? null,
            jobSiteAddress: s.job_site_address ?? "",
            meetingPoint: s.meeting_point ?? "",
            meetingPointLocationId: s.meeting_point_location_id ?? null,
            transportRequired: !!s.transportation_required,
            driverEmployeeId: s.driver_employee_id ?? null,
            driverIds: Array.isArray(s.driver_ids) ? s.driver_ids : [],
            assignedCount,
            claimable: !!s.claimable,
            requirements: {
              requireClient: shiftsConfig.require_client,
              requireLocation: shiftsConfig.require_location,
              maxShiftHours: shiftsConfig.max_shift_hours,
            },
          }).blockers,
        });
        return (
          <PrePublishDialog
            open={!!pendingPublishShift}
            onOpenChange={(o) => {
              if (!o && !publishingGated) setPendingPublishShift(null);
            }}
            data={review}
            saving={publishingGated}
            onConfirm={async () => {
              setPublishingGated(true);
              try {
                await executePublishShift(pendingPublishShift);
                setPendingPublishShift(null);
              } finally {
                setPublishingGated(false);
              }
            }}
          />
        );
      })()}

      <ExportConnecteamBulkDialog
        open={bulkExportConnecteamOpen}
        onOpenChange={setBulkExportConnecteamOpen}
        shifts={filteredShifts}
        assignments={assignments}
        employees={employees}
        clients={clients}
        locations={locations}
        selectedCompanyId={selectedCompanyId}
      />
    </div>
  );
}
