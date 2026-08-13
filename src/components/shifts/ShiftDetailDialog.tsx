import { getShiftStaffingMetrics } from "@/lib/shifts/staffing-metrics";
import { CalendarX2 } from "lucide-react";
import { CancelShiftDialog } from "@/components/shifts/CancelShiftDialog";
import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { useServiceRootRefs } from "@/hooks/useServiceRootRefs";
import { ServiceSegmentsPanel } from "@/components/shifts/ServiceSegmentsPanel";
import { Sheet, SheetContent, SheetTitle, OpsSheetHeader, OpsSheetBody, OpsSheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Clock, MapPin, Users, Trash2, UserPlus, UserMinus, Send, Save, Globe, Loader2,
  CheckCircle2, XCircle, ShieldCheck, ShieldX, ShieldQuestion, Megaphone,
  MessageSquare, Bell, Smartphone, Lock, Unlock, ClipboardCheck, Car, Pencil, X,
  CalendarDays, Building2, StickyNote, UsersRound, Sparkles, Phone, MessageCircleIcon, Copy, FileText, Radar,
  AlertTriangle, Compass, History, MoreVertical, Map as MapIcon,
} from "lucide-react";
import { ShiftReviewButton } from "@/components/reviews/ShiftReviewButton";
import { RemoveWorkerFromShiftDialog } from "@/components/shifts/RemoveWorkerFromShiftDialog";
import { ShiftPostReviewsSection } from "@/components/reviews/ShiftPostReviewsSection";
// Heavy panels — lazy-loaded so the drawer opens fast and only pays for the
// JS chunks the user actually navigates to. Keeps realtime/queries intact;
// each panel only mounts when its tab/dialog opens.
import { lazy, Suspense } from "react";
import { ShiftShareMenu } from "./ShiftShareMenu";
import { UnstaffedAlert } from "./UnstaffedAlert";

const ShiftRidesPanel = lazy(() =>
  import("./ShiftRidesPanel").then(m => ({ default: m.ShiftRidesPanel })),
);
const ShiftAttendancePanel = lazy(() =>
  import("./ShiftAttendancePanel").then(m => ({ default: m.ShiftAttendancePanel })),
);
const ShiftChatPanel = lazy(() =>
  import("./ShiftChatPanel").then(m => ({ default: m.ShiftChatPanel })),
);
const ShiftLiveMapPanel = lazy(() => import("./ShiftLiveMapPanel"));
import type { AvailabilityConfig, AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
import { cn } from "@/lib/utils";
import { hasPortalAccess } from "@/lib/portal/portal-status";
import { formatDisplayText } from "@/lib/format-helpers";
import { searchEmployees } from "@/lib/employee-search";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { versionedAssignmentTransition } from "@/lib/data/assignment-write";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useServiceState } from "@/hooks/useServiceState";
import { useDebugMode } from "@/hooks/useDebugMode";
import { toast } from "sonner";
import type { Shift, Assignment, Employee, SelectOption } from "./types";
import { ClientIdentityPack } from "@/components/clients/ClientIdentityPack";
import { formatShiftCode, getClientColor, isEmployeeDriver } from "./types";
import { displayShiftRef } from "@/lib/shifts/shift-ref";

const SendNotificationDialog = lazy(() =>
  import("./SendNotificationDialog").then(m => ({ default: m.SendNotificationDialog })),
);
const ShiftCommentsPanel = lazy(() =>
  import("./ShiftCommentsPanel").then(m => ({ default: m.ShiftCommentsPanel })),
);
const ShiftAuditTrail = lazy(() =>
  import("./ShiftAuditTrail").then(m => ({ default: m.ShiftAuditTrail })),
);
import { ShiftRoleSlotsTeamPanel } from "./ShiftRoleSlotsTeamPanel";
import { ShiftLifecycleTimeline } from "./ShiftLifecycleTimeline";
import { CaptainNextActionCard } from "./CaptainNextActionCard";
import { LiveShiftBoard } from "./LiveShiftBoard";
import { IdentityBadges } from "@/components/employee/IdentityBadges";

import { GenerateBillingBlockButton } from "./GenerateBillingBlockButton";
import { ExportConnecteamPreviewDialog } from "./integrations/ExportConnecteamPreviewDialog";
import {
  pickRoleSlotsForNewAssignments,
  type ShiftRoleSlot,
  type ActiveAssignment,
} from "@/lib/service-requests/role-slot-utils";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

interface ShiftDetailDialogProps {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  employees: Employee[];
  locations: SelectOption[];
  clients: SelectOption[];
  allShifts?: Shift[];
  canEdit: boolean;
  onAddEmployees: (
    shiftId: string,
    employeeIds: string[],
    slotByEmployee?: Record<string, string | null>,
  ) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onEdit: (shift: Shift) => void;
  onPublish: (shift: Shift) => void;
  onSave?: (shiftId: string, updates: Partial<Shift>, oldShift: Shift) => Promise<void>;
  onRequestAction?: () => void;
  onDuplicate?: (shift: Shift) => void;
  onDelete?: (shift: Shift) => void;
  availabilityConfigs?: AvailabilityConfig[];
  availabilityOverrides?: AvailabilityOverride[];
  /** Callback when user wants to add a brand-new employee from the combobox */
  onAddNewEmployee?: () => void;
  /** Phase 2C-A — Callback when user requests to create an Emergency Worker
   *  for this shift. Parent owns the dialog + roster refresh. On success the
   *  parent should call `onEmergencyWorkerCreated(id)` to pre-select. */
  onAddEmergencyWorker?: (ctx: { shiftId: string; shiftLabel: string }) => void;
  /** Ref-like id: when set to a workerId matching this shift, the detail
   *  dialog will pre-select that worker in the assignment panel. */
  pendingPreselectId?: string | null;
  /** When false, hides all claimable UI */
  allowClaims?: boolean;
  /** Initial tab to open (e.g. "attendance" via deep-link). Defaults to "details". */
  initialTab?: string;
}

