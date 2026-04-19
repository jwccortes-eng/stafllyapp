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
  Clock, MapPin, Users, Trash2, UserPlus, Send, Save, Globe, Loader2,
  CheckCircle2, XCircle, ShieldCheck, ShieldX, ShieldQuestion, Megaphone,
  MessageSquare, Bell, Smartphone, Lock, Unlock, ClipboardCheck, Car, Pencil, X,
  CalendarDays, Building2, StickyNote, UsersRound, Sparkles, Phone, MessageCircleIcon, Copy, FileText, Radar,
  AlertTriangle, Compass, History, MoreVertical,
} from "lucide-react";
import { ShiftReviewButton } from "@/components/reviews/ShiftReviewButton";
import { ShiftRidesPanel } from "./ShiftRidesPanel";
import { ShiftAttendancePanel } from "./ShiftAttendancePanel";
import { ShiftChatPanel } from "./ShiftChatPanel";
import type { AvailabilityConfig, AvailabilityOverride } from "@/hooks/useEmployeeAvailability";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import type { Shift, Assignment, Employee, SelectOption } from "./types";
import { formatShiftCode, getClientColor } from "./types";
import { SendNotificationDialog } from "./SendNotificationDialog";
import { ShiftCommentsPanel } from "./ShiftCommentsPanel";
import { ShiftAuditTrail } from "./ShiftAuditTrail";
import { ShiftRoleSlotsTeamPanel } from "./ShiftRoleSlotsTeamPanel";
import {
  pickRoleSlotsForNewAssignments,
  type ShiftRoleSlot,
  type ActiveAssignment,
} from "@/lib/service-requests/role-slot-utils";

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
  /** When false, hides all claimable UI */
  allowClaims?: boolean;
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
  shift, open, onOpenChange, assignments, employees, locations, clients, allShifts = [],
  canEdit, onAddEmployees, onRemoveAssignment, onEdit, onPublish, onSave, onRequestAction,
  onDuplicate, onDelete,
  availabilityConfigs = [], availabilityOverrides = [], onAddNewEmployee, allowClaims = true,
}: ShiftDetailDialogProps) {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("details");

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [slots, setSlots] = useState("1");
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [claimable, setClaimable] = useState(false);
  const [saving, setSaving] = useState(false);

  // Shift requests state
  const [requests, setRequests] = useState<ShiftRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [rejectReqId, setRejectReqId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<{ assignmentId: string; employeeName: string } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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
    const { error: assignErr } = await supabase.from("shift_assignments").insert({
      company_id: selectedCompanyId, shift_id: shift.id, employee_id: req.employee_id, status: "confirmed",
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
      setTitle(shift.title);
      setDate(shift.date);
      setStartTime(shift.start_time.slice(0, 5));
      setEndTime(shift.end_time.slice(0, 5));
      setSlots(String(shift.slots ?? 1));
      setClientId(shift.client_id || "");
      setLocationId(shift.location_id || "");
      setNotes(shift.notes || "");
      setClaimable(shift.claimable);
      setEditing(false);
      setTab("details");
      loadRequests();
    }
  }, [shift, open, loadRequests]);

  if (!shift) return null;

  const isLocked = shift.status === "locked";
  const effectiveCanEdit = canEdit && !isLocked;
  const shiftAssignments = assignments.filter(a => a.shift_id === shift.id);
  const assignedIds = new Set(shiftAssignments.map(a => a.employee_id));
  const unassigned = employees.filter(e => !assignedIds.has(e.id));
  const location = locations.find(l => l.id === shift.location_id);
  const client = clients.find(c => c.id === shift.client_id);
  const hoursLabel = calcHours(editing ? startTime : shift.start_time.slice(0, 5), editing ? endTime : shift.end_time.slice(0, 5));
  const clientIds = clients.map(c => c.id);
  const clientColor = getClientColor(shift.client_id, clientIds);
  const slotsNum = shift.slots ?? 1;
  const fillPercent = Math.min(100, (shiftAssignments.length / slotsNum) * 100);

  const toggleEmployee = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const handleAdd = () => {
    if (selected.length > 0) {
      onAddEmployees(shift.id, selected);
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
    onAddEmployees(shift.id, toAdd);
    setSelected([]);
    setShowAddPanel(false);
  };

  const handleConfirmAll = async () => {
    const pendingAssignments = shiftAssignments.filter(a => a.status === "pending" || a.status === "review");
    if (pendingAssignments.length === 0) {
      toast.info("Todos los empleados ya están confirmados");
      return;
    }
    for (const a of pendingAssignments) {
      await supabase.from("shift_assignments").update({ status: "confirmed" } as any).eq("id", a.id);
    }
    toast.success(`${pendingAssignments.length} empleado(s) confirmados`);
    onRequestAction?.();
  };

  const handleInlineSave = async () => {
    if (!date) return;
    if (onSave) {
      setSaving(true);
      try {
        await onSave(shift.id, {
          title: title.trim(), date, start_time: startTime, end_time: endTime,
          slots: parseInt(slots) || 1, client_id: clientId || null,
          location_id: locationId || null, notes: notes.trim() || null, claimable,
        }, shift);
        setEditing(false);
      } finally { setSaving(false); }
    } else {
      onEdit(shift);
    }
  };

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
    const { error } = await supabase.from("shift_assignments")
      .update({ status: newStatus } as any).eq("id", assignmentId);
    if (error) toast.error(error.message);
    else toast.success(`Estado actualizado a ${statusLabels[newStatus] || newStatus}`);
    setUpdatingStatus(null);
    onRequestAction?.();
  };

  const handleConfirmRemove = () => {
    if (!removeConfirm) return;
    onRemoveAssignment(removeConfirm.assignmentId);
    setRemoveConfirm(null);
  };

  const statusLabel = shift.status === "published" ? "Publicado" : shift.status === "draft" ? "Borrador" : shift.status === "locked" ? "Bloqueado" : shift.status;
  const pendingRequests = requests.filter(r => r.status === "pending").length;

  return (
    <>
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setShowAddPanel(false); setSelected([]); setEditing(false); } }}>
      <SheetContent tone="ops" side="right" hideClose>
        {/* ── PREMIUM HEADER (sticky) ── */}
        <OpsSheetHeader
          onClose={() => onOpenChange(false)}
          leading={
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center ring-1",
              clientColor.bg, clientColor.text, "ring-border/40"
            )}>
              <CalendarDays className="h-4 w-4" />
            </div>
          }
          title={
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate">{shift.title || "Turno"}</span>
              {shift.shift_code && (
                <span className="text-[9.5px] font-mono font-semibold text-muted-foreground bg-muted/60 rounded px-1.5 py-px shrink-0">
                  #{formatShiftCode(shift.shift_code)}
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
            <OpsStatusChip
              label={statusLabel}
              tone={shiftStatusToTone(shift.status)}
              size="sm"
              leading={shift.status === "locked" ? <Lock className="h-2.5 w-2.5" /> : undefined}
            />
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
              {shiftAssignments.length}/{slotsNum}
            </span>
          </div>
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

          {/* ─── DETAILS TAB ─── */}
          {tab === "details" ? (
            <div className="space-y-4">
              {editing ? (
                /* ── Inline edit mode ── */
                <div className="space-y-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground font-medium">Nombre del turno</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} className="h-9 text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground font-medium">Fecha</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Entrada</Label>
                      <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-sm mt-1" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Salida</Label>
                      <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-sm mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Cliente</Label>
                      <Select value={clientId || "none"} onValueChange={v => setClientId(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{formatDisplayText(c.name, "name")}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Ubicación</Label>
                      <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <Label className="text-[11px] text-muted-foreground font-medium">Plazas</Label>
                      <Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" className="h-9 text-sm mt-1" />
                    </div>
                    {allowClaims && (
                      <div className="flex items-center gap-2 h-9">
                        <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="detail-claimable" />
                        <Label htmlFor="detail-claimable" className="text-xs font-normal cursor-pointer">Reclamo</Label>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground font-medium">Notas</Label>
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." className="text-sm resize-none mt-1" />
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="space-y-3">
                  {/* Info cards */}
                  <div className="rounded-xl border border-border/30 bg-muted/20 divide-y divide-border/30">
                    <InfoRow icon={StickyNote} label="Nombre del turno" value={shift.title || undefined} empty="Sin nombre (solo código)" />
                    <InfoRow icon={Building2} label="Cliente" value={client ? formatDisplayText(client.name, "name") : undefined} empty="Sin asignar" />
                    <InfoRow icon={MapPin} label="Ubicación" value={location?.name} empty="Sin asignar" />
                    {(shift as any).meeting_point && (
                      <InfoRow icon={Compass} label="Dirección / Punto de encuentro" value={(shift as any).meeting_point} />
                    )}
                    <InfoRow icon={Users} label="Plazas" value={`${shiftAssignments.length} / ${slotsNum} asignados`} />
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
                </div>
              )}
            </div>

          /* ─── TEAM TAB ─── */
          ) : tab === "team" ? (
            <div className="space-y-2">
              {/* ── Staffing command bar ── */}
              {(() => {
                const confirmed = shiftAssignments.filter(a => a.status === "confirmed").length;
                const pending = shiftAssignments.filter(a => a.status === "pending" || a.status === "review").length;
                const rejected = shiftAssignments.filter(a => a.status === "rejected").length;
                const active = shiftAssignments.filter(a => a.status !== "rejected").length;
                const missing = Math.max(0, slotsNum - active);
                const over = active > slotsNum;
                const requiresCar = !!(shift as any).transportation_required;
                const hasDriver = shiftAssignments.some(a => {
                  const emp = employees.find(e => e.id === a.employee_id);
                  return emp && (emp.has_car === "Yes" || emp.has_car === "true" || emp.has_car === "Sí") && a.status !== "rejected";
                });
                const noPortalCount = shiftAssignments.filter(a => {
                  const emp = employees.find(e => e.id === a.employee_id);
                  return emp && !emp.user_id && a.status !== "rejected";
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

              {/* ── Role slots: Driver + Admin + Lead ── */}
              {(() => {
                const requiresCar = !!(shift as any).transportation_required;
                const driverAssigns = shiftAssignments.filter(a => {
                  const emp = employees.find(e => e.id === a.employee_id);
                  return emp && (emp.has_car === "Yes" || emp.has_car === "true" || emp.has_car === "Sí") && a.status !== "rejected";
                });

                return (
                  <div className="rounded-xl border border-border/20 bg-muted/10 p-2 space-y-1">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider px-1">Roles</p>
                    {/* Admin slot — always visible */}
                    {(() => {
                      const adminId = (shift as any)?.shift_admin_id;
                      const adminEmp = adminId ? employees.find(e => e.id === adminId) : null;
                      return adminEmp ? (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/[0.06] border border-primary/20">
                          <EmployeeAvatar firstName={adminEmp.first_name} lastName={adminEmp.last_name} avatarUrl={adminEmp.avatar_url} gender={adminEmp.gender} size="xs" />
                          <span className="text-[10px] font-semibold flex-1 truncate">{adminEmp.first_name} {adminEmp.last_name}</span>
                          <span className="text-[7px] font-bold text-primary bg-primary/10 px-1 rounded">ADMIN</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-dashed border-warning/30 bg-warning/[0.03]">
                          <ShieldCheck className="h-3 w-3 text-warning/50" />
                          <span className="text-[9px] text-warning font-medium">Sin admin — seleccionar en edición</span>
                        </div>
                      );
                    })()}
                    {/* Driver slot — only when transport required */}
                    {requiresCar && (
                      driverAssigns.length > 0 ? driverAssigns.map(a => {
                        const emp = employees.find(e => e.id === a.employee_id)!;
                        return (
                          <div key={a.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-earning/[0.06] border border-earning/20">
                            <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="xs" />
                            <span className="text-[10px] font-semibold flex-1 truncate">{emp.first_name} {emp.last_name}</span>
                            <span className="text-[7px] font-bold text-earning bg-earning/10 px-1 rounded">DRIVER</span>
                          </div>
                        );
                      }) : (
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-destructive/30 bg-destructive/[0.03]">
                          <Car className="h-3 w-3 text-destructive/50" />
                          <span className="text-[9px] text-destructive font-medium">Sin conductor — requerido</span>
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
                    const empIsDriver = emp.has_car === "Yes" || emp.has_car === "true" || emp.has_car === "Sí";
                    const noPortal = !emp.user_id;
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
                          <div className="flex items-center gap-1">
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
                              <span className="h-3.5 px-1 rounded bg-warning/10 text-warning text-[7px] font-bold shrink-0" title="Sin portal — no tiene cuenta activa">Sin portal</span>
                            )}
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
                        {effectiveCanEdit && selectedCompanyId && (
                          <ShiftReviewButton
                            shiftId={shift.id} companyId={selectedCompanyId}
                            reviewerType="manager" reviewerId={user?.id || ""}
                            reviewedEmployeeId={emp.id} employeeName={`${emp.first_name} ${emp.last_name}`}
                          />
                        )}
                        {effectiveCanEdit && (
                          <button
                            onClick={() => setRemoveConfirm({ assignmentId: a.id, employeeName: `${emp.first_name} ${emp.last_name}` })}
                            className="text-muted-foreground/20 hover:text-destructive transition-colors p-0.5 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
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

              {/* Claimable toggle */}
              {effectiveCanEdit && allowClaims && (
                <div className="flex items-center justify-between rounded-lg border border-border/20 bg-muted/10 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-3 w-3 text-primary" />
                    <p className="text-[10px] font-medium">Reclamo abierto</p>
                  </div>
                  <Switch
                    checked={shift.claimable}
                    onCheckedChange={async (checked) => {
                      if (onSave) await onSave(shift.id, { claimable: checked }, shift);
                    }}
                  />
                </div>
              )}
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
            <ShiftAttendancePanel shiftId={shift.id} companyId={selectedCompanyId!} assignments={assignments} employees={employees} canManage={effectiveCanEdit} shiftAdminId={(shift as any)?.shift_admin_id} />
          ) : tab === "comments" ? (
            <ShiftCommentsPanel shiftId={shift.id} companyId={selectedCompanyId!} employees={employees} />
          ) : tab === "chat" ? (
            <ShiftChatPanel shiftId={shift.id} shiftDate={shift.date} companyId={selectedCompanyId!} isAdmin={true} />
          ) : tab === "rides" ? (
            <ShiftRidesPanel shiftId={shift.id} companyId={selectedCompanyId!} assignments={assignments} employees={employees} canEdit={effectiveCanEdit} />
          ) : tab === "audit" ? (
            <ShiftAuditTrail shiftId={shift.id} />
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
            {!editing ? (
              <>
                {/* Overflow menu — secondary actions live here for a clean footer */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" aria-label="Más acciones">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar turno
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { onOpenChange(false); window.location.href = `/app/shift-ops?id=${shift.id}`; }}>
                      <Radar className="h-4 w-4 mr-2" /> Centro de operaciones
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {shift.status === "published" && (
                      <DropdownMenuItem onClick={() => setNotifyOpen(true)}>
                        <Bell className="h-4 w-4 mr-2" /> Notificar equipo
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
                            carsNeeded: Math.ceil(shiftAssigns.length / ((shift as any).car_capacity || 4)),
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
                    {onDelete && !isLocked && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteConfirm(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Eliminar turno
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Spacer pushes primary to the right edge */}
                <div className="flex-1" />

                {/* Subtle secondary — Edit. Ghost weight so primary owns the eye. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
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
                    <Bell className="h-3.5 w-3.5" /> Notificar equipo
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-8 text-xs">
                  <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={handleInlineSave} disabled={saving || !date} className="h-8 text-xs gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar cambios
                </Button>
              </>
            )}
          </OpsSheetFooter>
        )}
      </SheetContent>
    </Sheet>

    {/* Remove assignment confirmation */}
    <AlertDialog open={!!removeConfirm} onOpenChange={(o) => { if (!o) setRemoveConfirm(null); }}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" /> Confirmar eliminación
          </AlertDialogTitle>
          <AlertDialogDescription>
            ¿Remover a <strong>{removeConfirm?.employeeName}</strong> de este turno?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmRemove} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full">
            Sí, remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete shift confirmation */}
    <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" /> Eliminar turno
          </AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas eliminar el turno <strong>"{shift.title}"</strong> del{" "}
            <strong>{format(parseISO(shift.date), "d 'de' MMMM", { locale: es })}</strong>?
            Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { onDelete?.(shift); setDeleteConfirm(false); onOpenChange(false); }}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full"
          >
            Sí, eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <SendNotificationDialog open={notifyOpen} onOpenChange={setNotifyOpen} shift={shift} assignments={assignments} employees={employees} />
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