function calcHours(start: string, end: string): string {
  if (!start || !end) return "—";
  const today = "2000-01-01";
  const s = new Date(`${today}T${start}`);
  let e = new Date(`${today}T${end}`);
  if (e <= s) e = new Date(e.getTime() + 24 * 60 * 60 * 1000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

interface ShiftRequestItem {
  id: string;
  employee_id: string;
  status: string;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  employee: { first_name: string; last_name: string };
}

// ── Tab button — Linear-style: underline on active, no pill chrome ──
function TabButton({ active, onClick, children, badge }: { active: boolean; onClick: () => void; children: React.ReactNode; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-3 h-9 text-[11px] font-medium transition-colors whitespace-nowrap border-b-2 -mb-px",
        active
          ? "text-foreground border-primary"
          : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
      )}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold bg-warning text-warning-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Map shift status → OpsStatusChip tone ──
function shiftStatusToTone(status: string): OpsStatusTone {
  switch (status) {
    case "published": return "success";
    case "draft":     return "warning";
    case "locked":    return "muted";
    case "cancelled": return "critical";
    default:          return "neutral";
  }
}

export function ShiftDetailDialog({
  shift: shiftProp, open, onOpenChange, assignments, employees, locations, clients, allShifts = [],
  canEdit, onAddEmployees, onRemoveAssignment, onEdit, onPublish, onSave, onRequestAction,
  onDuplicate, onDelete,
  availabilityConfigs = [], availabilityOverrides = [], onAddNewEmployee,
  onAddEmergencyWorker, pendingPreselectId, allowClaims = true,
  initialTab,
}: ShiftDetailDialogProps) {
  const { user, canAccessAdminForCompany } = useAuth();
  const navigate = useNavigate();
  const { selectedCompanyId, selectedCompany } = useCompany();

  // P0 · SELECTED SEGMENT TRUTH — el horario visible es el segmento activo,
  // no siempre el que abrió la lista. El QK sigue siendo el del servicio raíz.
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  useEffect(() => {
    setActiveSegmentId(null);
  }, [shiftProp?.id, open]);
  const activeShiftId = activeSegmentId ?? shiftProp?.id ?? null;
  const isForeignSegment = !!activeSegmentId && activeSegmentId !== shiftProp?.id;

  // P0 SINGLE SERVICE STATE — el detalle no muestra el snapshot que la lista
  // tenía al hacer clic: lee la versión canónica (fila completa por tenant).
  const { service: canonicalShift } = useServiceState<Shift>({
    companyId: selectedCompanyId,
    shiftId: activeShiftId,
    placeholder: isForeignSegment ? null : shiftProp,
    enabled: open,
  });
  const shift = (canonicalShift ?? (isForeignSegment ? null : shiftProp)) as Shift | null;

  // P0 · SERVICE ROOT QK: la cabecera muestra el QK del servicio raíz.
  useServiceRootRefs(shift ? [shift as any] : []);

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState(initialTab || "details");
  const [connecteamExportOpen, setConnecteamExportOpen] = useState(false);
  const isAdminForTenant = canAccessAdminForCompany(selectedCompanyId);

  // Editing is now delegated to the canonical ShiftEditDialog (ShiftFormFields).
  // No local form state — this sheet is read-only and triggers `onEdit(shift)`.

  // Shift requests state
  const [requests, setRequests] = useState<ShiftRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [rejectReqId, setRejectReqId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<{
    assignmentId: string; employeeName: string; roleLabel?: string | null; statusLine?: string | null;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Phase 2C-A — When parent creates an emergency worker for this shift,
  // pre-select the id in the assignment panel and reveal it so the operator
  // can confirm the assignment in the normal flow.
  useEffect(() => {
    if (!pendingPreselectId || !shift) return;
    setSelected((prev) => (prev.includes(pendingPreselectId) ? prev : [...prev, pendingPreselectId]));
    setShowAddPanel(true);
  }, [pendingPreselectId, shift]);

  // Typed role slots (only present when shift came from a service request)
  const [roleSlots, setRoleSlots] = useState<ShiftRoleSlot[]>([]);
  const loadRoleSlots = useCallback(async () => {
    if (!shift) { setRoleSlots([]); return; }
    const { data } = await supabase
      .from("shift_role_slots" as any)
      .select("id, shift_id, role_type, role_label, quantity, sort_order")
      .eq("shift_id", shift.id)
      .order("sort_order");
    setRoleSlots((data ?? []) as unknown as ShiftRoleSlot[]);
  }, [shift]);

  const loadRequests = useCallback(async () => {
    if (!shift) return;
    setLoadingRequests(true);
    const { data } = await supabase
      .from("shift_requests")
      .select("id, employee_id, status, message, rejection_reason, created_at, employees!inner(first_name, last_name)")
      .eq("shift_id", shift.id)
      .order("created_at", { ascending: true });
    setRequests((data ?? []).map((r: any) => ({
      id: r.id, employee_id: r.employee_id, status: r.status,
      message: r.message, rejection_reason: r.rejection_reason, created_at: r.created_at,
      employee: { first_name: r.employees.first_name, last_name: r.employees.last_name },
    })));
    setLoadingRequests(false);
  }, [shift]);

  const handleApproveRequest = async (req: ShiftRequestItem) => {
    if (!shift || !selectedCompanyId) return;
    setProcessingReqId(req.id);
    const shiftAssignments = assignments.filter(a => a.shift_id === shift.id);
    const maxSlots = shift.slots ?? 1;
    const approvedRequests = requests.filter(r => r.status === "approved" && r.id !== req.id).length;
    if (shiftAssignments.length + approvedRequests >= maxSlots) {
      toast.error("No hay plazas disponibles");
      setProcessingReqId(null);
      return;
    }
    // Auto-pick a typed role slot if the shift has any (FIFO by sort_order)
    const [pickedSlotId] = pickRoleSlotsForNewAssignments(
      roleSlots,
      shiftAssignments as unknown as ActiveAssignment[],
      [req.employee_id],
    );
    const { error: assignErr } = await supabase.from("shift_assignments").insert({
      company_id: selectedCompanyId,
      shift_id: shift.id,
      employee_id: req.employee_id,
      status: "confirmed",
      role_slot_id: pickedSlotId ?? null,
    } as any);
    if (assignErr) { toast.error(assignErr.message); setProcessingReqId(null); return; }
    await supabase.from("shift_requests")
      .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
      .eq("id", req.id);
    await supabase.from("notifications").insert({
      company_id: selectedCompanyId, recipient_id: req.employee_id, recipient_type: "employee",
      type: "shift_request_approved", title: "Solicitud aprobada",
      body: `Tu solicitud para "${shift.title}" fue aprobada. Estás asignado.`,
      metadata: { shift_id: shift.id }, created_by: user?.id,
    } as any);
    toast.success(`${req.employee.first_name} aprobado y asignado`);
    setProcessingReqId(null);
    await loadRequests();
    onRequestAction?.();
  };

  const handleRejectRequest = async () => {
    if (!rejectReqId || !shift || !selectedCompanyId) return;
    const req = requests.find(r => r.id === rejectReqId);
    if (!req) return;
    setProcessingReqId(rejectReqId);
    await supabase.from("shift_requests")
      .update({ status: "rejected", rejection_reason: rejectReason.trim() || null, reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
      .eq("id", rejectReqId);
    await supabase.from("notifications").insert({
      company_id: selectedCompanyId, recipient_id: req.employee_id, recipient_type: "employee",
      type: "shift_request_rejected", title: "Solicitud rechazada",
      body: `Tu solicitud para "${shift.title}" fue rechazada.${rejectReason.trim() ? ` Motivo: ${rejectReason.trim()}` : ""}`,
      metadata: { shift_id: shift.id }, created_by: user?.id,
    } as any);
    toast.success("Solicitud rechazada");
    setProcessingReqId(null);
    setRejectReqId(null);
    setRejectReason("");
    await loadRequests();
    onRequestAction?.();
  };

  useEffect(() => {
    if (shift && open) {
      setTab(initialTab || "details");
      loadRequests();
      loadRoleSlots();
    }
  }, [shift, open, loadRequests, loadRoleSlots, initialTab]);

  // IMPORTANT: All hooks MUST be called before any early return to satisfy
  // React's Rules of Hooks. `shift` may be null while the drawer is closing —
  // we guard each memo body instead of returning early above them.
  const shiftId = shift?.id ?? null;
  // P0 — Una asignación retirada conserva su historia en la base, pero ya no
  // ocupa cupo ni aparece en el equipo del turno.
  const shiftAssignments = useMemo(
    () => (shiftId ? assignments.filter(a => a.shift_id === shiftId && a.status !== "removed") : []),
    [assignments, shiftId]
  );
  const assignedIds = useMemo(
    () => new Set(shiftAssignments.map(a => a.employee_id)),
    [shiftAssignments]
  );
  const unassigned = useMemo(
    () => employees.filter(e => !assignedIds.has(e.id)),
    [employees, assignedIds]
  );
  // Debug probe (only computed when developer/owner/admin opens with `?debug=1`).
  // `debugWorker` accepts a UUID or an `employer_identification` (e.g. `145` / `#145`).
  const { debugMode, debugWorker } = useDebugMode();

  // Compute debug probe BEFORE the `if (!shift)` early return so the
  // following `useEffect` (also above the return) can depend on it without
  // breaking Rules of Hooks. It's a pure calc, not a hook.
  const debugProbe = debugMode ? (() => {
    const probe = debugWorker?.toLowerCase() ?? null;
    const matched = probe
      ? employees.find(e =>
          e.id.toLowerCase() === probe ||
          String((e as any).employer_identification ?? "").toLowerCase() === probe,
        ) ?? null
      : null;
    const matchedId = matched?.id ?? null;
    const debugSearchQueries = debugWorker ? [debugWorker] : [];
    const debugSearches = Object.fromEntries(
      debugSearchQueries.map((query) => [
        query,
        searchEmployees(unassigned, query).slice(0, 5).map((e) => ({
          id: e.id,
          label: `${e.first_name ?? ""} ${e.last_name ?? ""}${e.employer_identification ? ` #${e.employer_identification}` : ""}`.trim(),
          matchedBy: e.__match.matchedBy,
          score: e.__match.score,
        })),
      ]),
    );
    return {
      matched,
      matchedId,
      debugSearches,
      flags: {
        matchedLabel: matched ? `${matched.first_name ?? ""} ${matched.last_name ?? ""} #${(matched as any).employer_identification ?? "—"}`.trim() : null,
        inEmployees: !!matched,
        inAssigned: matchedId ? assignedIds.has(matchedId) : false,
        inUnassigned: matchedId ? unassigned.some(e => e.id === matchedId) : false,
        conflict: null as string | null,
        unavailable: null as string | null,
      },
    };
  })() : null;

  // Debug logger — must live above the early return to keep hook order stable.
  useEffect(() => {
    if (!open || !showAddPanel || !debugMode || !shift) return;
    console.debug("[ShiftAssignDebug]", {
      selectedCompanyId,
      companyName: selectedCompany?.name ?? null,
      shiftCompanyId: (shift as any)?.company_id ?? null,
      employeesLength: employees.length,
      assignedCount: assignedIds.size,
      unassignedLength: unassigned.length,
      debugWorker,
      probe: debugProbe?.flags,
      probeSearches: debugProbe?.debugSearches,
    });
  }, [open, showAddPanel, debugMode, selectedCompanyId, selectedCompany?.name, shift, employees.length, assignedIds, unassigned.length, debugWorker, debugProbe]);

  if (!shift) return null;

  const isLocked = shift.status === "locked";
  const effectiveCanEdit = canEdit && !isLocked;

  const location = locations.find(l => l.id === shift.location_id);
  const client = clients.find(c => c.id === shift.client_id);
  const hoursLabel = calcHours(shift.start_time.slice(0, 5), shift.end_time.slice(0, 5));
  const clientIds = clients.map(c => c.id);
  const clientColor = getClientColor(shift.client_id, clientIds);
  const slotsNum = shift.slots ?? 1;
  // P0 — cobertura = asignados activos / plazas (misma regla en todas las pantallas).
  const staffing = getShiftStaffingMetrics(shiftAssignments as any[], slotsNum);
  const fillPercent = Math.min(100, staffing.coverageRatio * 100);


  /** Map [employeeId → role_slot_id|null] for the next batch of assignments,
   *  using FIFO allocation against the current state of typed role slots. */
  const buildSlotMapping = (employeeIds: string[]): Record<string, string | null> => {
    const picks = pickRoleSlotsForNewAssignments(
      roleSlots,
      shiftAssignments as unknown as ActiveAssignment[],
      employeeIds,
    );
    const map: Record<string, string | null> = {};
    employeeIds.forEach((id, idx) => { map[id] = picks[idx] ?? null; });
    return map;
  };

  const toggleEmployee = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const handleAdd = () => {
    if (selected.length > 0) {
      onAddEmployees(shift.id, selected, buildSlotMapping(selected));
      setSelected([]);
      setShowAddPanel(false);
    }
  };

  const handleAddAll = () => {
    // Add all available employees up to remaining slots
    const remaining = slotsNum - shiftAssignments.length;
    if (remaining <= 0) {
      toast.error("No hay plazas disponibles");
      return;
    }
    const toAdd = unassigned.slice(0, remaining).map(e => e.id);
    if (toAdd.length === 0) {
      toast.info("No hay empleados disponibles para asignar");
      return;
    }
    onAddEmployees(shift.id, toAdd, buildSlotMapping(toAdd));
    setSelected([]);
    setShowAddPanel(false);
  };

  const handleConfirmAll = async () => {
    const pendingAssignments = shiftAssignments.filter(a => a.status === "pending" || a.status === "review");
    if (pendingAssignments.length === 0) {
      toast.info("Todos los empleados ya están confirmados");
      return;
    }
    let confirmed = 0;
    let blocked = 0;
    for (const a of pendingAssignments) {
      // P0 — VWC Fase 3D: confirmar es transición de estado compartido.
      const result = await versionedAssignmentTransition({
        assignmentId: a.id,
        companyId: (a as any).company_id ?? null,
        transition: "confirm",
        expectedStatus: a.status ?? null,
        expectedVersion: typeof (a as any).version === "number" ? (a as any).version : null,
        reason: "confirm_all",
        surface: "shift_detail_dialog",
      });
      if (result.status === "applied") confirmed += 1;
      else blocked += 1;
    }
    if (confirmed > 0) toast.success(`${confirmed} empleado(s) confirmados`);
    if (blocked > 0) {
      toast.error("Algunos no se confirmaron", {
        description: `${blocked} cambiaron de estado mientras mirabas. Recarga y vuelve a revisar.`,
      });
    }
    onRequestAction?.();
  };

  // Inline save removed — Edit now opens the canonical ShiftEditDialog (ShiftFormFields).

  const statusColors: Record<string, string> = {
    confirmed: "text-earning", pending: "text-warning", rejected: "text-destructive", review: "text-primary",
  };
  const statusIcons: Record<string, React.ReactNode> = {
    confirmed: <ShieldCheck className="h-3.5 w-3.5 text-earning" />,
    pending: <ShieldQuestion className="h-3.5 w-3.5 text-warning" />,
    rejected: <ShieldX className="h-3.5 w-3.5 text-destructive" />,
    review: <ShieldQuestion className="h-3.5 w-3.5 text-primary" />,
  };
  const statusLabels: Record<string, string> = {
    confirmed: "Aceptado", pending: "Pendiente", rejected: "Rechazado", review: "En revisión",
  };

  const handleChangeAssignmentStatus = async (assignmentId: string, newStatus: string) => {
    setUpdatingStatus(assignmentId);
    const current = (shiftAssignments as any[]).find(a => a.id === assignmentId);
    const result = await versionedAssignmentTransition({
      assignmentId,
      companyId: current?.company_id ?? null,
      transition: "set_status",
      status: newStatus,
      expectedStatus: current?.status ?? null,
      expectedVersion: typeof current?.version === "number" ? current.version : null,
      reason: "status_changed",
      surface: "shift_detail_dialog",
    });
    if (result.status === "conflict") {
      toast.error("Alguien más ya cambió esta asignación", {
        description: `Ahora está en "${result.actualStatus ?? "otro estado"}". Recarga y vuelve a decidir.`,
      });
    } else if (result.status !== "applied") {
      toast.error(result.message);
    } else {
      toast.success(`Estado actualizado a ${statusLabels[newStatus] || newStatus}`);
    }
    setUpdatingStatus(null);
    onRequestAction?.();
  };

  // P0 — El retiro lo ejecuta la RPC canónica desde RemoveWorkerFromShiftDialog.
  // Aquí sólo se refresca la vista cuando la operación terminó.
  const handleRemoved = () => {
    const id = removeConfirm?.assignmentId;
    setRemoveConfirm(null);
    if (id) onRemoveAssignment(id);
  };


  const statusLabel = shift.status === "published" ? "Publicado" : shift.status === "draft" ? "Borrador" : shift.status === "locked" ? "Bloqueado" : shift.status;
  const pendingRequests = requests.filter(r => r.status === "pending").length;

  // Moved above the `if (!shift) return null` early return below — see top of component.


  return (
    <>
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setShowAddPanel(false); setSelected([]); } }}>
      <SheetContent tone="ops" side="right" hideClose>
        {/* ── PREMIUM HEADER (sticky) ── */}
        <OpsSheetHeader
          onClose={() => onOpenChange(false)}
          leading={
            <div
              style={clientColor.accentSoft ? { backgroundColor: clientColor.accentSoft, color: clientColor.accent } : undefined}
              className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center ring-1 ring-border/40",
                !clientColor.accentSoft && "bg-muted text-foreground",
              )}
            >
              <CalendarDays className="h-4 w-4" />
            </div>
          }
          title={
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">{shift.title || "Turno"}</span>
              {getShiftDisplayIdentity(shift).primaryRefKind !== "none" && (
                <span
                  className="text-[9.5px] font-mono font-semibold text-muted-foreground bg-muted/60 rounded px-1.5 py-px shrink-0"
                  title={
                    getShiftDisplayIdentity(shift).segmentRef
                      ? `Referencia técnica del horario: ${getShiftDisplayIdentity(shift).segmentRef}`
                      : getShiftDisplayIdentity(shift).legacyLabel ?? undefined
                  }
                >
                  {getShiftDisplayIdentity(shift).primaryRef}
                </span>
              )}
              {getShiftDisplayIdentity(shift).isServiceSegment && (
                <span className="text-[9.5px] font-semibold text-primary bg-primary/10 rounded px-1.5 py-px shrink-0">
                  {getShiftDisplayIdentity(shift).segmentLabel ?? "Horario del servicio"}
                </span>
              )}

            </div>
          }
          subtitle={
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="capitalize">{format(parseISO(shift.date), "EEE d MMM", { locale: es })}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="font-medium text-foreground/80 tabular-nums">
                {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums">{hoursLabel}</span>
              {client && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="truncate">{formatDisplayText(client.name, "name")}</span>
                </>
              )}
            </div>
          }
          rightSlot={
            <div className="flex items-center gap-1.5">
              <ShiftShareMenu
                shiftId={shift.id}
                token={(shift as Shift & { shift_link_token?: string | null }).shift_link_token}
                title={shift.title || "Turno"}
                date={shift.date}
                startTime={shift.start_time}
                endTime={shift.end_time}
                clientName={client ? client.name : null}
                jobSite={location?.name ?? null}
                meetingPoint={(shift as unknown as { meeting_point?: string | null }).meeting_point ?? null}
                meetingTime={(shift as unknown as { meeting_time?: string | null }).meeting_time ?? null}
                instructions={shift.notes}
                variant="outline"
                size="sm"
                className="h-7 px-2"
              />
              <OpsStatusChip
                label={statusLabel}
                tone={shiftStatusToTone(shift.status)}
                size="sm"
                leading={shift.status === "locked" ? <Lock className="h-2.5 w-2.5" /> : undefined}
              />
            </div>
          }
        />

        {/* ── META STRIP: location · capacity ── */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 bg-muted/15">
          {location && (
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground min-w-0">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{formatDisplayText(location.name, "name")}</span>
            </div>
          )}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[140px]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  fillPercent >= 100 ? "bg-earning" : fillPercent > 50 ? "bg-primary" : "bg-warning"
                )}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            <span className="text-[10.5px] font-semibold tabular-nums text-foreground whitespace-nowrap">
              <Users className="h-3 w-3 inline mr-0.5 -mt-0.5" />
              {staffing.assignedActive}/{slotsNum}
            </span>
          </div>
        </div>

        {/* ── Horarios del mismo servicio (mismo QK) ── */}
        <div className="px-4 pt-3 empty:hidden">
          <ServiceSegmentsPanel
            shift={shift as unknown as { id: string; parent_shift_id?: string | null }}
            companyId={(shift as unknown as { company_id?: string | null }).company_id ?? null}
          />
        </div>

        {/* ── Unstaffed import alert (FASE 1: visibilidad de imports rotos) ── */}
        <div className="px-4 pt-3">
          <UnstaffedAlert
            shift={shift}
            assignmentCount={shiftAssignments.length}
            variant="detail"
          />
        </div>

        {/* ── TAB BAR — 4 primary visible + overflow ── */}
        <div className="px-4 border-b border-border/60 bg-background">
          <div className="flex items-center gap-0">
            <TabButton active={tab === "details"} onClick={() => setTab("details")}>
              <StickyNote className="h-3 w-3" /> Detalles
            </TabButton>
            <TabButton active={tab === "team"} onClick={() => setTab("team")}>
              <UsersRound className="h-3 w-3" /> Equipo
            </TabButton>
            <TabButton active={tab === "attendance"} onClick={() => setTab("attendance")}>
              <ClipboardCheck className="h-3 w-3" /> Asistencia
            </TabButton>
            <TabButton active={tab === "livemap"} onClick={() => setTab("livemap")}>
              <MapIcon className="h-3 w-3" /> Live map
            </TabButton>
            {!!(shift as any).transportation_required && (
              <TabButton active={tab === "rides"} onClick={() => setTab("rides")}>
                <Car className="h-3 w-3" /> Rides
              </TabButton>
            )}

            {/* Overflow tabs — Solicitudes · Chat · Notas · Historial */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "relative flex items-center gap-1 px-2 h-9 text-[11px] font-medium transition-colors whitespace-nowrap border-b-2 -mb-px",
                    ["requests", "chat", "comments", "audit"].includes(tab)
                      ? "text-foreground border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
                  )}
                  aria-label="Más pestañas"
                >
                  <MoreVertical className="h-3 w-3" />
                  <span>Más</span>
                  {pendingRequests > 0 && (
                    <span className="h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold bg-warning text-warning-foreground">
                      {pendingRequests}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {requests.length > 0 && (
                  <DropdownMenuItem onClick={() => setTab("requests")}>
                    <Sparkles className="h-3.5 w-3.5 mr-2" /> Solicitudes
                    {pendingRequests > 0 && (
                      <span className="ml-auto h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold bg-warning text-warning-foreground">
                        {pendingRequests}
                      </span>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setTab("chat")}>
                  <MessageCircleIcon className="h-3.5 w-3.5 mr-2" /> Chat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("comments")}>
                  <MessageSquare className="h-3.5 w-3.5 mr-2" /> Notas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("audit")}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> Historial
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── BODY ── */}
        <OpsSheetBody>

          {/* ─── DETAILS TAB (read-only — full editing happens in ShiftEditDialog) ─── */}
          {tab === "details" ? (
            <div className="space-y-4">
              {/* Acción del encargado — captain/admin next action (read-only) */}
              <CaptainNextActionCard
                shift={{
                  id: shift.id,
                  date: shift.date,
                  start_time: shift.start_time,
                  end_time: shift.end_time,
                }}
              />

              {/* Turno en vivo — live operational board (read-only) */}
              {selectedCompanyId && (
                <LiveShiftBoard
                  shiftId={shift.id}
                  companyId={selectedCompanyId}
                  shiftDate={shift.date}
                  startTime={shift.start_time}
                  endTime={shift.end_time}
                  slots={(shift as any).slots ?? slotsNum}
                  assignments={assignments}
                  employees={employees}
                  shiftAdminId={(shift as any)?.shift_admin_id ?? null}
                />
              )}

              {/* Ciclo del turno — operational lifecycle timeline */}
              <ShiftLifecycleTimeline
                shift={{
                  id: shift.id,
                  date: shift.date,
                  start_time: shift.start_time,
                  end_time: shift.end_time,
                  slots: (shift as any).slots ?? slotsNum,
                  status: shift.status ?? null,
                  publication_status: (shift as any).publication_status ?? null,
                }}
                assignments={shiftAssignments.map(a => ({ shift_id: a.shift_id, status: a.status }))}
              />


              <div className="space-y-3">
                {/* Identidad del Cliente — mismo pack que Passport / Client Truth */}
                {client && (
                  <ClientIdentityPack
                    density="compact"
                    clientId={client.id}
                    name={formatDisplayText(client.name, "name")}
                    reference={(client as { client_code?: string | null }).client_code ?? null}
                    status={(client as { status?: string | null }).status ?? null}
                    primaryVenue={location?.name ?? null}
                  />
                )}

                {/* Info cards */}
                <div className="rounded-xl border border-border/30 bg-muted/20 divide-y divide-border/30">
                  <InfoRow icon={StickyNote} label="Nombre del turno" value={shift.title || undefined} empty="Sin nombre (solo código)" />
                  <InfoRow icon={Building2} label="Cliente" value={client ? formatDisplayText(client.name, "name") : undefined} empty="Sin asignar" />
                  <InfoRow icon={MapPin} label="Ubicación" value={location?.name} empty="Sin asignar" />
                  {(shift as any).meeting_point && (
                    <InfoRow icon={Compass} label="Dirección / Punto de encuentro" value={(shift as any).meeting_point} />
                  )}
                  <InfoRow icon={Users} label="Plazas" value={`${staffing.assignedActive} de ${slotsNum} cubiertos · ${staffing.confirmed} confirmó`} />
                </div>

                {allowClaims && shift.claimable && (
                  <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-xl px-3 py-2">
                    <Megaphone className="h-3.5 w-3.5" />
                    <span className="font-medium">Los empleados pueden reclamar este turno</span>
                  </div>
                )}

                {shift.notes && (
                  <div className="rounded-xl bg-muted/30 border border-border/20 px-3.5 py-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Notas</p>
                    <p className="text-xs text-foreground/80">{shift.notes}</p>
                  </div>
                )}

                {/* FASE 4 — Manual bridge to invoicing. UI-only lifecycle
                    gating; only produces a `pending` billable block, never an
                    invoice and never payroll. Placed after operational context
                    so it isn't read as a primary in-shift action. */}
                {canEdit && shift.client_id && (
                  <div className="rounded-xl border border-border/30 bg-muted/15 px-3 py-2.5 space-y-1.5 mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Facturación · después del cierre
                    </p>
                    <GenerateBillingBlockButton
                      shiftId={shift.id}
                      shiftDate={shift.date}
                      clientId={shift.client_id}
                    />
                  </div>
                )}

                {/* Integraciones / Exportaciones — colapsable, cerrado por defecto.
                    Solo visible para admins del tenant actual. Frontend-only:
                    no toca payroll, time_entries, attendance, schema, RLS ni edge functions. */}
                {isAdminForTenant && (
                  <details className="rounded-xl border border-border/30 bg-muted/15 group">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Integraciones · exportaciones
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 group-open:hidden">Mostrar</span>
                      <span className="text-[10px] text-muted-foreground/70 hidden group-open:inline">Ocultar</span>
                    </summary>
                    <div className="px-3 pb-3 pt-1 space-y-2">
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Exporta este turno como CSV para Connecteam mientras siga activo como sistema puente.
                        No es sincronización: payroll, asistencia y cierre operativo siguen viviendo en Stafly.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 rounded-full"
                        onClick={() => setConnecteamExportOpen(true)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Exportar a Connecteam
                      </Button>
                    </div>
                  </details>
                )}
              </div>
            </div>

          /* ─── TEAM TAB ─── */
          ) : tab === "team" ? (
            <div className="space-y-2">
              {/* ── Staffing command bar ── */}
              {(() => {
                // P0 — fuente única de cobertura/confirmación.
                const metrics = getShiftStaffingMetrics(shiftAssignments as any[], slotsNum);
                const confirmed = metrics.confirmed;
                const pending = metrics.pendingResponse;
                const rejected = metrics.rejected;
                const active = metrics.assignedActive;
                const missing = metrics.missing;
                const over = active > slotsNum;

                const requiresCar = !!(shift as any).transportation_required;
                const hasDriver = shiftAssignments.some(a => {
                  const emp = employees.find(e => e.id === a.employee_id);
                  return emp && isEmployeeDriver(emp) && a.status !== "rejected";
                });
                const noPortalCount = shiftAssignments.filter(a => {
                  const emp = employees.find(e => e.id === a.employee_id);
                  return emp && !hasPortalAccess(emp) && a.status !== "rejected";
                }).length;

                return (
                  <div className="rounded-xl border border-border/30 bg-gradient-to-br from-muted/30 to-transparent p-2.5 space-y-2">
                    {/* Counts row */}
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold tabular-nums",
                        missing === 0 && !over ? "bg-earning/10 text-earning" :
                        over ? "bg-warning/10 text-warning" :
                        active === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                      )}>
                        {active}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold truncate">
                          {missing === 0 && !over ? "Completo" :
                           over ? `Sobre-dotado (+${active - slotsNum})` :
                           active === 0 ? "Sin asignar" :
                           `Faltan ${missing}`}
                        </p>
                        <div className="h-1 bg-muted/50 rounded-full overflow-hidden mt-1">
                          <div className={cn("h-full rounded-full transition-all duration-500",
                            missing === 0 ? "bg-earning" : fillPercent > 50 ? "bg-primary" : "bg-warning"
                          )} style={{ width: `${Math.min(100, fillPercent)}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums shrink-0">
                        {active}/{slotsNum}
                      </span>
                    </div>

                    {/* Status chips + alerts — single row */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {confirmed > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-earning/10 text-earning text-[8px] font-bold">
                          <CheckCircle2 className="h-2.5 w-2.5" /> {confirmed} ok
                        </span>
                      )}
                      {pending > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[8px] font-bold">
                          <Clock className="h-2.5 w-2.5" /> {pending} pend.
                        </span>
                      )}
                      {rejected > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[8px] font-bold">
                          <XCircle className="h-2.5 w-2.5" /> {rejected}
                        </span>
                      )}
                      {requiresCar && !hasDriver && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[8px] font-bold ring-1 ring-destructive/20">
                          <Car className="h-2.5 w-2.5" /> Sin driver
                        </span>
                      )}
                      {noPortalCount > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[8px] font-bold">
                          {noPortalCount} sin portal
                        </span>
                      )}
                      {/* Quick actions inline */}
                      {effectiveCanEdit && pending > 0 && (
                        <button
                          onClick={handleConfirmAll}
                          className="ml-auto flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-earning/15 text-earning text-[8px] font-bold hover:bg-earning/25 transition-colors"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" /> Confirmar todos
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── Service-request role plan (only for converted shifts) ── */}
              {roleSlots.length > 0 && (
                <ShiftRoleSlotsTeamPanel
                  slots={roleSlots}
                  assignments={shiftAssignments as unknown as ActiveAssignment[]}
                  employees={employees}
                />
              )}

              {/* ── Role slots: Admin + Driver (highlighted summary) ──
                   These are NOT duplicate rows — they surface the people
                   playing special roles inside the assigned roster below. */}
              {(() => {
                const requiresCar = !!(shift as any).transportation_required;
                // Canonical driver = scheduled_shifts.driver_employee_id.
                // Eligible drivers = assigned workers who pass isEmployeeDriver().
                const confirmedDriverId: string | null = (shift as any).driver_employee_id ?? null;
                const confirmedDriverEmp = confirmedDriverId
                  ? employees.find(e => e.id === confirmedDriverId) ?? null
                  : null;
                const eligibleDriverAssigns = shiftAssignments.filter((a) => {
                  const emp = employees.find((e) => e.id === a.employee_id);
                  return emp && isEmployeeDriver(emp) && a.status !== "rejected";
                });
                const nonDriverAssignedNames = shiftAssignments
                  .filter((a) => a.status !== "rejected")
                  .map((a) => employees.find((e) => e.id === a.employee_id))
                  .filter((e): e is Employee => !!e && !isEmployeeDriver(e))
                  .map((e) => `${e.first_name} ${e.last_name}`);

                const assignAsDriver = async (empId: string, name: string) => {
                  const { error } = await supabase
                    .from("scheduled_shifts")
                    .update({ driver_employee_id: empId } as any)
                    .eq("id", shift.id);
                  if (error) { toast.error(error.message); return; }
                  // Patch local shift so the UI updates without refetch.
                  (shift as any).driver_employee_id = empId;
                  toast.success(`${name} asignado como conductor`);
                  onPublish({ ...(shift as any), driver_employee_id: empId });
                };

                return (
                  <div className="rounded-xl border border-border/20 bg-muted/10 p-2 space-y-1">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Roles destacados</p>
                      <p className="text-[8px] text-muted-foreground/70">Resumen — el equipo completo aparece abajo</p>
                    </div>
                    {/* Admin slot — always visible */}
                    {(() => {
                      const adminId = (shift as any)?.shift_admin_id;
                      const adminEmp = adminId ? employees.find(e => e.id === adminId) : null;
                      return adminEmp ? (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/[0.06] border border-primary/20">
                          <EmployeeAvatar firstName={adminEmp.first_name} lastName={adminEmp.last_name} avatarUrl={adminEmp.avatar_url} gender={adminEmp.gender} size="xs" />
                          <span className="text-[10px] font-semibold flex-1 truncate">{adminEmp.first_name} {adminEmp.last_name}</span>
                          <span className="text-[7px] font-bold text-primary bg-primary/10 px-1 rounded">RESPONSABLE</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-dashed border-warning/30 bg-warning/[0.03]">
                          <ShieldCheck className="h-3 w-3 text-warning/50" />
                          <span className="text-[9px] text-warning font-medium">Sin responsable — seleccionar en edición</span>
                        </div>
                      );
                    })()}
                    {/* Driver slot — only when transport required */}
                    {requiresCar && (
                      confirmedDriverEmp ? (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-earning/[0.06] border border-earning/20">
                          <EmployeeAvatar firstName={confirmedDriverEmp.first_name} lastName={confirmedDriverEmp.last_name} avatarUrl={confirmedDriverEmp.avatar_url} gender={confirmedDriverEmp.gender} size="xs" />
                          <span className="text-[10px] font-semibold flex-1 truncate">{confirmedDriverEmp.first_name} {confirmedDriverEmp.last_name}</span>
                          <span className="text-[7px] font-bold text-earning bg-earning/10 px-1 rounded">CONDUCTOR</span>
                          {effectiveCanEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[8px] text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("scheduled_shifts")
                                  .update({ driver_employee_id: null } as any)
                                  .eq("id", shift.id);
                                if (error) { toast.error(error.message); return; }
                                (shift as any).driver_employee_id = null;
                                toast.success("Conductor removido");
                                onPublish({ ...(shift as any), driver_employee_id: null });
                              }}
                            >
                              Quitar
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-destructive/30 bg-destructive/[0.04] p-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Car className="h-3 w-3 text-destructive/60 shrink-0" />
                            <span className="text-[10px] text-destructive font-semibold">Sin conductor — transporte requerido</span>
                          </div>
                          {eligibleDriverAssigns.length > 0 ? (
                            <>
                              <p className="text-[9px] text-muted-foreground leading-snug">
                                {eligibleDriverAssigns.length === 1
                                  ? `${(() => { const e = employees.find(x => x.id === eligibleDriverAssigns[0].employee_id)!; return `${e.first_name} ${e.last_name}`; })()} puede ser conductor para este turno.`
                                  : `${eligibleDriverAssigns.length} workers asignados pueden manejar — selecciona quién será el conductor.`}
                              </p>
                              {effectiveCanEdit && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {eligibleDriverAssigns.map(a => {
                                    const emp = employees.find(e => e.id === a.employee_id)!;
                                    const name = `${emp.first_name} ${emp.last_name}`;
                                    return (
                                      <Button
                                        key={a.id}
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[9px] px-2 rounded-md border-earning/40 text-earning hover:bg-earning/5"
                                        onClick={() => assignAsDriver(emp.id, name)}
                                      >
                                        <Car className="h-2.5 w-2.5 mr-1" /> Asignar a {emp.first_name} como conductor
                                      </Button>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {nonDriverAssignedNames.length > 0 ? (
                                <p className="text-[9px] text-muted-foreground leading-snug">
                                  {nonDriverAssignedNames.length === 1
                                    ? `${nonDriverAssignedNames[0]} está asignado pero no figura como conductor en su perfil.`
                                    : `${nonDriverAssignedNames.length} workers asignados — ninguno está marcado como conductor en su perfil.`}
                                  {" "}Marca a alguien como conductor en su perfil, agrega un driver, o ajusta el transporte.
                                </p>
                              ) : (
                                <p className="text-[9px] text-muted-foreground leading-snug">
                                  Asigna un worker que pueda manejar, o desactiva "transporte requerido" en la edición del turno.
                                </p>
                              )}
                              {effectiveCanEdit && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[9px] px-2 rounded-md border-destructive/30 text-destructive hover:bg-destructive/5"
                                    onClick={() => { onOpenChange(false); onEdit(shift); }}
                                  >
                                    Editar transporte
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[9px] px-2 rounded-md"
                                    onClick={() => setShowAddPanel(true)}
                                  >
                                    <UserPlus className="h-2.5 w-2.5 mr-1" /> Agregar conductor
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })()}

              {/* ── Assigned roster ── */}
              {shiftAssignments.length > 0 ? (
                <div className="space-y-0.5">
                  {shiftAssignments.map(a => {
                    const emp = employees.find(e => e.id === a.employee_id);
                    if (!emp) return null;
                    const empIsDriver = isEmployeeDriver(emp);
                    const noPortal = !hasPortalAccess(emp);
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all group",
                          a.status === "confirmed" && "border-earning/15 bg-earning/[0.02]",
                          a.status === "rejected" && "border-destructive/15 bg-destructive/[0.02] opacity-40",
                          a.status === "review" && "border-primary/15 bg-primary/[0.02]",
                          a.status === "pending" && "border-warning/15 bg-warning/[0.02]",
                        )}
                        draggable={effectiveCanEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/assignment", JSON.stringify({
                            assignmentId: a.id, employeeId: a.employee_id, fromShiftId: shift.id,
                          }));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="xs" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <p className="text-[11px] font-semibold truncate">{emp.first_name} {emp.last_name}</p>
                            {empIsDriver && (
                              <span className="h-3.5 px-1 rounded bg-earning/15 text-earning text-[7px] font-bold flex items-center shrink-0 ring-1 ring-earning/20">
                                <Car className="h-2 w-2" />
                              </span>
                            )}
                            {a.employee_id === (shift as any)?.shift_admin_id && (
                              <span className="h-3.5 px-1 rounded bg-primary/15 text-primary text-[7px] font-bold shrink-0 ring-1 ring-primary/20">ADMIN</span>
                            )}
                            {noPortal && (
                              <span className="h-3.5 px-1 rounded bg-warning/10 text-warning text-[7px] font-bold shrink-0" title="Sin portal — no tiene cuenta vinculada al portal (no depende del estado del turno)">Sin portal</span>
                            )}
                            <IdentityBadges employee={emp} size="xs" />
                          </div>
                        </div>
                        {/* Contact on hover */}
                        {emp.phone_number && (() => {
                          const ph = emp.phone_number!.replace(/[^+\d]/g, "");
                          return (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <a href={`tel:${ph}`} className="h-5 w-5 rounded flex items-center justify-center hover:bg-primary/10 text-primary" onClick={e => e.stopPropagation()}>
                                <Phone className="h-2.5 w-2.5" />
                              </a>
                              <a href={`https://wa.me/${ph.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className="h-5 w-5 rounded flex items-center justify-center hover:bg-[#25D366]/10 text-[#25D366]" onClick={e => e.stopPropagation()}>
                                <MessageCircleIcon className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          );
                        })()}
                        {effectiveCanEdit ? (
                          <Select value={a.status} onValueChange={(v) => handleChangeAssignmentStatus(a.id, v)} disabled={updatingStatus === a.id}>
                            <SelectTrigger className={cn(
                              "h-5 w-[80px] text-[8px] font-semibold border-0 gap-0.5 rounded-full px-1.5",
                              a.status === "confirmed" && "text-earning bg-earning/10",
                              a.status === "rejected" && "text-destructive bg-destructive/10",
                              a.status === "review" && "text-primary bg-primary/10",
                              a.status === "pending" && "text-warning bg-warning/10",
                            )}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="confirmed"><span className="flex items-center gap-1 text-earning font-semibold text-[10px]"><ShieldCheck className="h-3 w-3" /> Aceptado</span></SelectItem>
                              <SelectItem value="rejected"><span className="flex items-center gap-1 text-destructive font-semibold text-[10px]"><ShieldX className="h-3 w-3" /> Rechazado</span></SelectItem>
                              <SelectItem value="review"><span className="flex items-center gap-1 text-primary font-semibold text-[10px]"><ShieldQuestion className="h-3 w-3" /> En revisión</span></SelectItem>
                              <SelectItem value="pending"><span className="flex items-center gap-1 text-warning font-semibold text-[10px]"><ShieldQuestion className="h-3 w-3" /> Pendiente</span></SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn("text-[9px] font-semibold flex items-center gap-1", statusColors[a.status])}>
                            {statusIcons[a.status]}
                            {statusLabels[a.status] || a.status}
                          </span>
                        )}
                        {/* Per-row evaluate button removed — consolidated below in ShiftPostReviewsSection */}
                        {effectiveCanEdit && (
                          <button
                            onClick={() => setRemoveConfirm({
                              assignmentId: a.id,
                              employeeName: `${emp.first_name} ${emp.last_name}`,
                              roleLabel: (a as any).assignment_role === "driver" ? "Conductor" : null,
                              statusLine: a.status === "confirmed"
                                ? "Esta persona ya confirmó el turno. Se le notificará."
                                : "Esta persona está asignada pero aún no ha fichado.",
                            })}
                            title="Retirar del turno"
                            aria-label={`Retirar a ${emp.first_name} ${emp.last_name} del turno`}
                            className="text-muted-foreground/20 hover:text-destructive transition-colors p-0.5 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                          >
                            <UserMinus className="h-3 w-3" />
                          </button>

                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Users className="h-5 w-5 text-muted-foreground/30 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Sin empleados asignados</p>
                </div>
              )}

              {/* Post-shift reviews — consolidated, only after shift ends */}
              {effectiveCanEdit && selectedCompanyId && user?.id && shiftAssignments.length > 0 && (
                <ShiftPostReviewsSection
                  shiftId={shift.id}
                  companyId={selectedCompanyId}
                  reviewerUserId={user.id}
                  reviewerRole="admin"
                  shiftEndsAt={(() => {
                    try {
                      const d = shift.date as unknown as string;
                      const t = (shift.end_time as unknown as string) || "00:00:00";
                      return new Date(`${d}T${t}`);
                    } catch { return null; }
                  })()}
                  assignments={shiftAssignments}
                  employees={employees}
                />
              )}

              {/* ── Staffing picker — always visible when slots remain ── */}
              {effectiveCanEdit && (
                <>
                  {!showAddPanel ? (
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setShowAddPanel(true)}
                      className="w-full h-8 text-xs gap-1.5 rounded-xl border-dashed border-primary/30 text-primary hover:bg-primary/5"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {shiftAssignments.length < slotsNum
                        ? `Agregar (${slotsNum - shiftAssignments.length} faltan)`
                        : "Agregar empleados"}
                    </Button>
                  ) : (
                    <div className="border border-primary/20 rounded-xl p-2 space-y-1.5 bg-primary/[0.02]">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
                          <UserPlus className="h-3 w-3" />
                          Asignar trabajadores
                        </p>
                        <button onClick={() => { setShowAddPanel(false); setSelected([]); }} className="text-muted-foreground/50 hover:text-foreground p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <EmployeeCombobox
                        employees={unassigned}
                        selected={selected}
                        onToggle={toggleEmployee}
                        shifts={allShifts}
                        assignments={assignments}
                        shiftDate={shift.date}
                        shiftStart={shift.start_time.slice(0, 5)}
                        shiftEnd={shift.end_time.slice(0, 5)}
                        maxHeight="180px"
                        showChips={false}
                        availabilityConfigs={availabilityConfigs}
                        availabilityOverrides={availabilityOverrides}
                        availabilityBlockMode="warning"
                        showBulkActions
                        remainingSlots={Math.max(0, slotsNum - shiftAssignments.length)}
                        requiresDriver={!!(shift as any).transportation_required}
                        onAddNewEmployee={onAddNewEmployee}
                        onAddEmergencyWorker={
                          isAdminForTenant && shift && onAddEmergencyWorker
                            ? () => onAddEmergencyWorker({
                                shiftId: shift.id,
                                shiftLabel: `${shift.title ?? "Turno"} · ${shift.date ?? ""} · ${(shift.start_time ?? "").slice(0,5)}–${(shift.end_time ?? "").slice(0,5)}`,
                              })
                            : undefined
                        }
                        debugContext={{
                          selectedCompanyId,
                          companyName: selectedCompany?.name ?? null,
                          shiftCompanyId: (shift as any)?.company_id ?? null,
                          employeesLoaded: employees.length,
                          unassignedCount: unassigned.length,
                          assignedIds: Array.from(assignedIds),
                        }}
                        debugMode={debugMode}
                        debugWorker={debugWorker}
                        debugSearches={debugProbe?.debugSearches}
                        debugWorkerFlags={debugProbe?.flags}
                      />
                      {selected.length > 0 && (
                        <Button size="sm" onClick={handleAdd} className="w-full h-7 text-[10px] rounded-lg gap-1">
                          <UserPlus className="h-3 w-3" />
                          Asignar {selected.length}
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Claim / Reclamo block ── separated from "Notify assigned" */}
              {effectiveCanEdit && allowClaims && (() => {
                const openSlots = Math.max(0, slotsNum - shiftAssignments.length);
                const isPublished = shift.status === "published";
                const isDraft = shift.status === "draft";
                const isClaimable = !!shift.claimable;
                return (
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Megaphone className="h-3.5 w-3.5 text-primary" />
                        <p className="text-[11px] font-semibold text-foreground">Claim / Reclamo</p>
                      </div>
                      <Switch
                        checked={isClaimable}
                        onCheckedChange={async (checked) => {
                          if (onSave) await onSave(shift.id, { claimable: checked }, shift);
                        }}
                      />
                    </div>

                    {isClaimable && (
                      <>
                        {/* Slot + request stats */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="rounded-lg bg-background/60 border border-border/30 px-2 py-1.5 text-center">
                            <p className="text-[14px] font-bold tabular-nums text-foreground leading-none">{openSlots}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">Open slots</p>
                          </div>
                          <div className="rounded-lg bg-background/60 border border-border/30 px-2 py-1.5 text-center">
                            <p className="text-[14px] font-bold tabular-nums text-warning leading-none">{pendingRequests}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">Pending</p>
                          </div>
                          <div className="rounded-lg bg-background/60 border border-border/30 px-2 py-1.5 text-center">
                            <p className="text-[14px] font-bold tabular-nums text-foreground leading-none">
                              {shiftAssignments.length}<span className="text-muted-foreground font-normal">/{slotsNum}</span>
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">Filled</p>
                          </div>
                        </div>

                        {/* Status CTA — clarify publish vs open */}
                        {isDraft ? (
                          <div className="flex items-start gap-1.5 rounded-lg bg-warning/10 border border-warning/30 px-2 py-1.5">
                            <Clock className="h-3 w-3 text-warning mt-0.5 shrink-0" />
                            <p className="text-[10px] text-warning-foreground leading-tight">
                              Falta <strong>publicar</strong> el turno para que aparezca en el portal.
                            </p>
                          </div>
                        ) : isPublished ? (
                          <div className="flex items-start gap-1.5 rounded-lg bg-earning/10 border border-earning/30 px-2 py-1.5">
                            <CheckCircle2 className="h-3 w-3 text-earning mt-0.5 shrink-0" />
                            <p className="text-[10px] text-foreground/80 leading-tight">
                              Abierto para reclamo. Visible en el portal del trabajador.
                            </p>
                          </div>
                        ) : null}

                        {pendingRequests > 0 && (
                          <button
                            onClick={() => setTab("requests")}
                            className="w-full text-[10px] font-semibold text-primary hover:underline text-center py-1"
                          >
                            Revisar {pendingRequests} solicitud{pendingRequests !== 1 ? "es" : ""} →
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

          /* ─── REQUESTS TAB ─── */
          ) : tab === "requests" ? (
            <div className="space-y-3">
              {loadingRequests ? (
                <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : requests.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Sin solicitudes</p>
              ) : (
                <>
                  <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 p-4 text-center">
                    <p className="text-2xl font-bold tabular-nums font-[var(--font-heading)]">
                      {shiftAssignments.length} <span className="text-muted-foreground text-sm font-normal">/ {slotsNum}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">plazas ocupadas</p>
                  </div>
                  {requests.map(req => {
                    const isFull = shiftAssignments.length >= slotsNum;
                    return (
                      <div key={req.id} className="rounded-xl border border-border/30 bg-card p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <EmployeeAvatar firstName={req.employee.first_name} lastName={req.employee.last_name} size="sm" />
                            <div>
                              <p className="text-xs font-semibold">{req.employee.first_name} {req.employee.last_name}</p>
                              <p className="text-[10px] text-muted-foreground">{format(parseISO(req.created_at), "d MMM HH:mm", { locale: es })}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn("text-[10px] rounded-full",
                            req.status === "pending" && "bg-warning/10 text-warning border-warning/30",
                            req.status === "approved" && "bg-earning/10 text-earning border-earning/30",
                            req.status === "rejected" && "bg-destructive/10 text-destructive border-destructive/30"
                          )}>
                            {req.status === "pending" ? "Pendiente" : req.status === "approved" ? "Aprobada" : "Rechazada"}
                          </Badge>
                        </div>
                        {req.message && <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-2.5 py-1.5">"{req.message}"</p>}
                        {req.rejection_reason && req.status === "rejected" && (
                          <p className="text-[11px] text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> {req.rejection_reason}</p>
                        )}
                        {req.status === "pending" && effectiveCanEdit && (
                          <div className="flex items-center gap-2 pt-1">
                            <Button size="sm" className="h-7 text-[11px] gap-1 rounded-full" onClick={() => handleApproveRequest(req)} disabled={processingReqId === req.id || isFull}>
                              {processingReqId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              {isFull ? "Sin plazas" : "Aprobar"}
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 rounded-full text-destructive hover:text-destructive" onClick={() => { setRejectReqId(req.id); setRejectReason(""); }} disabled={processingReqId === req.id}>
                              <XCircle className="h-3 w-3" /> Rechazar
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

          ) : tab === "attendance" ? (
            <Suspense fallback={<PanelSkeleton label="Asistencia" />}>
              <ShiftAttendancePanel shiftId={shift.id} companyId={selectedCompanyId!} assignments={assignments} employees={employees} canManage={effectiveCanEdit} shiftAdminId={(shift as any)?.shift_admin_id} />
            </Suspense>
          ) : tab === "livemap" ? (
            <Suspense fallback={<PanelSkeleton label="Live map" />}>
              <ShiftLiveMapPanel
                shiftId={shift.id}
                companyId={selectedCompanyId!}
                isActiveShift
                canEdit={effectiveCanEdit}
                onSetJobSite={() => { onOpenChange(false); onEdit(shift); }}
              />
            </Suspense>
          ) : tab === "comments" ? (
            <Suspense fallback={<PanelSkeleton label="Notas" />}>
              <ShiftCommentsPanel shiftId={shift.id} companyId={selectedCompanyId!} employees={employees} />
            </Suspense>
          ) : tab === "chat" ? (
            <Suspense fallback={<PanelSkeleton label="Chat" />}>
              <ShiftChatPanel shiftId={shift.id} shiftDate={shift.date} companyId={selectedCompanyId!} />
            </Suspense>
          ) : tab === "rides" ? (
            <Suspense fallback={<PanelSkeleton label="Rides" />}>
              <ShiftRidesPanel
                shiftId={shift.id}
                companyId={selectedCompanyId!}
                assignments={assignments}
                employees={employees}
                canEdit={effectiveCanEdit}
                shiftContext={{
                  title: shift.title || "Turno",
                  date: shift.date,
                  start_time: shift.start_time,
                  shift_link_token: (shift as Shift & { shift_link_token?: string | null }).shift_link_token,
                }}
              />
            </Suspense>
          ) : tab === "audit" ? (
            <Suspense fallback={<PanelSkeleton label="Historial" />}>
              <ShiftAuditTrail shiftId={shift.id} />
            </Suspense>
          ) : null}
        </OpsSheetBody>
        {rejectReqId && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-card border border-border/30 rounded-2xl p-5 w-full max-w-sm space-y-3 shadow-xl">
              <p className="text-sm font-semibold">Rechazar solicitud</p>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo del rechazo (opcional)..." rows={3} className="text-sm resize-none" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setRejectReqId(null); setRejectReason(""); }}>Cancelar</Button>
                <Button variant="destructive" size="sm" onClick={handleRejectRequest} disabled={processingReqId === rejectReqId}>
                  {processingReqId === rejectReqId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Rechazar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── FOOTER (sticky) — 1 primary + overflow menu ── */}
        {isLocked ? (
          <OpsSheetFooter className="justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Turno bloqueado — solo lectura</span>
            </div>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={async () => {
                  const { error } = await supabase.from("scheduled_shifts")
                    .update({ status: "published" } as any)
                    .eq("id", shift.id);
                  if (error) { toast.error(error.message); return; }
                  toast.success("Turno desbloqueado");
                  onOpenChange(false);
                  onPublish({ ...shift, status: "published" });
                }}
              >
                <Unlock className="h-3.5 w-3.5" />
                Desbloquear
              </Button>
            )}
          </OpsSheetFooter>
        ) : canEdit && (
          <OpsSheetFooter>
            {/* Overflow menu — secondary actions live here for a clean footer */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" aria-label="Más acciones">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => { onOpenChange(false); onEdit(shift); }}>
                  <Pencil className="h-4 w-4 mr-2" /> {ADMIN_LEX.edit}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { const id = shift.id; onOpenChange(false); setTimeout(() => navigate(`/app/shift-ops?id=${id}`), 0); }}>
                  <Radar className="h-4 w-4 mr-2" /> Centro de operaciones
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {shift.status === "published" && (
                  <DropdownMenuItem onClick={() => setNotifyOpen(true)}>
                    <Bell className="h-4 w-4 mr-2" /> Notificar a asignados
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={async () => {
                    const empIds = shiftAssignments.map(a => a.employee_id);
                    if (empIds.length === 0) { toast.error("No hay empleados asignados."); return; }
                    const { data } = await supabase.from("employees").select("phone_number").in("id", empIds).not("phone_number", "is", null);
                    const phones = (data ?? []).map(e => e.phone_number).filter((p): p is string => !!p && p.trim().length > 0);
                    if (phones.length === 0) { toast.error("Ningún empleado tiene teléfono registrado."); return; }
                    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?";
                    window.open(`sms:${phones.join(",")}${separator}body=`, "_blank");
                  }}
                >
                  <Smartphone className="h-4 w-4 mr-2" /> Enviar SMS
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    import("@/lib/shift-pdf").then(({ downloadShiftAssignmentPDF }) => {
                      const shiftAssigns = assignments.filter(a => a.shift_id === shift.id && a.status !== "rejected" && a.status !== "removed");
                      const assignedEmps = shiftAssigns.map(a => {
                        const emp = employees.find(e => e.id === a.employee_id);
                        return { name: emp ? `${emp.first_name} ${emp.last_name}` : "—", phone: (emp as any)?.phone_number || null, role: null };
                      });
                      const clientName = clients.find(c => c.id === shift.client_id)?.name || null;
                      const locationName = locations.find(l => l.id === shift.location_id)?.name || null;
                      downloadShiftAssignmentPDF({
                        title: shift.title, date: shift.date, startTime: shift.start_time, endTime: shift.end_time,
                        clientName, locationName, meetingPoint: (shift as any).meeting_point || null,
                        transportRequired: (shift as any).transportation_required || false,
                        transportNotes: (shift as any).transportation_notes || null,
                        carsNeeded: Math.ceil(shiftAssigns.length / ((shift as any).car_capacity || 5)),
                        employees: assignedEmps, supervisorName: null,
                      });
                    });
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" /> Descargar PDF
                </DropdownMenuItem>
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => { onDuplicate(shift); onOpenChange(false); }}>
                    <Copy className="h-4 w-4 mr-2" /> Duplicar
                  </DropdownMenuItem>
                )}
                {onDelete && !isLocked && shift.status !== "cancelled" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteConfirm(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <CalendarX2 className="h-4 w-4 mr-2" /> {ADMIN_LEX.cancel}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Spacer pushes primary to the right edge */}
            <div className="flex-1" />

            {/* Subtle secondary — Edit. Opens the canonical ShiftEditDialog. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onOpenChange(false); onEdit(shift); }}
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>

            {/* SINGLE PRIMARY — Publicar (or Notificar when already published) */}
            {shift.status !== "published" ? (
              <Button
                size="sm"
                onClick={() => onPublish(shift)}
                className="h-8 text-xs gap-1.5 px-3.5 shadow-sm"
              >
                <Send className="h-3.5 w-3.5" /> Publicar
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setNotifyOpen(true)}
                className="h-8 text-xs gap-1.5 px-3.5 shadow-sm"
              >
                <Bell className="h-3.5 w-3.5" /> Notificar a asignados
              </Button>
            )}
          </OpsSheetFooter>
        )}
      </SheetContent>
    </Sheet>

    {/* P0 — Retirar del turno: misma operación canónica que móvil. */}
    <RemoveWorkerFromShiftDialog
      open={!!removeConfirm}
      onOpenChange={(o) => { if (!o) setRemoveConfirm(null); }}
      assignmentId={removeConfirm?.assignmentId ?? null}
      workerName={removeConfirm?.employeeName ?? ""}
      contextLine={[removeConfirm?.roleLabel, (shift as any)?.shift_ref ?? shift?.shift_code]
        .filter(Boolean).join(" · ") || null}
      statusLine={removeConfirm?.statusLine ?? null}
      source="desktop_shift_detail"
      onRemoved={handleRemoved}
    />


    {/* P0 — Cancelar turno: operación canónica compartida con móvil. */}
    <CancelShiftDialog
      open={deleteConfirm}
      onOpenChange={setDeleteConfirm}
      shiftId={shift.id}
      companyId={(shift as any).company_id ?? null}
      shiftRef={(shift as any).shift_ref ?? shift.shift_code ?? shift.title}
      clientLine={[client?.name, shift.title].filter(Boolean).join(" · ") || null}
      whenLine={`${format(parseISO(shift.date), "d 'de' MMMM", { locale: es })} · ${String(shift.start_time).slice(0, 5)} – ${String(shift.end_time).slice(0, 5)}`}
      requiredWorkers={slotsNum}
      assignedActive={staffing.assignedActive}
      confirmed={staffing.confirmed}
      expectedStatus={shift.status}
      source="desktop_shift_detail"
      onCancelled={() => { setDeleteConfirm(false); onOpenChange(false); onDelete?.(shift); }}
    />


    {notifyOpen && (
      <Suspense fallback={null}>
        <SendNotificationDialog
          open={notifyOpen}
          onOpenChange={setNotifyOpen}
          shift={shift}
          assignments={assignments}
          employees={employees}
          meetingPoint={(shift as any).meeting_point ?? null}
          meetingTime={(shift as any).meeting_time ?? null}
          clientName={client?.name ?? null}
          jobSiteName={location?.name ?? null}
          specialInstructions={shift.notes ?? null}
          friendlyDate={format(parseISO(shift.date), "EEE d MMM", { locale: es })}
        />
      </Suspense>
    )}

    {/* Export Connecteam v1 — admin-only preview + CSV download.
        Pure frontend: no payroll / time_entries / RLS / schema writes. */}
    <ExportConnecteamPreviewDialog
      open={connecteamExportOpen}
      onOpenChange={setConnecteamExportOpen}
      shift={shift}
      assignments={assignments}
      employees={employees}
      clients={clients}
      locations={locations}
      selectedCompanyId={selectedCompanyId ?? null}
      shiftCompanyId={(shift as any)?.company_id ?? selectedCompanyId ?? null}
    />

    {/* Phase 2C-A — Pre-select an emergency worker created from parent.
        The dialog itself lives in the parent (Shifts.tsx) so the roster
        can be refreshed after creation. */}
    
    </>
  );
}

// ── Helper component for info rows ──
function InfoRow({ icon: Icon, label, value, empty }: { icon: any; label: string; value?: string; empty?: string }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="h-7 w-7 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
        {value ? (
          <p className="text-xs font-medium text-foreground truncate">{value}</p>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">{empty || "—"}</p>
        )}
      </div>
    </div>
  );
}

// ── Premium skeleton shown while a lazy panel chunk is loading ──
function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3 animate-pulse" aria-busy="true" aria-label={`Cargando ${label}`}>
      <div className="h-4 w-32 rounded bg-muted/60" />
      <div className="h-24 w-full rounded-xl bg-muted/40" />
      <div className="h-24 w-full rounded-xl bg-muted/30" />
    </div>
  );
}
